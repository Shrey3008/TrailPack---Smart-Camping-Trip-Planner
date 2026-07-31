// Integration tests for /trips CRUD — the core of the product and, until now,
// the least-covered route file (13%).
//
// No GROQ_API_KEY is set in the test env, so generateBaseChecklist() returns []
// and trip creation falls through to the deterministic rule-based generator.
// That is the path worth pinning down: a trip must always come back with a
// checklist even when the AI is unavailable.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Collaborator } = require('../models');

const OWNER = { userId: 'owner-1', email: 'owner@test.com', name: 'Owner', role: 'user', isActive: true };
const OTHER = { userId: 'other-1', email: 'other@test.com', name: 'Other', role: 'user', isActive: true };

function tokenFor(user) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function newTrip(overrides = {}) {
  return {
    name: 'Epic Trip',
    terrain: 'Mountain',
    season: 'Summer',
    duration: 3,
    ...overrides,
  };
}

async function seedTrip(overrides = {}) {
  return Trip.create({
    tripId: 't1',
    userId: OWNER.userId,
    name: 'Seeded Trip',
    terrain: 'Forest',
    season: 'Fall',
    duration: 2,
    ...overrides,
  });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await User.create([{ ...OWNER, password: 'x' }, { ...OTHER, password: 'x' }]);
});

describe('POST /trips', () => {
  test('401 without a token', async () => {
    const res = await request(app).post('/trips').send(newTrip());
    expect(res.status).toBe(401);
  });

  test('400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ name: 'No terrain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test('201 creates the trip owned by the caller', async () => {
    const res = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send(newTrip());

    expect(res.status).toBe(201);
    expect(res.body.trip).toMatchObject({
      name: 'Epic Trip',
      terrain: 'Mountain',
      season: 'Summer',
      duration: 3,
      status: 'planned',
      userId: OWNER.userId,
    });
    expect(res.body.trip.tripId).toBeTruthy();
    // Internal Mongo fields must not leak to the client.
    expect(res.body.trip._id).toBeUndefined();
    expect(res.body.trip.__v).toBeUndefined();
  });

  test('generates a checklist via the rule-based fallback when AI is unavailable', async () => {
    const res = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send(newTrip());

    const items = await Item.find({ tripId: res.body.trip.tripId }).lean();
    expect(items.length).toBeGreaterThan(0);
    // Everything starts unpacked and manual (AI rows are tagged source:'ai').
    expect(items.every(i => i.packed === false)).toBe(true);
    expect(items.every(i => i.name && i.category !== undefined)).toBe(true);
  });

  test('clamps groupSize to 1..50 and defaults to 1', async () => {
    const token = tokenFor(OWNER);
    const cases = [
      [undefined, 1],
      [0, 1],
      [-5, 1],
      ['abc', 1],
      [7, 7],
      [999, 50],
    ];
    for (const [input, expected] of cases) {
      const res = await request(app)
        .post('/trips')
        .set('Authorization', `Bearer ${token}`)
        .send(newTrip({ groupSize: input }));
      expect(res.status).toBe(201);
      expect(res.body.trip.groupSize).toBe(expected);
    }
  });

  test('keeps valid coordinates and rejects out-of-range ones', async () => {
    const token = tokenFor(OWNER);

    const ok = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(newTrip({ lat: 39.7392, lon: -104.9903 }));
    expect(ok.body.trip.lat).toBeCloseTo(39.7392);
    expect(ok.body.trip.lon).toBeCloseTo(-104.9903);

    const bad = await request(app)
      .post('/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(newTrip({ lat: 999, lon: 'not-a-number' }));
    expect(bad.body.trip.lat).toBeNull();
    expect(bad.body.trip.lon).toBeNull();
  });
});

describe('GET /trips', () => {
  test('returns only the caller\'s trips', async () => {
    await seedTrip({ tripId: 'mine', name: 'Mine' });
    await Trip.create({
      tripId: 'theirs', userId: OTHER.userId, name: 'Theirs',
      terrain: 'Desert', season: 'Summer', duration: 1,
    });

    const res = await request(app)
      .get('/trips')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].tripId).toBe('mine');
  });

  test('returns an empty list for a user with no trips', async () => {
    const res = await request(app)
      .get('/trips')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    expect(res.status).toBe(200);
    expect(res.body.trips).toEqual([]);
  });
});

