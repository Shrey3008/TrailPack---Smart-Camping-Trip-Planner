// Tests for emailService: pure helpers, no-op behavior when unconfigured,
// and the scheduled reminder scan against an in-memory MongoDB.
const db = require('./helpers/db');
const emailService = require('../services/emailService');
const { User, Trip } = require('../models');

// Trip requires terrain/season/duration.
function tripDoc(overrides = {}) {
  return {
    userId: 'u1',
    name: 'Trip',
    terrain: 'Mountain',
    season: 'Summer',
    duration: 2,
    ...overrides,
  };
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('emailService helpers', () => {
  const { daysBetweenTodayAnd } = emailService._internals;

  test('returns null for missing/invalid dates', () => {
    expect(daysBetweenTodayAnd(null)).toBeNull();
    expect(daysBetweenTodayAnd('')).toBeNull();
    expect(daysBetweenTodayAnd('not-a-date')).toBeNull();
  });

  test('returns 0 for today', () => {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    expect(daysBetweenTodayAnd(iso)).toBe(0);
  });

  test('returns positive integers for future dates', () => {
    expect(daysBetweenTodayAnd(isoDaysFromNow(3))).toBe(3);
  });

  test('returns negative integers for past dates', () => {
    expect(daysBetweenTodayAnd(isoDaysFromNow(-2))).toBe(-2);
  });
});

describe('emailService.sendEmail (test env — unconfigured)', () => {
  test('returns { skipped: true } instead of throwing when not configured', async () => {
    const result = await emailService.sendEmail('x@test.com', 'Hi', '<p>Hello</p>');
    expect(result).toMatchObject({ skipped: true });
  });

  test('sendTripReminder/sendWelcomeEmail do not throw when unconfigured', async () => {
    await expect(emailService.sendWelcomeEmail('x@test.com', 'Test')).resolves.not.toThrow();
    await expect(
      emailService.sendTripReminder('x@test.com', { name: 'Trip', terrain: 'Forest', duration: 2, season: 'Summer' }, 3)
    ).resolves.not.toThrow();
  });

  test('every wrapper returns the send outcome rather than swallowing it', async () => {
    const trip = { name: 'Trip', terrain: 'Forest', duration: 2, season: 'Summer' };
    const outcomes = await Promise.all([
      emailService.sendWelcomeEmail('x@test.com', 'Test'),
      emailService.sendTripReminder('x@test.com', trip, 3),
      emailService.sendWeatherAlert('x@test.com', trip, {}),
      emailService.sendChecklistCompletion('x@test.com', trip, { packed: 1, total: 2 }),
      emailService.sendTripInvitation('x@test.com', trip, 'Owner', 'https://example.com/accept'),
    ]);
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({ skipped: true });
    }
  });

  test('logs "Skipped", never "Sent", when the service is unconfigured', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await emailService.sendWelcomeEmail('x@test.com', 'Test');
      const lines = logSpy.mock.calls.map(args => String(args[0]));
      expect(lines.some(l => /Skipped welcome email/i.test(l))).toBe(true);
      // The old code claimed "Welcome email sent to ..." even when it no-opped.
      expect(lines.some(l => /\bSent\b/.test(l))).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('emailService.checkTripReminders', () => {
  beforeAll(() => db.connect());
  afterAll(() => db.close());
  beforeEach(() => db.clear());

  test('returns empty list when no trips match reminder windows', async () => {
    await User.create({ userId: 'u1', name: 'Owner', email: 'owner@test.com', password: 'x' });
    await Trip.create(tripDoc({ tripId: 't1', name: 'Far trip', startDate: isoDaysFromNow(30) }));

    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toEqual([]);
  });

  test('sends reminder for trips matching a window; skips others', async () => {
    await User.create({ userId: 'u1', name: 'Owner', email: 'owner@test.com', password: 'x' });
    await User.create({ userId: 'u2', name: 'Other', email: 'other@test.com', password: 'x' });
    await Trip.create([
      tripDoc({ tripId: 'inWindow', userId: 'u1', name: 'Tomorrow', startDate: isoDaysFromNow(1) }),
      tripDoc({ tripId: 'outOfWindow', userId: 'u2', name: 'Later', startDate: isoDaysFromNow(30) }),
    ]);

    const results = await emailService.checkTripReminders([7, 3, 1]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tripId: 'inWindow', daysUntil: 1 });
    // Sending is a no-op in test env, but the call must still have happened.
    expect(results[0].sent).toMatchObject({ skipped: true });
  });

  test('matches every configured window, not just the nearest one', async () => {
    await User.create({ userId: 'u1', name: 'Owner', email: 'owner@test.com', password: 'x' });
    await Trip.create([
      tripDoc({ tripId: 'in7', name: 'Week out', startDate: isoDaysFromNow(7) }),
      tripDoc({ tripId: 'in3', name: 'Three days', startDate: isoDaysFromNow(3) }),
      tripDoc({ tripId: 'in5', name: 'Five days', startDate: isoDaysFromNow(5) }), // no window
    ]);

    const results = await emailService.checkTripReminders([7, 3, 1]);
    const ids = results.map(r => r.tripId).sort();
    expect(ids).toEqual(['in3', 'in7']);
  });

  test('skips trips whose owner cannot be resolved', async () => {
    // Trip references a userId with no matching User row.
    await Trip.create(tripDoc({ tripId: 't1', userId: 'ghost', name: 'Orphan', startDate: isoDaysFromNow(3) }));

    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toEqual([]);
  });

  test('ignores trips with no start date', async () => {
    await User.create({ userId: 'u1', name: 'Owner', email: 'owner@test.com', password: 'x' });
    await Trip.create(tripDoc({ tripId: 'nodate', name: 'Undated', startDate: null }));

    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toEqual([]);
  });
});
