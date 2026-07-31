// Tests for /admin — authorization first.
//
// SECURITY REGRESSION GUARD: POST /admin/setup used to require only a valid
// login and then unconditionally set role='admin' on the caller. Any registered
// user could self-promote and then list every account, change roles, deactivate
// users, or delete them. Verified exploitable against production before the fix.
// The tests below pin the bootstrap gate shut.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User } = require('../models');

const PLAIN = { userId: 'plain-1', email: 'plain@test.com', name: 'Plain', role: 'user', isActive: true };
const ADMIN = { userId: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', isActive: true };

function tokenFor(user) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  delete process.env.ADMIN_SETUP_TOKEN;
  await User.create({ ...PLAIN, password: 'x' });
});

afterAll(() => { delete process.env.ADMIN_SETUP_TOKEN; });

describe('admin routes reject non-admins', () => {
  const cases = [
    ['get', '/admin/users'],
    ['get', '/admin/stats'],
  ];

  test.each(cases)('%s %s is 401 without a token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  test.each(cases)('%s %s is 403 for an ordinary user', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', `Bearer ${tokenFor(PLAIN)}`);
    expect(res.status).toBe(403);
  });

  test('an ordinary user cannot change roles', async () => {
    const res = await request(app)
      .put(`/admin/users/${PLAIN.userId}/role`)
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);

    const stored = await User.findOne({ userId: PLAIN.userId }).lean();
    expect(stored.role).toBe('user');
  });

  test('an ordinary user cannot delete accounts', async () => {
    const res = await request(app)
      .delete(`/admin/users/${PLAIN.userId}`)
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`);
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ userId: PLAIN.userId })).toBe(1);
  });

  test('a real admin is allowed through', async () => {
    await User.create({ ...ADMIN, password: 'x' });
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /admin/setup — privilege-escalation guard', () => {
  test('401 without a token', async () => {
    const res = await request(app).post('/admin/setup').send({});
    expect(res.status).toBe(401);
  });

  test('an ordinary user CANNOT self-promote when the bootstrap is disabled', async () => {
    // This is the exact request that used to return 200 and grant admin.
    const res = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({});

    expect(res.status).toBe(404); // disabled, and not advertised
    const stored = await User.findOne({ userId: PLAIN.userId }).lean();
    expect(stored.role).toBe('user');
  });

  test('403 when the setup token is wrong', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-horse-battery-staple';

    const res = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({ setupToken: 'guess' });

    expect(res.status).toBe(403);
    expect((await User.findOne({ userId: PLAIN.userId }).lean()).role).toBe('user');
  });

  test('403 once an administrator already exists, even with the right token', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-horse-battery-staple';
    await User.create({ ...ADMIN, password: 'x' });

    const res = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({ setupToken: 'correct-horse-battery-staple' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/already exists/i);
    expect((await User.findOne({ userId: PLAIN.userId }).lean()).role).toBe('user');
  });

  test('promotes the first administrator with a valid token and no existing admin', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-horse-battery-staple';

    const res = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({ setupToken: 'correct-horse-battery-staple' });

    expect(res.status).toBe(200);
    expect((await User.findOne({ userId: PLAIN.userId }).lean()).role).toBe('admin');
  });

  test('accepts the token via header as well as body', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-horse-battery-staple';

    const res = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .set('x-admin-setup-token', 'correct-horse-battery-staple')
      .send({});

    expect(res.status).toBe(200);
  });

  test('is single-use in practice: a second caller is refused', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-horse-battery-staple';
    await User.create({ userId: 'plain-2', email: 'p2@test.com', name: 'P2', password: 'x', role: 'user' });

    const first = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor(PLAIN)}`)
      .send({ setupToken: 'correct-horse-battery-staple' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/admin/setup')
      .set('Authorization', `Bearer ${tokenFor({ userId: 'plain-2', role: 'user' })}`)
      .send({ setupToken: 'correct-horse-battery-staple' });
    expect(second.status).toBe(403);
    expect((await User.findOne({ userId: 'plain-2' }).lean()).role).toBe('user');
  });
});
