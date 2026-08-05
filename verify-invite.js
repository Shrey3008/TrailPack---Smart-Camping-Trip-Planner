#!/usr/bin/env node
/**
 * End-to-end check of the invite → notification → deep link → accept flow
 * against a live backend. Same credential handling as verify-notify.js:
 * two accounts from the environment, never printed, emails masked.
 *
 *   export TRAILPACK_A_EMAIL=...      # inviter / trip owner
 *   export TRAILPACK_A_PASSWORD=...
 *   export TRAILPACK_B_EMAIL=...      # invitee — must be a different account
 *   export TRAILPACK_B_PASSWORD=...
 *   node verify-invite.js
 *
 *   --no-cleanup      keep the trip, invite and notifications this run creates
 *   --api <url>       target a different backend
 *   --frontend <url>  target a different frontend origin (for the deep-link check)
 *
 * Exit 0 only if every step passed.
 */
'use strict';

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

const API = (val('--api') || process.env.TRAILPACK_API
  || 'https://trailpack-smart-camping-trip-planner.onrender.com').replace(/\/$/, '');
// Overridable, because this is exactly the value that rots. FRONTEND_URL on
// Render still points at the retired Netlify host for the same reason — a
// frontend origin baked into a file outlives the host it names.
const FRONTEND = (val('--frontend') || process.env.TRAILPACK_FRONTEND
  || 'https://trailpack---smart-camping-trip-planner.shrey30patel.workers.dev').replace(/\/$/, '');
const CLEANUP = !flag('--no-cleanup');

const C = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', o: '\x1b[0m' }
  : { g: '', r: '', d: '', b: '', o: '' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? C.g + 'PASS' + C.o : C.r + 'FAIL' + C.o}  ${name}`);
  if (detail) console.log(`        ${C.d}${detail}${C.o}`);
}
const step = m => console.log(`\n${C.b}${m}${C.o}`);
const info = m => console.log(`  ${C.d}${m}${C.o}`);

function mask(e) {
  if (!e || !e.includes('@')) return '<invalid>';
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

async function api(method, path, { token, body, timeout = 30000, allow = [] } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok && !allow.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(parsed)}`);
  }
  return { status: res.status, body: parsed };
}

async function login(email, password, label) {
  try {
    const { body } = await api('POST', '/auth/login', { body: { email, password } });
    if (!body?.token) throw new Error('no token in response');
    return { token: body.token, userId: body.user.userId, email: body.user.email, name: body.user.name };
  } catch (e) {
    if (/429/.test(e.message)) throw new Error(`Account ${label}: rate limited (8 per IP+email / 15 min). Wait it out.`);
    if (/401/.test(e.message)) throw new Error(`Account ${label} (${mask(email)}): invalid credentials.`);
    throw e;
  }
}

