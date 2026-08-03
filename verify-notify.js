#!/usr/bin/env node
/**
 * Production verification for the in-app notify() paths.
 *
 * Checks the three call sites added in 2b0a792 against a live backend:
 *
 *   1. POST /invites/accept          -> notifies the trip OWNER
 *   2. POST /trips/:id/participants  -> notifies the ADDED PARTICIPANT
 *   3. notificationScheduler         -> time-gated, cannot be triggered on
 *                                       demand; --scheduler-fixture sets up
 *                                       the trip that will exercise it.
 *
 * Both live paths notify the *other* party and are explicitly guarded against
 * self-notification, so this needs two distinct accounts. One account testing
 * against itself produces nothing, which looks like a failure but is correct
 * behaviour.
 *
 * Credentials come from the environment and are never printed. Emails are
 * masked in all output so a transcript can be pasted somewhere safely.
 *
 *   export TRAILPACK_A_EMAIL='owner@example.com'
 *   export TRAILPACK_A_PASSWORD='...'
 *   export TRAILPACK_B_EMAIL='collaborator@example.com'
 *   export TRAILPACK_B_PASSWORD='...'
 *   node verify-notify.js
 *
 * Options:
 *   --no-cleanup           keep the trips this script creates (default: delete)
 *   --scheduler-fixture    also create a trip dated to trigger the 3-day
 *                          reminder on the next scheduler run, and keep it
 *   --api <url>            override the backend base URL
 *
 * Exit code is 0 only if every assertion passed.
 */

'use strict';

const DEFAULT_API = 'https://trailpack-smart-camping-trip-planner.onrender.com';

const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const flagValue = f => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const API = (flagValue('--api') || process.env.TRAILPACK_API || DEFAULT_API).replace(/\/$/, '');
const CLEANUP = !hasFlag('--no-cleanup');
const SCHEDULER_FIXTURE = hasFlag('--scheduler-fixture');

// Trip creation runs the Groq-backed checklist generator before responding,
// and Render's free tier cold-starts, so these are deliberately generous.
const TIMEOUT_DEFAULT = 30_000;
const TIMEOUT_TRIP_CREATE = 90_000;

// ---------- output ----------

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', bold: '', off: '' };

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  const tag = passed ? `${C.green}PASS${C.off}` : `${C.red}FAIL${C.off}`;
  console.log(`  ${tag}  ${name}`);
  if (detail) console.log(`        ${C.dim}${detail}${C.off}`);
}
const step = msg => console.log(`\n${C.bold}${msg}${C.off}`);
const info = msg => console.log(`  ${C.dim}${msg}${C.off}`);
const warn = msg => console.log(`  ${C.yellow}${msg}${C.off}`);

// Never let a full address reach stdout.
function maskEmail(email) {
  if (!email || !email.includes('@')) return '<invalid>';
  const [user, domain] = email.split('@');
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

// ---------- http ----------

class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function api(method, path, { token, body, timeout = TIMEOUT_DEFAULT, allowStatus = [] } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error(`${method} ${path} timed out after ${timeout}ms`);
    throw new Error(`${method} ${path} failed: ${err.message}`);
  }

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok && !allowStatus.includes(res.status)) throw new ApiError(method, path, res.status, parsed);
  return { status: res.status, body: parsed };
}

// ---------- helpers ----------

const RUN_ID = Math.random().toString(36).slice(2, 8);
const tripName = label => `verify-notify ${label} ${RUN_ID}`;

async function login(email, password, label) {
  let res;
  try {
    res = await api('POST', '/auth/login', { body: { email, password } });
  } catch (err) {
    if (err.status === 401) throw new Error(`Account ${label} (${maskEmail(email)}): invalid credentials.`);
    if (err.status === 429) {
      throw new Error(
        `Account ${label} (${maskEmail(email)}): rate limited. The credential throttle allows 8 attempts ` +
        `per (IP, email) per 15 minutes — wait it out rather than retrying.`
      );
    }
    throw err;
  }
  const { token, user } = res.body || {};
  if (!token || !user?.userId) throw new Error(`Account ${label}: login response missing token or userId.`);
  return { token, userId: user.userId, name: user.name, email: user.email };
}

const notifIds = list => new Set((list || []).map(n => n.notifId));

async function getNotifications(actor) {
  const { body } = await api('GET', '/notifications', { token: actor.token });
  if (!Array.isArray(body)) throw new Error('GET /notifications did not return an array');
  return body;
}

// Notifications present now that were not present in `before`.
async function newSince(actor, beforeIds) {
  const now = await getNotifications(actor);
  return now.filter(n => !beforeIds.has(n.notifId));
}

