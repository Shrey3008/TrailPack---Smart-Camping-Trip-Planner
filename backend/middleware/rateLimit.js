// Rate limiting for the authentication surface.
//
// Before this existed, /auth/login, /auth/forgot/get-question and
// /auth/forgot/verify-answer accepted unlimited attempts. Security answers are
// low-entropy by nature ("what city were you born in") and are normalised to
// lowercase before comparison, so an unthrottled /auth/forgot/verify-answer was
// brute-forceable in minutes.
//
// Two layers, deliberately:
//
//   ipLimiter          broad, per-IP. Catches someone spraying many accounts
//                      from one host.
//   credentialLimiter  tight, per-IP + per-email. Catches someone grinding a
//                      single account. Keyed on the *pair* rather than the
//                      email alone so an attacker cannot lock a victim out of
//                      their own account by burning the quota from elsewhere.
//
// Storage is in-memory, which is correct for the single Render instance this
// runs on. If the backend is ever scaled to multiple instances these limits
// become per-instance and should move to a shared store (Redis).

const { rateLimit, MemoryStore, ipKeyGenerator } = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Every store we hand out, so tests can wipe counters between cases.
const stores = [];

function buildLimiter({ windowMs, limit, keyGenerator, message }) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Count only failures. A user who logs in correctly on the fifth attempt
    // shouldn't spend the rest of their quota, and the throttle should bite
    // exactly the traffic pattern we care about: repeated rejection.
    //
    // "Failure" cannot be inferred from the status code alone here.
    // /auth/forgot/verify-answer answers 200 { success: false } for a WRONG
    // security answer — by design, so the SPA doesn't have to branch on status
    // — which means a plain skipSuccessfulRequests would skip precisely the
    // brute-force attempts we exist to stop. Routes that judge a secret
    // therefore mark rejection explicitly via res.locals.authAttemptFailed.
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode < 400 && !res.locals.authAttemptFailed,
    handler: (req, res) => {
      res.status(429).json({ message });
    },
  });
}

// Which address identifies the caller.
//
// NOT req.ip. Render fronts services with Cloudflare and its own load balancer,
// and its proxy appends to X-Forwarded-For rather than replacing it, so the
// chain arrives as:
//
//   <client>, <cloudflare edge>, <render internal>
//
// With `trust proxy: 1` Express resolves req.ip to the rightmost entry — a
// Render-internal address that changes between requests (10.31.138.132,
// 10.30.20.131, ... observed in production). Keying on it scattered each
// caller's attempts across buckets, so the throttle fired only by coincidence:
// eleven consecutive failed logins all returned 401, and RateLimit-Remaining
// oscillated 7, 6, 7, 7 instead of counting down.
//
// The leftmost X-Forwarded-For entry is the real client, but a client can send
// its own X-Forwarded-For and Render will keep it — so it is forgeable, which
// is disqualifying for a security control.
//
// cf-connecting-ip is set by Cloudflare, which overwrites any value the client
// supplies, and it holds a single address rather than a position in a list that
// shifts when a client prepends entries. Measured stable across requests where
// req.ip was not. true-client-ip is Cloudflare's enterprise alias for the same
// value and is accepted as a fallback; req.ip is the last resort so that local
// development and the test suite, which see no Cloudflare headers, still key on
// something sane.
function clientAddress(req) {
  return req.get('cf-connecting-ip') || req.get('true-client-ip') || req.ip;
}

// `ipKeyGenerator` normalises IPv6 addresses to a /56 subnet — without it a
// single IPv6 client can trivially rotate through addresses in its own prefix.
function ipKey(req) {
  return ipKeyGenerator(clientAddress(req));
}

function emailOf(req) {
  const raw = req.body && req.body.email;
  return String(raw == null ? '' : raw).toLowerCase().trim();
}

// Broad per-IP throttle for the whole auth surface.
const ipLimiter = buildLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_IP_MAX) || 40,
  keyGenerator: ipKey,
  message: 'Too many attempts from this address. Please try again in 15 minutes.',
});

// Tight per-(IP, email) throttle for endpoints that check a secret.
const credentialLimiter = buildLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.RATE_LIMIT_CREDENTIAL_MAX) || 8,
  keyGenerator: req => `${ipKey(req)}|${emailOf(req)}`,
  message: 'Too many failed attempts for this account. Please try again in 15 minutes.',
});

// Test-only helper: clear every counter. Exposed so suites that legitimately
// perform many logins don't trip the limiter, while the rate-limit tests can
// still exercise it for real.
function resetRateLimits() {
  return Promise.all(stores.map(s => s.resetAll()));
}

module.exports = { ipLimiter, credentialLimiter, resetRateLimits };
