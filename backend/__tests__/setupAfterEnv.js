// Runs after the test framework is installed, so `beforeEach` exists here.
//
// The auth rate limiters keep counters in module-level memory that outlives an
// individual test. Without this, unrelated suites would start tripping 429s
// purely because an earlier test in the same file already spent the quota —
// and the failure would look like a bug in the route under test.
//
// Counters are *reset*, not disabled: the limiters stay wired up for every
// suite, so __tests__/rateLimit.test.js exercises the real middleware.
const { resetRateLimits } = require('../middleware/rateLimit');

beforeEach(async () => {
  await resetRateLimits();
});
