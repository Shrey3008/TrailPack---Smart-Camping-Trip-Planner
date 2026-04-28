// Notification scheduler — fires once a day (wired in server.js via
// node-cron at 0 9 * * *) and emails trip owners reminders 3 days
// and 1 day before their startDate.
//
// Design notes:
// - The scheduler is fail-soft by construction: every external call
//   (DynamoDB scan, per-trip Get/Put, user lookup, email send) is
//   wrapped so a single bad row, missing user, or SES hiccup never
//   crashes the cron job. The top-level run() also has a try/catch
//   so a totally broken DDB connection still won't take the server
//   down with it.
// - Deduplication lives in DynamoDB (TrailPack-Notifications) keyed
//   by `${userId}#${tripId}#${type}`. We Get before sending; on
//   success we Put with a 30-day TTL so cleanup is automatic.
// - Reuses emailService.sendEmail() — the existing SES wrapper that
//   already handles "service not configured" gracefully (returns
//   { skipped: true } instead of throwing).

const docClient = require('../db.js');
const { ScanCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const emailService = require('./emailService');

const TRIPS_TABLE         = process.env.DYNAMODB_TABLE_NAME;
const USERS_TABLE         = process.env.DYNAMODB_USERS_TABLE        || 'TrailPack-Users';
const NOTIFICATIONS_TABLE = process.env.DYNAMODB_NOTIFICATIONS_TABLE || 'TrailPack-Notifications';

// Where the frontend lives. Used to build the "Open checklist" CTA
// in the email body. Falls back to the production S3 site so the
// link is still useful when the env var isn't configured.
const FRONTEND_BASE_URL = (
  process.env.FRONTEND_BASE_URL ||
  'http://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com'
).replace(/\/$/, '');

// 30-day TTL on dedup records — long enough that a re-trigger of the
// same window can't double-send, short enough that the table doesn't
// grow without bound.
const DEDUP_TTL_SECONDS = 30 * 24 * 60 * 60;

// Whole-day difference between today (UTC midnight) and the given
// startDate. Returns null when the date is missing/unparseable.
// Identical algorithm to emailService.daysBetweenTodayAnd so the two
// schedulers don't disagree on what "3 days out" means.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const midnightNow    = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const midnightTarget = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((midnightTarget - midnightNow) / (24 * 60 * 60 * 1000));
}

async function lookupUser(userId) {
  if (!userId) return null;
  try {
    const res = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    return res.Item || null;
  } catch (err) {
    console.warn(`[scheduler] lookupUser(${userId}) failed:`, err.message);
    return null;
  }
}

async function alreadySent(notificationId) {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: { notificationId },
    }));
    return Boolean(res.Item);
  } catch (err) {
    // If the table doesn't exist yet (cold deploy) or DDB is having a
    // bad day, the safe choice is "no record" → we'll attempt to send.
    // The downside of an extra send beats silently dropping reminders.
    console.warn(`[scheduler] alreadySent(${notificationId}) check failed:`, err.message);
    return false;
  }
}

async function recordSent({ notificationId, userId, tripId, type }) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    await docClient.send(new PutCommand({
      TableName: NOTIFICATIONS_TABLE,
      Item: {
        notificationId,
        userId,
        tripId,
        type,
        sentAt: new Date().toISOString(),
        // DynamoDB TTL is interpreted as Unix epoch seconds.
        expiresAt: nowSec + DEDUP_TTL_SECONDS,
      },
    }));
  } catch (err) {
    // Recording failure shouldn't poison the rest of the run — log
    // and keep going. The worst case is a duplicate send next time.
    console.warn(`[scheduler] recordSent(${notificationId}) failed:`, err.message);
  }
}

// ---------- Email templates ----------

function buildPreTripEmail(user, trip) {
  const userName = user.firstName || user.name || user.email || 'there';
  const checklistLink = `${FRONTEND_BASE_URL}/checklist.html?tripId=${encodeURIComponent(trip.tripId)}`;
  const subject = `🏕️ Your trip ${trip.name} starts in 3 days!`;

  const text =
`Hi ${userName},

Your camping trip "${trip.name}" to ${trip.location || 'your destination'} starts in 3 days.

Trip details:
- Terrain: ${trip.terrain || 'Not specified'}
- Season: ${trip.season || 'Not specified'}
- Duration: ${trip.duration || 1} days

Head to TrailPack to review your checklist and make sure you're fully packed!

${checklistLink}

Happy camping! 🏕️
— The TrailPack Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2a1f;">
      <h2 style="color: #1b5e20;">🏕️ Your trip starts in 3 days!</h2>
      <p>Hi ${userName},</p>
      <p>Your camping trip <strong>"${trip.name}"</strong> to ${trip.location || 'your destination'} starts in 3 days.</p>
      <h3 style="margin-top: 24px;">Trip details</h3>
      <ul style="line-height: 1.7;">
        <li><strong>Terrain:</strong> ${trip.terrain || 'Not specified'}</li>
        <li><strong>Season:</strong> ${trip.season || 'Not specified'}</li>
        <li><strong>Duration:</strong> ${trip.duration || 1} days</li>
      </ul>
      <p>Head to TrailPack to review your checklist and make sure you're fully packed!</p>
      <p style="margin: 28px 0;">
        <a href="${checklistLink}" style="background:#2e7d32;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open my checklist</a>
      </p>
      <p>Happy camping! 🏕️<br/>— The TrailPack Team</p>
    </div>`;

  return { subject, html, text };
}

