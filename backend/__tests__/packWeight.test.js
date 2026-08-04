// Pack weight: the rollup endpoint, and the rules behind it.
//
// The classification logic exists twice — once in JS (services/weightService)
// and once as literals inside the Mongo pipeline, because the pipeline runs
// server-side and cannot call into JS. The last describe block exists to catch
// the two drifting apart, which is the failure mode that duplication invites.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Collaborator } = require('../models');
const { estimateWeightGrams, isConsumable } = require('../services/weightService');

async function seedUser(userId, email, name) {
  await User.create({
    userId, name, email,
    password: await bcrypt.hash('password123', 10),
    role: 'user', isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

let ownerToken, outsiderToken, trip;

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ora Owner');
  outsiderToken = await seedUser('outsider-1', 'outsider@test.com', 'Otto Outsider');
  trip = await Trip.create({
    userId: 'owner-1', name: 'Rainier Traverse', terrain: 'Mountain',
    season: 'Summer', duration: 3,
  });
});

const weightOf = (token = ownerToken) =>
  request(app).get(`/trips/${trip.tripId}/weight`).set('Authorization', `Bearer ${token}`);

const addItem = (name, category, weight) =>
  Item.create({ tripId: trip.tripId, name, category, weight });

describe('default weight estimation', () => {
  test('recognises common gear by name, case-insensitively', () => {
    expect(estimateWeightGrams('Tent')).toBe(2000);
    expect(estimateWeightGrams('two-person tent')).toBe(2000);
    expect(estimateWeightGrams('HEADLAMP')).toBe(90);
  });

  test('returns null rather than guessing at an unrecognised name', () => {
    expect(estimateWeightGrams('Lucky bandana')).toBeNull();
    expect(estimateWeightGrams('')).toBeNull();
    expect(estimateWeightGrams(null)).toBeNull();
  });

  test('matches whole words, so a substring does not trigger a rule', () => {
    // "map" must not fire on "campsite pass"
    expect(estimateWeightGrams('campsite pass')).toBeNull();
  });

  test('plural item names match', () => {
    // A trailing "s" breaks a literal \b, which had "Trekking poles" scoring
    // null while "Trekking pole" scored 500.
    expect(estimateWeightGrams('Trekking poles')).toBe(500);
    expect(estimateWeightGrams('Trekking pole')).toBe(500);
    expect(estimateWeightGrams('Wool socks')).toBe(60);
    expect(estimateWeightGrams('Microspikes')).toBe(500);
    expect(estimateWeightGrams('Hiking boots')).toBe(900);
  });

  test('a narrower phrase beats the broader word it contains', () => {
    // "Stove fuel" is fuel, not a stove — it burns off, and it is consumable.
    expect(estimateWeightGrams('Stove fuel')).toBe(380);
    expect(estimateWeightGrams('Camp stove')).toBe(350);
  });

  test('food is left unweighed on purpose', () => {
    // Food weight follows party size and trip length, so any fixed default
    // would be wrong for everyone.
    expect(estimateWeightGrams('Trail mix')).toBeNull();
    expect(estimateWeightGrams('Dehydrated meals')).toBeNull();
  });
});

describe('base vs consumable classification', () => {
  test('food and water are consumable', () => {
    expect(isConsumable('Trail mix', 'Food & Water')).toBe(true);
    expect(isConsumable('3L water', 'Food & Water')).toBe(true);
  });

  test('durable gear filed under Food & Water is not consumable', () => {
    expect(isConsumable('Water bottle', 'Food & Water')).toBe(false);
    expect(isConsumable('Water filter', 'Food & Water')).toBe(false);
    expect(isConsumable('Camp stove', 'Food & Water')).toBe(false);
  });

  test('fuel is consumable wherever it is filed', () => {
    expect(isConsumable('Stove fuel', 'Tools')).toBe(true);
    expect(isConsumable('Gas canister', 'Tools')).toBe(true);
  });

  test('everything else is base weight', () => {
    expect(isConsumable('Tent', 'Shelter')).toBe(false);
    expect(isConsumable('Down jacket', 'Clothing')).toBe(false);
  });
});

describe('GET /trips/:id/weight', () => {
  test('requires access to the trip', async () => {
    expect((await weightOf(outsiderToken)).status).toBe(403);
  });

  test('a collaborator can read the rollup', async () => {
    const collabToken = await seedUser('collab-1', 'collab@test.com', 'Cal');
    await Collaborator.create({ tripId: trip.tripId, userId: 'collab-1' });
    expect((await weightOf(collabToken)).status).toBe(200);
  });

  test('an empty checklist reports zeros, not an error', async () => {
    const res = await weightOf();
    expect(res.status).toBe(200);
    expect(res.body.totalGrams).toBe(0);
    expect(res.body.counts).toEqual({ items: 0, weighed: 0, unweighed: 0 });
    expect(res.body.byCategory).toEqual([]);
    expect(res.body.split).toEqual({ baseGrams: 0, baseItems: 0, consumableGrams: 0, consumableItems: 0 });
  });

  test('sums weights and reports the unit', async () => {
    await addItem('Tent', 'Shelter', 2000);
    await addItem('Sleeping bag', 'Shelter', 1100);
    await addItem('Headlamp', 'Safety', 90);

    const res = await weightOf();
    expect(res.body.unit).toBe('g');
    expect(res.body.totalGrams).toBe(3190);
    expect(res.body.counts).toEqual({ items: 3, weighed: 3, unweighed: 0 });
  });

  test('unweighed items are counted, not silently treated as zero', async () => {
    await addItem('Tent', 'Shelter', 2000);
    await addItem('Lucky bandana', 'Clothing', null);

    const res = await weightOf();
    expect(res.body.totalGrams).toBe(2000);
    expect(res.body.counts).toEqual({ items: 2, weighed: 1, unweighed: 1 });
  });

  test('an explicit zero is weighed, not unweighed', async () => {
    // 0 means "weighed, negligible"; null means "nobody has said". The two must
    // not collapse, or the caller cannot tell a light pack from an unfilled one.
    await addItem('Ziplock bag', 'Tools', 0);

    const res = await weightOf();
    expect(res.body.counts).toEqual({ items: 1, weighed: 1, unweighed: 0 });
  });

  test('breaks down by category, heaviest first', async () => {
    await addItem('Tent', 'Shelter', 2000);
    await addItem('Down jacket', 'Clothing', 400);
    await addItem('Sleeping bag', 'Shelter', 1100);

    const res = await weightOf();
    expect(res.body.byCategory).toEqual([
      { category: 'Shelter', grams: 3100, items: 2, unweighed: 0 },
      { category: 'Clothing', grams: 400, items: 1, unweighed: 0 },
    ]);
  });

  test('per-category unweighed counts are reported too', async () => {
    await addItem('Tent', 'Shelter', 2000);
    await addItem('Guy lines', 'Shelter', null);

    const res = await weightOf();
    expect(res.body.byCategory[0]).toEqual({ category: 'Shelter', grams: 2000, items: 2, unweighed: 1 });
  });

  test('splits base weight from consumables', async () => {
    await addItem('Tent', 'Shelter', 2000);
    await addItem('Trail mix', 'Food & Water', 800);
    await addItem('Water bottle', 'Food & Water', 150);   // durable, so base
    await addItem('Stove fuel', 'Tools', 380);            // consumable, so not base

    const res = await weightOf();
    expect(res.body.split).toEqual({
      baseGrams: 2150,        // tent + bottle
      baseItems: 2,
      consumableGrams: 1180,  // trail mix + fuel
      consumableItems: 2,
    });
    expect(res.body.split.baseGrams + res.body.split.consumableGrams).toBe(res.body.totalGrams);
  });

  test('reports the trip target, and null when there is none', async () => {
    expect((await weightOf()).body.targetGrams).toBeNull();

    await Trip.updateOne({ tripId: trip.tripId }, { $set: { weightTarget: 9000 } });
    expect((await weightOf()).body.targetGrams).toBe(9000);
  });

  test('only counts items on this trip', async () => {
    const other = await Trip.create({
      userId: 'owner-1', name: 'Other', terrain: 'Forest', season: 'Fall', duration: 1,
    });
    await addItem('Tent', 'Shelter', 2000);
    await Item.create({ tripId: other.tripId, name: 'Tent', category: 'Shelter', weight: 2000 });

    expect((await weightOf()).body.totalGrams).toBe(2000);
  });
});

describe('setting weights', () => {
  const patchItem = (itemId, body) =>
    request(app)
      .patch(`/trips/${trip.tripId}/items/${itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body);

  test('an item weight can be set, and cleared back to unknown', async () => {
    const item = await addItem('Tent', 'Shelter', null);

    expect((await patchItem(item.itemId, { weight: 1850 })).body.weight).toBe(1850);
    expect((await patchItem(item.itemId, { weight: null })).body.weight).toBeNull();
  });

  test('a negative or unparseable weight is refused', async () => {
    const item = await addItem('Tent', 'Shelter', null);

    expect((await patchItem(item.itemId, { weight: -5 })).status).toBe(400);
    expect((await patchItem(item.itemId, { weight: 'heavy' })).status).toBe(400);
    expect((await Item.findOne({ itemId: item.itemId }).lean()).weight).toBeNull();
  });

  test('weight and packed can be sent together', async () => {
    const item = await addItem('Tent', 'Shelter', null);
    const res = await patchItem(item.itemId, { weight: 1850, packed: true });
    expect(res.body.weight).toBe(1850);
    expect(res.body.packed).toBe(true);
  });

  test('a trip weight target can be set and cleared', async () => {
    const put = (weightTarget) =>
      request(app)
        .put(`/trips/${trip.tripId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ weightTarget });

    expect((await put(9000)).body.weightTarget).toBe(9000);
    expect((await put(null)).body.weightTarget).toBeNull();
  });
});