async function createTrip(actor, label, extra = {}) {
  const name = tripName(label);
  const { body } = await api('POST', '/trips', {
    token: actor.token,
    timeout: TIMEOUT_TRIP_CREATE,
    body: { name, terrain: 'Mountain', season: 'Summer', duration: 3, groupSize: 2, ...extra },
  });
  const tripId = body?.tripId || body?.trip?.tripId;
  if (!tripId) throw new Error(`Trip creation for "${label}" returned no tripId: ${JSON.stringify(body)}`);
  return { tripId, name };
}

/**
 * The scheduler runs at 09:00 America/New_York and computes daysUntil from
 * UTC midnight. At 09:00 ET the UTC date always equals the ET date, so the
 * fixture just needs a startDate three days after the next run's ET date.
 */
function schedulerFixtureDate() {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const runDate = new Date(Date.UTC(etNow.getFullYear(), etNow.getMonth(), etNow.getDate()));
  if (etNow.getHours() >= 9) runDate.setUTCDate(runDate.getUTCDate() + 1); // today's run already passed
  const target = new Date(runDate);
  target.setUTCDate(target.getUTCDate() + 3);
  return { startDate: target.toISOString().slice(0, 10), runDate: runDate.toISOString().slice(0, 10) };
}

// ---------- main ----------

