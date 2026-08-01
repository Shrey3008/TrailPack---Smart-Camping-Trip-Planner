// Integration tests for the checklist item routes — previously the second
// least-covered route file (14%), including the AI generation endpoint.
//
// items.js is mounted twice in server.js: at /trips (for /trips/:id/items
// paths) and at /items (for direct item access), so both shapes are exercised.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item } = require('../models');

const OWNER = { userId: 'owner-1', email: 'owner@test.com', name: 'Owner', role: 'user', isActive: true };
const TRIP_ID = 'trip-1';

function tokenFor(user = OWNER) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await User.create({ ...OWNER, password: 'x' });
  await Trip.create({
    tripId: TRIP_ID,
    userId: OWNER.userId,
    name: 'Trip',
    terrain: 'Mountain',
    season: 'Summer',
    duration: 2,
  });
});

describe('GET /trips/:id/items', () => {
  test('401 without a token', async () => {
    const res = await request(app).get(`/trips/${TRIP_ID}/items`);
    expect(res.status).toBe(401);
  });

  test('returns the trip\'s items without internal Mongo fields', async () => {
    await Item.create([
      { tripId: TRIP_ID, name: 'Boots', category: 'Clothing' },
      { tripId: TRIP_ID, name: 'Tent', category: 'Shelter' },
    ]);

    const res = await request(app)
      .get(`/trips/${TRIP_ID}/items`)
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]._id).toBeUndefined();
    expect(res.body[0].__v).toBeUndefined();
  });

  test('does not return items belonging to another trip', async () => {
    await Item.create([
      { tripId: TRIP_ID, name: 'Mine' },
      { tripId: 'someone-else', name: 'Theirs' },
    ]);

    const res = await request(app)
      .get(`/trips/${TRIP_ID}/items`)
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.body.map(i => i.name)).toEqual(['Mine']);
  });
});