describe('the pipeline agrees with the JS rules', () => {
  // The two implementations are separate by necessity. These cases run real
  // items through the aggregation and compare against isConsumable(), so a rule
  // changed in one place and not the other fails here rather than in production.
  const cases = [
    ['Trail mix', 'Food & Water'],
    ['Water bottle', 'Food & Water'],
    ['Water filter', 'Food & Water'],
    ['Camp stove', 'Food & Water'],
    ['Stove fuel', 'Tools'],
    ['Gas canister', 'Safety'],
    ['Tent', 'Shelter'],
    ['Down jacket', 'Clothing'],
    ['Spork', 'Food & Water'],
    ['Dehydrated meals', 'Food & Water'],
  ];

  test.each(cases)('%s in %s classifies the same both ways', async (name, category) => {
    await addItem(name, category, 100);

    const res = await weightOf();
    const consumableInPipeline = res.body.split.consumableItems === 1;
    expect(consumableInPipeline).toBe(isConsumable(name, category));
  });
});

describe('creating an item carries or estimates weight', () => {
  const post = (body) =>
    request(app).post('/items').set('Authorization', `Bearer ${ownerToken}`).send(body);

  test('an explicit weight is honoured — this is what undo relies on', async () => {
    const res = await post({ tripId: trip.tripId, name: 'Tent', category: 'Shelter', weight: 1850 });
    expect(res.status).toBe(201);
    expect(res.body.weight).toBe(1850);
  });

  test('an explicit null stays null, rather than falling back to the estimate', async () => {
    // Undoing an item the user had deliberately blanked must not resurrect a
    // guess they already rejected.
    const res = await post({ tripId: trip.tripId, name: 'Tent', category: 'Shelter', weight: null });
    expect(res.body.weight).toBeNull();
  });

  test('omitting weight estimates from the name', async () => {
    const res = await post({ tripId: trip.tripId, name: 'Headlamp', category: 'Safety' });
    expect(res.body.weight).toBe(90);
  });

  test('omitting weight for an unrecognised name leaves it null', async () => {
    const res = await post({ tripId: trip.tripId, name: 'Lucky bandana', category: 'Clothing' });
    expect(res.body.weight).toBeNull();
  });

  test('a negative weight is refused and nothing is created', async () => {
    const res = await post({ tripId: trip.tripId, name: 'Tent', category: 'Shelter', weight: -1 });
    expect(res.status).toBe(400);
    expect(await Item.countDocuments({ name: 'Tent' })).toBe(0);
  });
});
