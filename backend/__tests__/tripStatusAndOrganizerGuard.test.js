// Regression tests for two bugs found while auditing the frontend against the
// API ahead of the React migration. Both are about a boundary that looked
// enforced from the outside but was not.
//
//   1. GET /trips/organizer/dashboard carried no role check. The organizer tier
//      was gated only by frontend/organizer.js, so any authenticated user could
//      call the route directly. No data leaked — the handler scopes every query
//      to req.user.userId — but "organizer" was a UI convention, not a boundary.
//
//   2. PUT /trips/:id/status did not exist. frontend/organizer.js has called it
//      since the page was written, so Complete / Cancel / Reactivate 404'd.
//
// Both tests were confirmed to fail against the pre-fix code: (1) returned 200
// instead of 403, and (2) returned 404 instead of 200.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip } = require('../models');

const OWNER     = { userId: 'owner-1',     email: 'owner@test.com',     name: 'Owner',     role: 'user',      isActive: true };
const ORGANIZER = { userId: 'organizer-1', email: 'organizer@test.com', name: 'Organizer', role: 'organizer', isActive: true };
const ADMIN     = { userId: 'admin-1',     email: 'admin@test.com',     name: 'Admin',     role: 'admin',     isActive: true };
const OTHER     = { userId: 'other-1',     email: 'other@test.com',     name: 'Other',     role: 'user',      isActive: true };

function tokenFor(user) {
  return jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function seedTrip(overrides = {}) {
  return Trip.create({
    tripId: 'trip-1',
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
  await User.create([
    { ...OWNER, password: 'x' },
    { ...ORGANIZER, password: 'x' },
    { ...ADMIN, password: 'x' },
    { ...OTHER, password: 'x' },
  ]);
});

describe('GET /trips/organizer/dashboard is gated server-side', () => {
  test('401 without a token', async () => {
    const res = await request(app).get('/trips/organizer/dashboard');
    expect(res.status).toBe(401);
  });

  test('403 for a plain user — the bug: this used to answer 200', async () => {
    const res = await request(app)
      .get('/trips/organizer/dashboard')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    expect(res.status).toBe(403);
  });

  test('200 for an organizer', async () => {
    const res = await request(app)
      .get('/trips/organizer/dashboard')
      .set('Authorization', `Bearer ${tokenFor(ORGANIZER)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stats');
    expect(Array.isArray(res.body.trips)).toBe(true);
  });

  test('200 for an admin', async () => {
    const res = await request(app)
      .get('/trips/organizer/dashboard')
      .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);
    expect(res.status).toBe(200);
  });

  test('the role comes from the database, not the token', async () => {
    // A token minted while the user was an organizer must stop working the
    // moment the row says otherwise — middleware/auth.js reads the role fresh.
    const token = tokenFor(ORGANIZER);
    await User.updateOne({ userId: ORGANIZER.userId }, { $set: { role: 'user' } });

    const res = await request(app)
      .get('/trips/organizer/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /trips/:id/status', () => {
  test('401 without a token', async () => {
    await seedTrip();
    const res = await request(app).put('/trips/trip-1/status').send({ status: 'completed' });
    expect(res.status).toBe(401);
  });

  test('updates the status — the bug: this route used to 404', async () => {
    await seedTrip({ status: 'planned' });

    const res = await request(app)
      .put('/trips/trip-1/status')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');

    const stored = await Trip.findOne({ tripId: 'trip-1' }).lean();
    expect(stored.status).toBe('completed');
  });

  test.each(['planned', 'planning', 'active', 'in_progress', 'completed', 'cancelled'])(
    'accepts the documented status %s',
    async (status) => {
      await seedTrip();
      const res = await request(app)
        .put('/trips/trip-1/status')
        .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  );

  test.each(['active', 'cancelled', 'completed'])(
    'accepts %s, which frontend/organizer.js actually sends',
    async (status) => {
      // Pins the three values the organizer buttons use. If the accepted set
      // is ever narrowed, those buttons break again and this fails.
      await seedTrip();
      const res = await request(app)
        .put('/trips/trip-1/status')
        .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
        .send({ status });
      expect(res.status).toBe(200);
    }
  );

  test('400 when status is missing', async () => {
    await seedTrip();
    const res = await request(app)
      .put('/trips/trip-1/status')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('400 on an unknown status, and the trip is left alone', async () => {
    await seedTrip({ status: 'planned' });
    const res = await request(app)
      .put('/trips/trip-1/status')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ status: 'abandoned' });

    expect(res.status).toBe(400);
    const stored = await Trip.findOne({ tripId: 'trip-1' }).lean();
    expect(stored.status).toBe('planned');
  });

  test('404 for a trip the caller does not own, with no write', async () => {
    await seedTrip({ status: 'planned' });
    const res = await request(app)
      .put('/trips/trip-1/status')
      .set('Authorization', `Bearer ${tokenFor(OTHER)}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(404);
    const stored = await Trip.findOne({ tripId: 'trip-1' }).lean();
    expect(stored.status).toBe('planned');
  });

  test('404 for a trip that does not exist', async () => {
    const res = await request(app)
      .put('/trips/no-such-trip/status')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  test('does not disturb other trip fields', async () => {
    await seedTrip({ status: 'planned', name: 'Keep My Name', duration: 5, groupSize: 4 });
    await request(app)
      .put('/trips/trip-1/status')
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ status: 'active' });

    const stored = await Trip.findOne({ tripId: 'trip-1' }).lean();
    expect(stored.name).toBe('Keep My Name');
    expect(stored.duration).toBe(5);
    expect(stored.groupSize).toBe(4);
    expect(stored.status).toBe('active');
  });
});