describe('POST /items', () => {
  test('400 when tripId, name or category is missing', async () => {
    const token = tokenFor();
    for (const body of [
      {},
      { tripId: TRIP_ID },
      { tripId: TRIP_ID, name: 'X' },
      { name: 'X', category: 'Clothing' },
    ]) {
      const res = await request(app)
        .post('/items')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  test('201 creates an unpacked item and persists it', async () => {
    const res = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ tripId: TRIP_ID, name: 'Camp stove', category: 'Essentials' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tripId: TRIP_ID, name: 'Camp stove', category: 'Essentials', packed: false,
    });
    expect(res.body.itemId).toBeTruthy();
    expect(res.body._id).toBeUndefined();

    const stored = await Item.findOne({ itemId: res.body.itemId }).lean();
    expect(stored.name).toBe('Camp stove');
    // Manually added items are not AI rows.
    expect(stored.source).toBe('manual');
  });
});

describe('PUT /items/:id', () => {
  test('400 when tripId is missing from the body', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Boots' });
    const res = await request(app)
      .put(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ packed: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/trip id/i);
  });

  test('toggles packed state', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Boots', packed: false });

    const res = await request(app)
      .put(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ tripId: TRIP_ID, packed: true });

    expect(res.status).toBe(200);
    expect(res.body.packed).toBe(true);
    expect((await Item.findOne({ itemId: item.itemId }).lean()).packed).toBe(true);
  });

  test('404 when the item does not belong to the given trip', async () => {
    const item = await Item.create({ tripId: 'another-trip', name: 'Boots' });
    const res = await request(app)
      .put(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ tripId: TRIP_ID, packed: true });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /trips/:tripId/items/:itemId', () => {
  test('updates packed state via the checklist path', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Tent', packed: false });

    const res = await request(app)
      .patch(`/trips/${TRIP_ID}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ packed: true });

    expect(res.status).toBe(200);
    expect(res.body.packed).toBe(true);
  });

  test('404 for an unknown item', async () => {
    const res = await request(app)
      .patch(`/trips/${TRIP_ID}/items/missing`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ packed: true });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /items/:id', () => {
  test('400 when tripId is supplied by neither body nor query', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Boots' });
    const res = await request(app)
      .delete(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(await Item.countDocuments({ itemId: item.itemId })).toBe(1);
  });

  test('removes the item when tripId comes from the body', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Boots' });

    const res = await request(app)
      .delete(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ tripId: TRIP_ID });

    expect(res.status).toBe(200);
    expect(await Item.countDocuments({ itemId: item.itemId })).toBe(0);
  });

  // Many HTTP clients and proxies drop DELETE bodies, so the query parameter
  // is the more portable form. Both must work.
  test('removes the item when tripId comes from the query string', async () => {
    const item = await Item.create({ tripId: TRIP_ID, name: 'Boots' });

    const res = await request(app)
      .delete(`/items/${item.itemId}?tripId=${TRIP_ID}`)
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(await Item.countDocuments({ itemId: item.itemId })).toBe(0);
  });

  test('does not delete an item that belongs to a different trip', async () => {
    const item = await Item.create({ tripId: 'another-trip', name: 'Boots' });

    const res = await request(app)
      .delete(`/items/${item.itemId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ tripId: TRIP_ID });

    // Used to answer 200 "deleted successfully" while deleting nothing.
    expect(res.status).toBe(404);
    expect(await Item.countDocuments({ itemId: item.itemId })).toBe(1);
  });

  test('404 for an item that does not exist', async () => {
    const res = await request(app)
      .delete(`/items/no-such-item?tripId=${TRIP_ID}`)
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /trips/:id/ai-items', () => {
  // No GROQ_API_KEY in the test env, so aiService reports AI_NOT_CONFIGURED.
  // Before the error-surfacing fix this answered 201 { suggested: 0 }, making a
  // dead API key indistinguishable from "the model had nothing to add".
  test('503 with a code when the AI service is not configured', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_NOT_CONFIGURED');
    expect(res.body.message).toMatch(/not configured/i);
  });

  test('a failed generation inserts nothing', async () => {
    await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(await Item.countDocuments({ tripId: TRIP_ID })).toBe(0);
  });

  test('404 for a trip the caller does not own', async () => {
    await User.create({ userId: 'stranger', name: 'S', email: 's@test.com', password: 'x' });
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor({ userId: 'stranger', role: 'user' })}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('401 without a token', async () => {
    const res = await request(app).post(`/trips/${TRIP_ID}/ai-items`).send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /trips/:id/ai-items — successful generation', () => {
  // Stub only the AI boundary so the route's own logic (dedup, persistence,
  // response shape) is exercised for real.
  const aiService = require('../services/aiService');
  let spy;

  afterEach(() => { if (spy) spy.mockRestore(); });

  test('persists suggestions tagged source="ai" and reports counts', async () => {
    spy = jest.spyOn(aiService, 'generateGearSuggestions').mockResolvedValue([
      { name: 'Microspikes', category: 'Tools', priority: 'recommended' },
      { name: 'Down jacket', category: 'Clothing', priority: 'essential' },
    ]);

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.counts).toMatchObject({ inserted: 2, skipped: 0, suggested: 2 });

    const stored = await Item.find({ tripId: TRIP_ID }).lean();
    expect(stored).toHaveLength(2);
    expect(stored.every(i => i.source === 'ai')).toBe(true);
    expect(stored.every(i => i.packed === false)).toBe(true);
  });

  test('skips suggestions already on the trip, case-insensitively', async () => {
    await Item.create({ tripId: TRIP_ID, name: '  down JACKET ', category: 'Clothing' });

    spy = jest.spyOn(aiService, 'generateGearSuggestions').mockResolvedValue([
      { name: 'Down jacket', category: 'Clothing', priority: 'essential' },
      { name: 'Microspikes', category: 'Tools', priority: 'recommended' },
    ]);

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.counts).toMatchObject({ inserted: 1, skipped: 1 });
    expect(res.body.skipped).toContain('Down jacket');
    // The duplicate must not have been inserted into the AI section either.
    expect(await Item.countDocuments({ tripId: TRIP_ID, source: 'ai' })).toBe(1);
  });

  test('deduplicates within a single AI batch', async () => {
    spy = jest.spyOn(aiService, 'generateGearSuggestions').mockResolvedValue([
      { name: 'Trekking poles', category: 'Tools', priority: 'recommended' },
      { name: 'trekking poles', category: 'Tools', priority: 'optional' },
    ]);

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.body.counts.inserted).toBe(1);
    expect(await Item.countDocuments({ tripId: TRIP_ID })).toBe(1);
  });

  test('an empty-but-successful generation is 201 with zero counts, not 503', async () => {
    spy = jest.spyOn(aiService, 'generateGearSuggestions').mockResolvedValue([]);

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.counts).toMatchObject({ inserted: 0, suggested: 0 });
  });

  test('503 AI_UNAVAILABLE when the upstream call fails', async () => {
    const err = new Error('The AI service is temporarily unavailable.');
    err.code = 'AI_UNAVAILABLE';
    spy = jest.spyOn(aiService, 'generateGearSuggestions').mockRejectedValue(err);

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/ai-items`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });
});
