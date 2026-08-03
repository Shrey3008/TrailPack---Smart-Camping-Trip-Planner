// Notification scheduler — fires once a day (wired in server.js via
// node-cron at 0 9 * * *) and emails trip owners reminders 3 days
// and 1 day before their startDate.
//
// Design notes:
// - The scheduler is fail-soft by construction: every external call
//   (trip query, user lookup, dedup check, email send) is wrapped so
//   a single bad row, missing user, or SMTP hiccup never crashes the
//   cron job. The top-level run() also has a try/catch so a broken
//   DB connection still won't take the server down with it.
// - Deduplication lives in the SentReminder collection keyed by
//   `${userId}#${tripId}#${type}`, with a 30-day Mongo TTL index so
//   cleanup is automatic.
// - Reuses emailService.sendEmail() — the SMTP wrapper that handles
//   "service not configured" gracefully (returns { skipped: true }
//   instead of throwing).

const { User, Trip, SentReminder } = require('../models');
const emailService = require('./emailService');
const { notify } = require('./notify');

// Where the frontend lives (your Netlify site). Used to build the
// "Open checklist" CTA in the email body.
const FRONTEND_BASE_URL = (
  process.env.FRONTEND_BASE_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:8080'
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
    return await User.findOne({ userId }).select('-_id -__v').lean();
  } catch (err) {
    console.warn(`[scheduler] lookupUser(${userId}) failed:`, err.message);
    return null;
  }
}

async function alreadySent(notificationId) {
  try {
    const doc = await SentReminder.findOne({ notificationId }).lean();
    return Boolean(doc);
  } catch (err) {
    // If the DB is having a bad day, the safe choice is "no record" →
    // we'll attempt to send. The downside of an extra send beats
    // silently dropping reminders.
    console.warn(`[scheduler] alreadySent(${notificationId}) check failed:`, err.message);
    return false;
  }
}

async function recordSent({ notificationId, userId, tripId, type }) {
  try {
    await SentReminder.create({
      notificationId,
      userId,
      tripId,
      type,
      sentAt: new Date().toISOString(),
      // Mongo TTL index on expiresAt handles cleanup automatically.
      expiresAt: new Date(Date.now() + DEDUP_TTL_SECONDS * 1000),
    });
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
// `build` produces the email; `inApp` produces the one-line copy shown in the
// notification bell, which has no room for the full email body.
const REMINDERS = {
  3: {
    type: 'pre-trip',
    build: buildPreTripEmail,
    inApp: trip => `${trip.name} starts in 3 days — time to check your packing list.`,
  },
  1: {
    type: 'packing-nudge',
    build: buildPackingNudgeEmail,
    inApp: trip => `${trip.name} starts tomorrow. Make sure everything is packed.`,
  },
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

  // In-app notification first. It is a delivery channel in its own right, and
  // must not depend on SMTP being configured — if anything, an unconfigured
  // mail transport is exactly when the in-app copy matters most.
  await notify(userId, reminder.type, reminder.inApp(trip));

  try {
    const result = await emailService.sendEmail(user.email, subject, html, text);
    if (result && result.skipped) {
      // sendEmail returns { skipped: true } when SMTP isn't configured
      // (local dev, missing creds).
      console.log(`[scheduler] Email service not configured; would have sent ${reminder.type} to ${user.email} for trip ${tripId}`);
    } else {
      console.log(`[scheduler] Sent ${reminder.type} reminder to ${user.email} for trip ${tripId}`);
    }
  } catch (err) {
    console.error(`[scheduler] Failed to send ${reminder.type} for trip ${tripId} to ${user.email}:`, err.message);
  }

  // Dedup covers both channels, and is now recorded even when the email was
  // skipped. Previously a skip deliberately left the table untouched so a
  // later, properly configured run could retry the mail — but the in-app
  // notification has already been delivered by that point, so retrying would
  // add a duplicate row the user actually sees. A missed email is quieter than
  // a duplicated notification.
  await recordSent({ notificationId, userId, tripId, type: reminder.type });
}

// ---------- Public entry point ----------

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`[scheduler] run() starting at ${startedAt}`);
  try {
    // All trips with a startDate that aren't cancelled.
    const trips = await Trip.find({
      startDate: { $nin: [null, ''] },
      status: { $ne: 'cancelled' },
    }).select('-_id -__v').lean();
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
