// SECURITY REGRESSION GUARD: IDOR on every checklist-item route.
//
// routes/items.js used to take tripId from the caller and query on it directly,
// with no check that the trip belonged to the requester. Any authenticated user
// who knew a tripId could read, re-pack, add to and delete another user's
// checklist. tripIds are not secret — they sit in checklist URLs, go out in
// invitation emails, and are known to every collaborator, including revoked
// ones. Verified exploitable against production before the fix.
//
// Every test in "an outsider" below is an exploit that succeeded against the
// old code (200/201) and is refused now (403).
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Collaborator } = require('../models');

async function seedUser(userId, email) {
  await User.create({
    userId,
    name: email,
    email,
    password: await bcrypt.hash('password123', 10),
    role: 'user',
    isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

let ownerToken;
let outsiderToken;
let collaboratorToken;
let trip;
let item;

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  ownerToken = await seedUser('owner-1', 'owner@test.com');
  outsiderToken = await seedUser('outsider-1', 'outsider@test.com');
  collaboratorToken = await seedUser('collab-1', 'collab@test.com');

  trip = await Trip.create({
    userId: 'owner-1',
    name: 'Private Trip',
    terrain: 'Forest',
    season: 'Fall',
    duration: 2,
  });
  item = await Item.create({
    tripId: trip.tripId,
    name: 'Tent',
    category: 'Shelter',
    packed: false,
  });
  await Collaborator.create({
    tripId: trip.tripId,
    userId: 'collab-1',
    email: 'collab@test.com',
    name: 'collab@test.com',
  });
});

describe('an outsider cannot touch another user\'s checklist', () => {
  test('GET /trips/:id/items is 403', async () => {
    const res = await request(app)
      .get(`/trips/${trip.tripId}/items`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    // The items themselves must not leak in the body.
    expect(JSON.stringify(res.body)).not.toMatch(/Tent/);
  });

  test('PUT /items/:id is 403 and does not change packed state', async () => {
    const res = await request(app)
      .put(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ tripId: trip.tripId, packed: true });

    expect(res.status).toBe(403);
    const after = await Item.findOne({ itemId: item.itemId }).lean();
    expect(after.packed).toBe(false);
  });

  test('PATCH /trips/:tripId/items/:itemId is 403 and does not change packed state', async () => {
    const res = await request(app)
      .patch(`/trips/${trip.tripId}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ packed: true });

    expect(res.status).toBe(403);
    const after = await Item.findOne({ itemId: item.itemId }).lean();
    expect(after.packed).toBe(false);
  });

  test('POST /items is 403 and inserts nothing', async () => {
    const res = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ tripId: trip.tripId, name: 'Injected', category: 'Tools' });

    expect(res.status).toBe(403);
    expect(await Item.countDocuments({ tripId: trip.tripId })).toBe(1);
  });

  test('DELETE /items/:id is 403 and the item survives', async () => {
    const res = await request(app)
      .delete(`/items/${item.itemId}?tripId=${trip.tripId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    expect(await Item.countDocuments({ itemId: item.itemId })).toBe(1);
  });

  test('a revoked collaborator loses access immediately', async () => {
    // Access holds while the collaborator row exists...
    const before = await request(app)
      .get(`/trips/${trip.tripId}/items`)
      .set('Authorization', `Bearer ${collaboratorToken}`);
    expect(before.status).toBe(200);

    await Collaborator.deleteOne({ tripId: trip.tripId, userId: 'collab-1' });

    // ...and is gone the moment it doesn't, without waiting for a token to expire.
    const after = await request(app)
      .get(`/trips/${trip.tripId}/items`)
      .set('Authorization', `Bearer ${collaboratorToken}`);
    expect(after.status).toBe(403);
  });

  test('a nonexistent trip is 404, not 403', async () => {
    const res = await request(app)
      .get('/trips/no-such-trip/items')
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});

describe('the owner and collaborators still have full access', () => {
  test('owner can read, add, pack and delete', async () => {
    const read = await request(app)
      .get(`/trips/${trip.tripId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(1);

    const added = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tripId: trip.tripId, name: 'Stove', category: 'Tools' });
    expect(added.status).toBe(201);

    const packed = await request(app)
      .patch(`/trips/${trip.tripId}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ packed: true });
    expect(packed.status).toBe(200);
    expect(packed.body.packed).toBe(true);

    const removed = await request(app)
      .delete(`/items/${item.itemId}?tripId=${trip.tripId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(200);
  });

  test('a collaborator can pack items on a shared trip', async () => {
    const res = await request(app)
      .patch(`/trips/${trip.tripId}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${collaboratorToken}`)
      .send({ packed: true });

    expect(res.status).toBe(200);
    expect(res.body.packed).toBe(true);
  });

  test('PUT /items/:id without a tripId is still 400', async () => {
    const res = await request(app)
      .put(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ packed: true });
    expect(res.status).toBe(400);
  });

  test('all item routes still require a token', async () => {
    const calls = [
      request(app).get(`/trips/${trip.tripId}/items`),
      request(app).put(`/items/${item.itemId}`).send({ tripId: trip.tripId, packed: true }),
      request(app).patch(`/trips/${trip.tripId}/items/${item.itemId}`).send({ packed: true }),
      request(app).post('/items').send({ tripId: trip.tripId, name: 'X', category: 'Tools' }),
      request(app).delete(`/items/${item.itemId}?tripId=${trip.tripId}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
    }
  });
});