async function main() {
  const required = ['TRAILPACK_A_EMAIL', 'TRAILPACK_A_PASSWORD', 'TRAILPACK_B_EMAIL', 'TRAILPACK_B_PASSWORD'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`${C.red}Missing environment variables:${C.off} ${missing.join(', ')}\n`);
    console.error('  export TRAILPACK_A_EMAIL=...      # trip owner');
    console.error('  export TRAILPACK_A_PASSWORD=...');
    console.error('  export TRAILPACK_B_EMAIL=...      # collaborator (must be a different account)');
    console.error('  export TRAILPACK_B_PASSWORD=...');
    process.exit(2);
  }

  console.log(`${C.bold}TrailPack notify() production verification${C.off}`);
  console.log(`${C.dim}API: ${API}   run id: ${RUN_ID}   cleanup: ${CLEANUP ? 'on' : 'OFF'}${C.off}`);

  const createdTrips = [];   // { actor, tripId, name }
  const createdNotifs = [];  // { actor, notifId }
  let keptFixture = null;

  try {
    // --- preflight -------------------------------------------------------
    step('Preflight');
    const health = await api('GET', '/health', { timeout: 60_000 });
    info(`/health ${health.status}, uptime ${Math.round(health.body?.uptime ?? 0)}s`);

    const A = await login(process.env.TRAILPACK_A_EMAIL, process.env.TRAILPACK_A_PASSWORD, 'A');
    const B = await login(process.env.TRAILPACK_B_EMAIL, process.env.TRAILPACK_B_PASSWORD, 'B');
    info(`A = ${maskEmail(A.email)} (${A.userId})`);
    info(`B = ${maskEmail(B.email)} (${B.userId})`);

    if (A.userId === B.userId) {
      console.error(`\n${C.red}A and B are the same account.${C.off} Both notify paths skip self-notification,`);
      console.error('so every assertion would fail for a reason that is actually correct behaviour.');
      process.exit(2);
    }
    check('Two distinct accounts', true, `${A.userId} != ${B.userId}`);

    // --- flow 1: invite accept notifies the owner ------------------------
    step('Flow 1 — B accepts an invite, A (owner) should be notified');
    const beforeA1 = notifIds(await getNotifications(A));
    const beforeB1 = notifIds(await getNotifications(B));

    const trip1 = await createTrip(A, 'invite');
    createdTrips.push({ actor: A, ...trip1 });
    info(`A created trip ${trip1.tripId}`);

    const invite = await api('POST', `/trips/${trip1.tripId}/invites`, {
      token: A.token,
      body: { email: B.email },
    });
    const inviteToken = invite.body?.token;
    if (!inviteToken) throw new Error(`Invite creation returned no token: ${JSON.stringify(invite.body)}`);
    info('A invited B');

    const accept = await api('POST', '/invites/accept', { token: B.token, body: { token: inviteToken } });
    check('B accepted the invite', accept.body?.tripId === trip1.tripId,
      `tripId ${accept.body?.tripId}`);

    const gainedA1 = await newSince(A, beforeA1);
    const gainedB1 = await newSince(B, beforeB1);
    gainedA1.forEach(n => createdNotifs.push({ actor: A, notifId: n.notifId }));
    gainedB1.forEach(n => createdNotifs.push({ actor: B, notifId: n.notifId }));

    const hit1 = gainedA1.find(n => n.message?.includes(trip1.name));
    check('Owner A received exactly one new notification', gainedA1.length === 1,
      `got ${gainedA1.length}`);
    check('Notification references this run\'s trip', Boolean(hit1),
      hit1 ? `"${hit1.message}"` : `no message contained "${trip1.name}"`);
    check('Notification type is trip-invitation', hit1?.type === 'trip-invitation',
      `type: ${hit1?.type ?? 'n/a'}`);
    check('Notification starts unread', hit1?.read === false, `read: ${hit1?.read}`);
    check('Acceptor B was NOT notified (self-notify guard)', gainedB1.length === 0,
      `got ${gainedB1.length}`);

    // --- flow 2: direct participant add notifies the target --------------
    // A separate trip: the invite endpoint rejects re-inviting an existing
    // collaborator, and reusing trip 1 would conflate the two paths.
    step('Flow 2 — A adds B directly, B (participant) should be notified');
    const beforeA2 = notifIds(await getNotifications(A));
    const beforeB2 = notifIds(await getNotifications(B));

    const trip2 = await createTrip(A, 'participant');
    createdTrips.push({ actor: A, ...trip2 });
    info(`A created trip ${trip2.tripId}`);

    await api('POST', `/trips/${trip2.tripId}/participants`, {
      token: A.token,
      body: { userId: B.userId, email: B.email, name: B.name },
    });
    info('A added B as a participant');

    const gainedA2 = await newSince(A, beforeA2);
    const gainedB2 = await newSince(B, beforeB2);
    gainedA2.forEach(n => createdNotifs.push({ actor: A, notifId: n.notifId }));
    gainedB2.forEach(n => createdNotifs.push({ actor: B, notifId: n.notifId }));

    const hit2 = gainedB2.find(n => n.message?.includes(trip2.name));
    check('Participant B received exactly one new notification', gainedB2.length === 1,
      `got ${gainedB2.length}`);
    check('Notification references this run\'s trip', Boolean(hit2),
      hit2 ? `"${hit2.message}"` : `no message contained "${trip2.name}"`);
    check('Notification type is trip-invitation', hit2?.type === 'trip-invitation',
      `type: ${hit2?.type ?? 'n/a'}`);
    check('Adder A was NOT notified (self-notify guard)', gainedA2.length === 0,
      `got ${gainedA2.length}`);

    // --- flow 3: scheduler fixture ---------------------------------------
    step('Flow 3 — scheduler (3-day reminder)');
    if (SCHEDULER_FIXTURE) {
      const { startDate, runDate } = schedulerFixtureDate();
      const endDate = new Date(`${startDate}T00:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 3);
      const fixture = await createTrip(A, 'scheduler', {
        startDate,
        endDate: endDate.toISOString().slice(0, 10),
      });
      keptFixture = { ...fixture, startDate, runDate };
      info(`Created trip ${fixture.tripId} starting ${startDate} (kept, not cleaned up)`);
      warn(`Next scheduler run: ${runDate} at 09:00 America/New_York. After it runs, expect a`);
      warn(`"pre-trip" notification for A reading: "${fixture.name} starts in 3 days ...".`);
      warn('Email stays silent (DISABLE_EMAIL=true) — the in-app row appearing anyway is the point.');
    } else {
      info('Skipped. Time-gated: it fires at 09:00 America/New_York, not on demand.');
      info('Re-run with --scheduler-fixture to create the trip that will trigger it.');
    }

  } catch (err) {
    console.error(`\n${C.red}Aborted:${C.off} ${err.message}`);
    results.push({ name: 'run completed', passed: false, detail: err.message });
  } finally {
    // --- cleanup ---------------------------------------------------------
    if (CLEANUP && (createdTrips.length || createdNotifs.length)) {
      step('Cleanup');
      for (const { actor, tripId, name } of createdTrips) {
        try {
          await api('DELETE', `/trips/${tripId}`, { token: actor.token, allowStatus: [404] });
          info(`deleted trip ${tripId} (${name})`);
        } catch (err) {
          warn(`could not delete trip ${tripId}: ${err.message}`);
        }
      }
      for (const { actor, notifId } of createdNotifs) {
        try {
          await api('DELETE', `/notifications/${notifId}`, { token: actor.token, allowStatus: [404] });
          info(`deleted notification ${notifId}`);
        } catch (err) {
          warn(`could not delete notification ${notifId}: ${err.message}`);
        }
      }
    } else if (createdTrips.length || createdNotifs.length) {
      step('Cleanup skipped (--no-cleanup)');
      createdTrips.forEach(t => info(`kept trip ${t.tripId} (${t.name})`));
      createdNotifs.forEach(n => info(`kept notification ${n.notifId}`));
    }
    if (keptFixture) info(`kept scheduler fixture trip ${keptFixture.tripId} (${keptFixture.name})`);
  }

  // --- summary -----------------------------------------------------------
  const failed = results.filter(r => !r.passed);
  step('Summary');
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach(f => console.log(`  ${C.red}FAIL${C.off} ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exit(1);
  }
  console.log(`  ${C.green}All notify() paths verified against ${API}${C.off}`);
}

main().catch(err => {
  console.error(`\n${C.red}Unexpected error:${C.off} ${err.stack || err.message}`);
  process.exit(1);
});
