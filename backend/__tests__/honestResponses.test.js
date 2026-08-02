// REGRESSION GUARDS for four "the response was not true" defects.
//
//  7. DELETE /notifications/:id answered 200 "Notification deleted" whether or
//     not anything was deleted.
//  8. DELETE /admin/users/:userId answered 200 for users that never existed,
//     and deleted only the User row — orphaning their trips, items,
//     collaborator rows, invites and notifications.
//  9. GET /trips/shared was declared after GET /trips/:id, so Express never
//     reached it; it answered 404 "Trip not found" for its entire life.
// 10. Five /ai routes returned invented data as though it had been computed,
//     for any trip id, without loading the trip or checking the caller.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Notification, Collaborator, Invite } = require('../models');

async function seedUser(userId, email, role = 'user') {
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

describe('7. DELETE /notifications/:id tells the truth', () => {
  test('404 for a notification that does not exist', async () => {
    const token = await seedUser('u1', 'u1@test.com');

    const res = await request(app)
      .delete('/notifications/no-such-notification')
      .set('Authorization', `Bearer ${token}`);

    // Old behaviour: 200 "Notification deleted".
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  test("404 for another user's notification, which must survive", async () => {
    const token = await seedUser('u1', 'u1@test.com');
    await seedUser('u2', 'u2@test.com');
    const theirs = await Notification.create({
      userId: 'u2',
      type: 'welcome',
      message: 'hi',
      read: false,
    });

    const res = await request(app)
      .delete(`/notifications/${theirs.notifId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(await Notification.countDocuments({ notifId: theirs.notifId })).toBe(1);
  });

  test('200 and actually deletes the caller\'s own notification', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    const mine = await Notification.create({
      userId: 'u1',
      type: 'welcome',
      message: 'hi',
      read: false,
    });

    const res = await request(app)
      .delete(`/notifications/${mine.notifId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ notifId: mine.notifId })).toBe(0);
  });
});

describe('8. DELETE /admin/users/:userId tells the truth and cascades', () => {
  test('404 for a user that does not exist', async () => {
    const adminToken = await seedUser('admin-1', 'admin@test.com', 'admin');

    const res = await request(app)
      .delete('/admin/users/no-such-user')
      .set('Authorization', `Bearer ${adminToken}`);

    // Old behaviour: 200 "User deleted successfully".
    expect(res.status).toBe(404);
  });

  test('deleting a user removes their trips, items, invites and notifications', async () => {
    const adminToken = await seedUser('admin-1', 'admin@test.com', 'admin');
    await seedUser('victim-1', 'victim@test.com');
    await seedUser('friend-1', 'friend@test.com');

    const trip = await Trip.create({
      userId: 'victim-1',
      name: 'Their Trip',
      terrain: 'Forest',
      season: 'Fall',
      duration: 2,
    });
    await Item.create({ tripId: trip.tripId, name: 'Tent', category: 'Shelter', packed: false });
    await Notification.create({ userId: 'victim-1', type: 'welcome', message: 'hi', read: false });
    await Invite.create({
      tripId: trip.tripId,
      email: 'friend@test.com',
      token: 'invite-token-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    // Someone else collaborating on the deleted user's trip...
    await Collaborator.create({ tripId: trip.tripId, userId: 'friend-1', email: 'friend@test.com' });
    // ...and the deleted user collaborating on someone else's.
    const otherTrip = await Trip.create({
      userId: 'friend-1',
      name: "Friend's Trip",
      terrain: 'Mountain',
      season: 'Summer',
      duration: 1,
    });
    await Collaborator.create({ tripId: otherTrip.tripId, userId: 'victim-1' });

    const res = await request(app)
      .delete('/admin/users/victim-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Old behaviour: every one of these survived as an unreachable orphan.
    expect(await User.countDocuments({ userId: 'victim-1' })).toBe(0);
    expect(await Trip.countDocuments({ userId: 'victim-1' })).toBe(0);
    expect(await Item.countDocuments({ tripId: trip.tripId })).toBe(0);
    expect(await Notification.countDocuments({ userId: 'victim-1' })).toBe(0);
    expect(await Invite.countDocuments({ tripId: trip.tripId })).toBe(0);
    expect(await Collaborator.countDocuments({ tripId: trip.tripId })).toBe(0);
    expect(await Collaborator.countDocuments({ userId: 'victim-1' })).toBe(0);

    // Other people's data is untouched.
    expect(await Trip.countDocuments({ userId: 'friend-1' })).toBe(1);
    expect(await User.countDocuments({ userId: 'friend-1' })).toBe(1);
  });

  test('admin stats no longer count orphaned trips after a delete', async () => {
    const adminToken = await seedUser('admin-1', 'admin@test.com', 'admin');
    await seedUser('victim-1', 'victim@test.com');
    await Trip.create({
      userId: 'victim-1',
      name: 'Their Trip',
      terrain: 'Forest',
      season: 'Fall',
      duration: 2,
    });

    await request(app)
      .delete('/admin/users/victim-1')
      .set('Authorization', `Bearer ${adminToken}`);

    const stats = await request(app)
      .get('/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(stats.body.trips.total).toBe(0);
  });

  test('still refuses to delete your own account', async () => {
    const adminToken = await seedUser('admin-1', 'admin@test.com', 'admin');
    const res = await request(app)
      .delete('/admin/users/admin-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(await User.countDocuments({ userId: 'admin-1' })).toBe(1);
  });
});

describe('9. the shared-trips endpoint is the working one', () => {
  test('GET /shared-trips/mine returns trips shared with the caller', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    await seedUser('owner-1', 'owner@test.com');
    const trip = await Trip.create({
      userId: 'owner-1',
      name: 'Shared Trip',
      terrain: 'Forest',
      season: 'Fall',
      duration: 2,
    });
    await Collaborator.create({ tripId: trip.tripId, userId: 'u1', joinedAt: new Date().toISOString() });

    const res = await request(app)
      .get('/shared-trips/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].name).toBe('Shared Trip');
  });

  test('GET /trips/shared no longer pretends to be a route', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    const res = await request(app)
      .get('/trips/shared')
      .set('Authorization', `Bearer ${token}`);

    // It always answered 404 — it was shadowed by /trips/:id. It still 404s,
    // but now because "shared" genuinely isn't a trip id, not because a real
    // route is sitting unreachable behind another one.
    expect(res.status).toBe(404);
  });

  test('the two-segment dashboards are not shadowed by /trips/:id', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    const organizer = await request(app)
      .get('/trips/organizer/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(organizer.status).toBe(200);
    expect(organizer.body).toHaveProperty('stats');
    expect(organizer.body).toHaveProperty('trips');
  });
});

describe('10. the fabricated AI routes are gone', () => {
  const removed = [
    ['post', '/ai/route/optimize'],
    ['post', '/ai/recommendations/personalized'],
    ['post', '/ai/trip/summary'],
    ['get', '/ai/insights/weather/any-trip-id'],
    ['post', '/ai/insights/route/any-trip-id'],
  ];

  test.each(removed)('%s %s is 404', async (method, path) => {
    const token = await seedUser('u1', 'u1@test.com');
    const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`);

    // Old behaviour: 200 with invented content, for any trip id, from any user.
    expect(res.status).toBe(404);
  });

  test('no route still claims a risk level for an unknown trip', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    const res = await request(app)
      .get('/ai/insights/weather/trip-that-does-not-exist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/Low|Good conditions/);
  });

  test('the real risk-analysis endpoint still works', async () => {
    const token = await seedUser('u1', 'u1@test.com');
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ terrain: 'Mountain', season: 'Winter', duration: 7, experience: 'Beginner' });

    expect(res.status).toBe(200);
    expect(res.body.riskLevel).toBe('High');
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });
});
