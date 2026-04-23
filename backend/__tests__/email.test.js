// Tests for emailService: pure helpers, no-op behavior when unconfigured,
// and the scheduled reminder scan against a mocked DynamoDB.
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);
const emailService = require('../services/emailService');

beforeEach(() => {
  ddbMock.reset();
});

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
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const iso = future.toISOString().slice(0, 10);
    expect(daysBetweenTodayAnd(iso)).toBe(3);
  });

  test('returns negative integers for past dates', () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const iso = past.toISOString().slice(0, 10);
    expect(daysBetweenTodayAnd(iso)).toBe(-2);
  });
});

describe('emailService.sendEmail (test env — unconfigured)', () => {
  test('returns { skipped: true } instead of throwing when not configured', async () => {
    const result = await emailService.sendEmail('x@test.com', 'Hi', '<p>Hello</p>');
    expect(result).toMatchObject({ skipped: true });
  });

  test('sendTripReminder/sendWelcomeEmail do not throw when unconfigured', async () => {
    // sendWelcomeEmail/sendTripReminder internally log with console.log — wrap to silence.
    await expect(emailService.sendWelcomeEmail('x@test.com', 'Test')).resolves.not.toThrow();
    await expect(
      emailService.sendTripReminder('x@test.com', { name: 'Trip', terrain: 'Forest', duration: 2, season: 'Summer' }, 3)
    ).resolves.not.toThrow();
  });
});

describe('emailService.checkTripReminders', () => {
  test('returns empty list when no trips match reminder windows', async () => {
    const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    ddbMock.on(ScanCommand).resolves({
      Items: [{ tripId: 't1', userId: 'u1', name: 'Far trip', startDate: far }],
    });
    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toEqual([]);
  });

  test('sends reminder for trips matching a window; skips others', async () => {
    const d1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    ddbMock.on(ScanCommand).resolves({
      Items: [
        { tripId: 'inWindow', userId: 'u1', name: 'Tomorrow', startDate: d1, terrain: 'Mountain', season: 'Summer', duration: 2 },
        { tripId: 'outOfWindow', userId: 'u2', name: 'Later', startDate: d30, terrain: 'Forest', season: 'Fall', duration: 4 },
      ],
    });
    // Owner lookup for the matching trip's userId.
    ddbMock.on(GetCommand).resolves({ Item: { userId: 'u1', email: 'owner@test.com', name: 'Owner' } });

    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tripId: 'inWindow', daysUntil: 1 });
    // Sent payload returns skipped:true in test env, but the call happened.
    expect(results[0].sent).toMatchObject({ skipped: true });
  });

  test('skips trips whose owner cannot be resolved', async () => {
    const d3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    ddbMock.on(ScanCommand).resolves({
      Items: [{ tripId: 't1', userId: 'ghost', name: 'Orphan', startDate: d3 }],
    });
    ddbMock.on(GetCommand).resolves({}); // user not found
    const results = await emailService.checkTripReminders([7, 3, 1]);
    expect(results).toEqual([]);
  });
});