async function main() {
  const need = ['TRAILPACK_A_EMAIL', 'TRAILPACK_A_PASSWORD', 'TRAILPACK_B_EMAIL', 'TRAILPACK_B_PASSWORD'];
  const missing = need.filter(k => !process.env[k]);
  if (missing.length) { console.error(`Missing: ${missing.join(', ')}`); process.exit(2); }

  const runId = Math.random().toString(36).slice(2, 8);
  console.log(`${C.b}TrailPack invite-flow verification${C.o}`);
  console.log(`${C.d}API: ${API}   run ${runId}   cleanup: ${CLEANUP ? 'on' : 'OFF'}${C.o}`);

  let A, B, tripId, notifId;
  try {
    step('Preflight');
    A = await login(process.env.TRAILPACK_A_EMAIL, process.env.TRAILPACK_A_PASSWORD, 'A');
    B = await login(process.env.TRAILPACK_B_EMAIL, process.env.TRAILPACK_B_PASSWORD, 'B');
    info(`A = ${mask(A.email)} (${A.userId})`);
    info(`B = ${mask(B.email)} (${B.userId})`);
    if (A.userId === B.userId) { console.error('\nA and B are the same account.'); process.exit(2); }

    const beforeB = new Set((await api('GET', '/notifications', { token: B.token })).body.map(n => n.notifId));

    step('1 — A creates a trip and invites B');
    const trip = await api('POST', '/trips', {
      token: A.token, timeout: 90000,
      body: { name: `invite-check ${runId}`, terrain: 'Mountain', season: 'Summer', duration: 2 },
    });
    tripId = trip.body?.trip?.tripId;
    check('trip created', !!tripId, tripId);

    const invite = await api('POST', `/trips/${tripId}/invites`, { token: A.token, body: { email: B.email } });
    check('invite created', invite.status === 201 && !!invite.body.token);

    step('2 — B receives a notification');
    const gained = (await api('GET', '/notifications', { token: B.token })).body
      .filter(n => !beforeB.has(n.notifId));
    const note = gained.find(n => n.type === 'trip-invitation' && (n.message || '').includes(runId));
    notifId = note?.notifId;

    check('B gained exactly one new notification', gained.length === 1, `got ${gained.length}`);
    check('type is trip-invitation', note?.type === 'trip-invitation');
    check('message names inviter and trip', !!note && /invited you to join/.test(note.message), note?.message);
    check('notification is unread', note?.read === false);

    step('3 — the notification carries a usable deep link');
    const link = note?.link;
    check('link is present', !!link, link);
    check('link is relative (not absolute or //)',
      !!link && !/^[a-z][a-z0-9+.-]*:/i.test(link) && !link.startsWith('//'), link);
    check('link points at accept-invite', !!link && link.startsWith('accept-invite.html?token='));

    const token = link ? new URLSearchParams(link.split('?')[1]).get('token') : null;
    check('token in link matches the invite', token === invite.body.token);

    step('4 — following the link in a browser reaches the page');
    const pageRes = await fetch(`${FRONTEND}/${link}`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    check('deep link resolves to a 200 page', pageRes.status === 200, `final: ${pageRes.url}`);
    check('token survives the .html redirect', pageRes.url.includes(`token=${token}`), pageRes.url);

    step('5 — B previews and accepts, as the page does');
    const preview = await api('GET', `/invites/${encodeURIComponent(token)}`, { token: B.token });
    check('GET /invites/:token previews for B', preview.status === 200);

    const accept = await api('POST', '/invites/accept', { token: B.token, body: { token } });
    check('accept succeeds', accept.status === 200 && accept.body.tripId === tripId);

    const shared = await api('GET', '/shared-trips/mine', { token: B.token });
    check('trip now appears in B\'s shared trips',
      (shared.body.trips || []).some(t => (t.trip?.tripId || t.tripId) === tripId));

    step('6 — the owner is told someone joined');
    const aNote = (await api('GET', '/notifications', { token: A.token })).body
      .find(n => (n.message || '').includes(runId) && /joined your trip/.test(n.message));
    check('A notified that B joined', !!aNote, aNote?.message);

  } catch (err) {
    console.error(`\n${C.r}Aborted:${C.o} ${err.message}`);
    results.push({ name: 'run completed', ok: false });
  } finally {
    if (CLEANUP && tripId) {
      step('Cleanup');
      try { await api('DELETE', `/trips/${tripId}`, { token: A.token, allow: [404] }); info(`deleted trip ${tripId}`); }
      catch (e) { info(`could not delete trip: ${e.message}`); }
      if (notifId) {
        try { await api('DELETE', `/notifications/${notifId}`, { token: B.token, allow: [404] }); info('deleted B notification'); }
        catch (_) {}
      }
    } else if (tripId) {
      step('Cleanup skipped');
      info(`kept trip ${tripId}`);
    }
  }

  const failed = results.filter(r => !r.ok);
  step('Summary');
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { failed.forEach(f => console.log(`  ${C.r}FAIL${C.o} ${f.name}`)); process.exit(1); }
  console.log(`  ${C.g}Invite flow verified end to end against ${API}${C.o}`);
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