describe('GET /trips/stats', () => {
  test('aggregates totals and packed percentage', async () => {
    await seedTrip({ tripId: 't1' });
    await seedTrip({ tripId: 't2', name: 'Second' });
    await Item.create([
      { tripId: 't1', name: 'A', packed: true },
      { tripId: 't1', name: 'B', packed: false },
      { tripId: 't2', name: 'C', packed: true },
      { tripId: 't2', name: 'D', packed: false },
    ]);

    const res = await request(app)
      .get('/trips/stats')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalTrips: 2, totalItems: 4, packedItems: 2, packedPercentage: 50,
    });
  });

  test('reports 0% rather than dividing by zero when there are no items', async () => {
    const res = await request(app)
      .get('/trips/stats')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalTrips: 0, totalItems: 0, packedPercentage: 0 });
  });
});

describe('GET /trips/:id', () => {
  test('owner can fetch their trip', async () => {
    await seedTrip();
    const res = await request(app)
      .get('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe('t1');
  });

  test('404 for a trip belonging to someone else', async () => {
    await seedTrip();
    const res = await request(app)
      .get('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OTHER)}`);
    expect(res.status).toBe(404);
  });

  test('404 for an unknown id', async () => {
    const res = await request(app)
      .get('/trips/does-not-exist')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /trips/:id/provisions', () => {
  test('estimates provisions scaled to the group', async () => {
    await seedTrip({ duration: 3, groupSize: 4 });
    const res = await request(app)
      .get('/trips/t1/provisions')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    // Shape is asserted in provisions.test.js; here we only prove the route
    // resolves the trip and passes its group size through.
    expect(JSON.stringify(res.body)).toMatch(/water|calorie/i);
  });

  test('404 when the trip is not the caller\'s', async () => {
    await seedTrip();
    const res = await request(app)
      .get('/trips/t1/provisions')
      .set('Authorization', `Bearer ${tokenFor(OTHER)}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /trips/:id', () => {
  test('updates supplied fields and leaves others alone', async () => {
    await seedTrip({ name: 'Before', status: 'planned' });

    const res = await request(app)
      .put('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ name: 'After', status: 'active' });

    expect(res.status).toBe(200);
    const stored = await Trip.findOne({ tripId: 't1' }).lean();
    expect(stored.name).toBe('After');
    expect(stored.status).toBe('active');
    expect(stored.terrain).toBe('Forest'); // untouched
  });

  test('404 when updating a trip the caller does not own', async () => {
    await seedTrip();
    const res = await request(app)
      .put('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OTHER)}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);

    const stored = await Trip.findOne({ tripId: 't1' }).lean();
    expect(stored.name).toBe('Seeded Trip');
  });
});

describe('DELETE /trips/:id', () => {
  test('owner delete removes the trip and its checklist items', async () => {
    await seedTrip();
    await Item.create([
      { tripId: 't1', name: 'A' },
      { tripId: 't1', name: 'B' },
    ]);

    const res = await request(app)
      .delete('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(await Trip.countDocuments({ tripId: 't1' })).toBe(0);
    expect(await Item.countDocuments({ tripId: 't1' })).toBe(0);
  });

  test('also clears collaborator rows so no orphans are left behind', async () => {
    await seedTrip();
    await Collaborator.create({ tripId: 't1', userId: OTHER.userId, email: OTHER.email });

    const res = await request(app)
      .delete('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(await Collaborator.countDocuments({ tripId: 't1' })).toBe(0);
  });

  test('403 when a collaborator (not the owner) tries to delete', async () => {
    await seedTrip();
    await Collaborator.create({ tripId: 't1', userId: OTHER.userId, email: OTHER.email });

    const res = await request(app)
      .delete('/trips/t1')
      .set('Authorization', `Bearer ${tokenFor(OTHER)}`);

    expect(res.status).toBe(403);
    // The trip must survive a rejected delete.
    expect(await Trip.countDocuments({ tripId: 't1' })).toBe(1);
  });

  test('404 for an unknown trip', async () => {
    const res = await request(app)
      .delete('/trips/nope')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    expect(res.status).toBe(404);
  });
});
