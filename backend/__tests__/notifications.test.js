// Tests for /notifications.
//
// Written as a security sweep after the POST /admin/setup escalation, looking
// for the same class of bug: missing auth, and — more subtly — routes that
// authenticate the caller but then act on an object by id without checking who
// owns it (IDOR). notifications.js came out clean; these tests pin that shut.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Notification } = require('../models');

const ALICE = { userId: 'alice-1', email: 'alice@test.com', name: 'Alice', role: 'user', isActive: true };
const MALLORY = { userId: 'mallory-1', email: 'mallory@test.com', name: 'Mallory', role: 'user', isActive: true };

function tokenFor(user) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await User.create([{ ...ALICE, password: 'x' }, { ...MALLORY, password: 'x' }]);
});

describe('every notification route requires authentication', () => {
  const routes = [
    ['get', '/notifications'],
    ['get', '/notifications/unread-count'],
    ['get', '/notifications/stats'],
    ['put', '/notifications/read-all'],
    ['put', '/notifications/some-id/read'],
    ['delete', '/notifications/some-id'],
    ['post', '/notifications/trip-reminder'],
    ['post', '/notifications/welcome'],
  ];

  test.each(routes)('%s %s is 401 without a token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  // router.use(authenticate) covers unmatched paths under the mount too, which
  // is what keeps the legacy mock handlers in server.js unreachable.
  test('an unmatched /notifications path is still 401, not a mock payload', async () => {
    const res = await request(app).get('/notifications/unread');
    expect(res.status).toBe(401);
  });
});

describe('notifications are scoped to their owner', () => {
  async function seedFor(user, overrides = {}) {
    return Notification.create({
      userId: user.userId,
      type: 'welcome',
      message: `hello ${user.name}`,
      read: false,
      ...overrides,
    });
  }

  test('GET / returns only the caller\'s notifications', async () => {
    await seedFor(ALICE);
    await seedFor(MALLORY);

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`);

    expect(res.status).toBe(200);
    const list = Array.isArray(res.body) ? res.body : res.body.notifications;
    expect(list).toHaveLength(1);
    expect(list[0].message).toMatch(/Alice/);
  });

  test('Mallory cannot mark Alice\'s notification as read', async () => {
    const alices = await seedFor(ALICE);

    const res = await request(app)
      .put(`/notifications/${alices.notifId}/read`)
      .set('Authorization', `Bearer ${tokenFor(MALLORY)}`);

    expect(res.status).toBe(404); // not found *for this user*
    const stored = await Notification.findOne({ notifId: alices.notifId }).lean();
    expect(stored.read).toBe(false);
  });

  test('Mallory cannot delete Alice\'s notification', async () => {
    const alices = await seedFor(ALICE);

    await request(app)
      .delete(`/notifications/${alices.notifId}`)
      .set('Authorization', `Bearer ${tokenFor(MALLORY)}`);

    // Alice's row must survive regardless of the status code.
    expect(await Notification.countDocuments({ notifId: alices.notifId })).toBe(1);
  });

  test('read-all only touches the caller\'s rows', async () => {
    await seedFor(ALICE);
    const mallorys = await seedFor(MALLORY);

    const res = await request(app)
      .put('/notifications/read-all')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`);

    expect(res.status).toBe(200);
    expect((await Notification.findOne({ userId: ALICE.userId }).lean()).read).toBe(true);
    expect((await Notification.findOne({ notifId: mallorys.notifId }).lean()).read).toBe(false);
  });

  test('the owner can mark their own notification read', async () => {
    const mine = await seedFor(ALICE);

    const res = await request(app)
      .put(`/notifications/${mine.notifId}/read`)
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`);

    expect(res.status).toBe(200);
    expect((await Notification.findOne({ notifId: mine.notifId }).lean()).read).toBe(true);
  });

  test('unread-count counts only the caller\'s unread rows', async () => {
    await seedFor(ALICE);
    await seedFor(MALLORY);
    await seedFor(MALLORY);

    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/1/);
  });
});

describe('notification creation routes address the caller, never an arbitrary recipient', () => {
  test('POST /welcome creates a row for the caller only', async () => {
    const res = await request(app)
      .post('/notifications/welcome')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`)
      .send({ userName: 'Alice' });

    expect(res.status).toBe(201);
    expect(await Notification.countDocuments({ userId: ALICE.userId })).toBe(1);
    expect(await Notification.countDocuments({ userId: MALLORY.userId })).toBe(0);
  });

  test('400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/notifications/welcome')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  // recipientEmail is accepted by the route but deliberately unused — the
  // notification is in-app and always goes to req.user. This asserts it cannot
  // be steered at another account, which would make it a spam/abuse vector.
  test('POST /trip-invitation ignores recipientEmail and notifies the caller', async () => {
    const res = await request(app)
      .post('/notifications/trip-invitation')
      .set('Authorization', `Bearer ${tokenFor(ALICE)}`)
      .send({
        recipientEmail: MALLORY.email,
        tripDetails: { name: 'Trip' },
        inviterName: 'Alice',
        joinLink: 'https://example.com/join',
      });

    expect(res.status).toBe(201);
    expect(await Notification.countDocuments({ userId: MALLORY.userId })).toBe(0);
    expect(await Notification.countDocuments({ userId: ALICE.userId })).toBe(1);
  });
});
