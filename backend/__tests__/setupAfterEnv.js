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
const { resetAssignmentNotices } = require('../services/assignmentNotifier');

beforeEach(async () => {
  await resetRateLimits();
});

// Same shape of problem, opposite end of the test.
//
// services/assignmentNotifier.js coalesces item-assignment notifications behind
// a five-second timer. Any test that assigns an item without flushing leaves
// that timer armed, and it outlives the suite: it fires after afterAll has
// closed the database, notify() fails against a dead connection, and the
// resulting console.warn lands after Jest has finished. Jest reports that as
// "Cannot log after tests are done" and fails the run — with every test passing,
// which is a confusing way to find out.
//
// Clearing after each test drops pending notices without sending them. Tests
// that care about delivery flush explicitly inside the test body, and the one
// that exercises the timer itself waits for it there, so both still work.
afterEach(() => {
  resetAssignmentNotices();
});