function buildPackingNudgeEmail(user, trip) {
  const userName = user.firstName || user.name || user.email || 'there';
  const checklistLink = `${FRONTEND_BASE_URL}/checklist.html?tripId=${encodeURIComponent(trip.tripId)}`;
  const subject = `⏰ Trip reminder: ${trip.name} is TOMORROW!`;

  const text =
`Hi ${userName},

Just a reminder — your trip "${trip.name}" starts TOMORROW!

Make sure you've checked off everything on your packing list.

${checklistLink}

Safe travels! 🌲
— The TrailPack Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2a1f;">
      <h2 style="color: #1b5e20;">⏰ Your trip is TOMORROW!</h2>
      <p>Hi ${userName},</p>
      <p>Just a reminder — your trip <strong>"${trip.name}"</strong> starts <strong>TOMORROW</strong>!</p>
      <p>Make sure you've checked off everything on your packing list.</p>
      <p style="margin: 28px 0;">
        <a href="${checklistLink}" style="background:#2e7d32;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open my checklist</a>
      </p>
      <p>Safe travels! 🌲<br/>— The TrailPack Team</p>
    </div>`;

  return { subject, html, text };
}

// Map daysUntil → notification type + email builder. Adding a new
// window (e.g. 7 days out) is a one-line change here.
const REMINDERS = {
  3: { type: 'pre-trip',      build: buildPreTripEmail      },
  1: { type: 'packing-nudge', build: buildPackingNudgeEmail },
};

// ---------- Per-trip processing ----------

async function processTrip(trip) {
  const tripId = trip.tripId;
  const userId = trip.userId;
  if (!tripId || !userId) {
    console.warn('[scheduler] skipping trip with missing tripId/userId');
    return;
  }

  const days = daysUntil(trip.startDate);
  const reminder = days != null ? REMINDERS[days] : null;
  if (!reminder) {
    console.log(`[scheduler] No email needed for trip ${tripId} (daysUntil: ${days})`);
    return;
  }

  const notificationId = `${userId}#${tripId}#${reminder.type}`;

  if (await alreadySent(notificationId)) {
    console.log(`[scheduler] Already sent ${reminder.type} for trip ${tripId}, skipping`);
    return;
  }

  const user = await lookupUser(userId);
  if (!user || !user.email) {
    console.warn(`[scheduler] No user/email found for trip ${tripId} (userId: ${userId}), skipping`);
    return;
  }

  const { subject, html, text } = reminder.build(user, trip);

  try {
    const result = await emailService.sendEmail(user.email, subject, html, text);
    if (result && result.skipped) {
      // sendEmail returns { skipped: true } when SES/SMTP isn't
      // configured (local dev, missing creds). Don't poison the
      // dedup table in that case — let the next real run try again.
      console.log(`[scheduler] Email service not configured; would have sent ${reminder.type} to ${user.email} for trip ${tripId}`);
      return;
    }
    console.log(`[scheduler] Sent ${reminder.type} reminder to ${user.email} for trip ${tripId}`);
    await recordSent({ notificationId, userId, tripId, type: reminder.type });
  } catch (err) {
    console.error(`[scheduler] Failed to send ${reminder.type} for trip ${tripId} to ${user.email}:`, err.message);
  }
}

// ---------- Public entry point ----------

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`[scheduler] run() starting at ${startedAt}`);
  try {
    if (!TRIPS_TABLE) {
      console.warn('[scheduler] DYNAMODB_TABLE_NAME is not set; aborting run');
      return;
    }

    // Single-table scan: all trip rows have SK starting with TRIP#.
    // Filter out cancelled trips and rows missing startDate inline so
    // we don't burn time iterating them client-side.
    const res = await docClient.send(new ScanCommand({
      TableName: TRIPS_TABLE,
      FilterExpression: 'begins_with(SK, :sk) AND attribute_exists(startDate) AND (attribute_not_exists(#st) OR #st <> :cancelled)',
      ExpressionAttributeNames:  { '#st': 'status' },
      ExpressionAttributeValues: { ':sk': 'TRIP#', ':cancelled': 'cancelled' },
    }));
    const trips = res.Items || [];
    console.log(`[scheduler] scanned ${trips.length} candidate trip(s)`);

    let processed = 0;
    for (const trip of trips) {
      try {
        await processTrip(trip);
      } catch (err) {
        console.error(`[scheduler] processTrip failed for trip ${trip && trip.tripId}:`, err.message);
      }
      processed += 1;
    }

    console.log(`[scheduler] run() complete — processed ${processed} trip(s)`);
  } catch (err) {
    // Top-level guard: even a malformed scan or DDB outage must not
    // take the server down. Just log and bail.
    console.error('[scheduler] run() failed:', err.message);
  }
}

module.exports = {
  run,
  // Exposed for tests / manual triggers (e.g. an admin route or repl).
  _internals: { daysUntil, processTrip, buildPreTripEmail, buildPackingNudgeEmail },
};
