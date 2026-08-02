// SECURITY REGRESSION GUARD: stale role carried in the JWT.
//
// Login signed the user's role into a 7-day token, and middleware/auth.js then
// did `user.role = decoded.role || user.role` — preferring the token's copy
// over the database's. Demoting an administrator therefore did nothing at all
// until their token expired, up to a week later. Verified against production
// before the fix: a user demoted to 'user' still listed every account.
//
// The role now comes from the user row on every request, and tokens carry no
// role at all.
const jwt = require('jsonwebtoken');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { JWT_SECRET } = require('../middleware/auth');
const { User } = require('../models');

async function seedUser(userId, email, role) {
  await User.create({
    userId,
    name: email,
    email,
    password: await bcrypt.hash('password123', 10),
    role,
    isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(() => db.clear());

describe('role is read from the database, not the token', () => {
  test('THE EXPLOIT: a demoted admin loses access immediately', async () => {
    const victimToken = await seedUser('admin-1', 'admin@test.com', 'admin');
    const otherAdminToken = await seedUser('admin-2', 'admin2@test.com', 'admin');

    // Token was minted while they were an admin, and still works for auth.
    const before = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(before.status).toBe(200);

    const demote = await request(app)
      .put('/admin/users/admin-1/role')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .send({ role: 'user' });
    expect(demote.status).toBe(200);
    expect((await User.findOne({ userId: 'admin-1' }).lean()).role).toBe('user');

    // Old behaviour: 200, full user list, for up to 7 more days.
    const after = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(after.status).toBe(403);
    expect(after.body.users).toBeUndefined();
  });

  test('a hand-forged role claim is ignored', async () => {
    await seedUser('plain-1', 'plain@test.com', 'user');
    // Exactly the shape login used to issue.
    const forged = jwt.sign({ userId: 'plain-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(403);
  });

  test('a promotion also takes effect immediately', async () => {
    const token = await seedUser('plain-2', 'plain2@test.com', 'user');
    await seedUser('admin-3', 'admin3@test.com', 'admin');

    expect((await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`)).status)
      .toBe(403);

    await User.updateOne({ userId: 'plain-2' }, { $set: { role: 'admin' } });

    // Same token, no re-login needed.
    expect((await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`)).status)
      .toBe(200);
  });

  test('login no longer puts a role in the token', async () => {
    const token = await seedUser('plain-3', 'plain3@test.com', 'user');
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded.userId).toBe('plain-3');
    expect(decoded.role).toBeUndefined();
  });

  test('the login response body still reports the role for the UI', async () => {
    await seedUser('plain-4', 'plain4@test.com', 'organizer');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'plain4@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('organizer');
  });

  test('deactivating a user still cuts them off immediately', async () => {
    const token = await seedUser('plain-5', 'plain5@test.com', 'user');
    await User.updateOne({ userId: 'plain-5' }, { $set: { isActive: false } });

    const res = await request(app).get('/trips').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
