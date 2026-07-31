// Tests for the profile endpoints on /auth (me, profile, password).
// Backed by an in-memory MongoDB: stats are derived from real Trip/Item rows
// and password changes are verified by reading the stored hash back.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item } = require('../models');

const USER = {
  userId: 'u1',
  email: 'me@test.com',
  name: 'Me',
  role: 'user',
  isActive: true,
};

function tokenFor(user = USER) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function seedUser(overrides = {}) {
  return User.create({
    ...USER,
    password: await bcrypt.hash('current-secret', 10),
    ...overrides,
  });
}

// Trip requires terrain/season/duration, so build from a complete base.
function tripDoc(overrides = {}) {
  return {
    userId: USER.userId,
    name: 'Trip',
    terrain: 'Mountain',
    season: 'Summer',
    duration: 2,
    status: 'planned',
    ...overrides,
  };
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await seedUser();
});

describe('GET /auth/me', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns user payload + stats, never the password hash', async () => {
    await Trip.create([
      tripDoc({ tripId: 't1', name: 'Trip 1', status: 'planned' }),
      tripDoc({ tripId: 't2', name: 'Trip 2', status: 'completed' }),
    ]);
    await Item.create([
      { tripId: 't1', name: 'Boots', packed: true },
      { tripId: 't1', name: 'Socks', packed: false },
      { tripId: 't2', name: 'Tent', packed: true },
    ]);

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      userId: USER.userId,
      email: USER.email,
      name: USER.name,
      role: USER.role,
    });
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.stats).toMatchObject({
      totalTrips: 2,
      completedTrips: 1,
      totalItemsPacked: 2,
    });
    expect(res.body.user.stats.joinedAt).toBeTruthy();
  });

  test('reports zeroed stats for a user with no trips', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.user.stats).toMatchObject({
      totalTrips: 0,
      completedTrips: 0,
      totalItemsPacked: 0,
    });
  });

  test("does not count another user's trips", async () => {
    await User.create({ userId: 'other', name: 'Other', email: 'other@test.com', password: 'x' });
    await Trip.create(tripDoc({ tripId: 't9', userId: 'other', name: 'Not Mine', status: 'completed' }));

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.body.user.stats.totalTrips).toBe(0);
  });
});

describe('PUT /auth/profile', () => {
  test('401 without token', async () => {
    const res = await request(app).put('/auth/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  test('400 when no updatable fields provided', async () => {
    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('accepts name + phone + notificationSettings and returns sanitized user', async () => {
    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ name: 'Updated', phone: '555', notificationSettings: { email: false } });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated');
    expect(res.body.user.profile.phone).toBe('555');
    expect(res.body.user.profile.notificationSettings).toEqual({ email: false });
    expect(res.body.user.password).toBeUndefined();

    // The update must actually be persisted, not just echoed back.
    const stored = await User.findOne({ userId: USER.userId }).lean();
    expect(stored.name).toBe('Updated');
    expect(stored.profile.phone).toBe('555');
  });

  test('ignores a blank name rather than wiping the stored one', async () => {
    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ name: '   ', phone: '999' });

    expect(res.status).toBe(200);
    const stored = await User.findOne({ userId: USER.userId }).lean();
    expect(stored.name).toBe('Me');
    expect(stored.profile.phone).toBe('999');
  });
});

describe('PUT /auth/password', () => {
  test('400 when fields missing', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('400 when newPassword too short', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'current-secret', newPassword: 'abc' });
    expect(res.status).toBe(400);
  });

  test('401 when currentPassword is wrong', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'wrong-secret', newPassword: 'new-secret-1' });
    expect(res.status).toBe(401);
  });

  test('200 on success and stores a new hashed password', async () => {
    const before = await User.findOne({ userId: USER.userId }).lean();

    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'current-secret', newPassword: 'brand-new-secret' });

    expect(res.status).toBe(200);

    const after = await User.findOne({ userId: USER.userId }).lean();
    expect(after.password).not.toBe('brand-new-secret'); // must be hashed
    expect(after.password).toMatch(/^\$2[aby]\$/);
    expect(after.password).not.toBe(before.password);
    // The new password must actually verify.
    expect(await bcrypt.compare('brand-new-secret', after.password)).toBe(true);
  });

  test('the new password works for a subsequent login', async () => {
    await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'current-secret', newPassword: 'brand-new-secret' });

    const ok = await request(app)
      .post('/auth/login')
      .send({ email: USER.email, password: 'brand-new-secret' });
    expect(ok.status).toBe(200);

    const stale = await request(app)
      .post('/auth/login')
      .send({ email: USER.email, password: 'current-secret' });
    expect(stale.status).toBe(401);
  });
});
