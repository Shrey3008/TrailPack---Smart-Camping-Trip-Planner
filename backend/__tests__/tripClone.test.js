// Cloning a checklist from a past trip.
//
// The substance here is what carries over and what does not. Packed state must
// reset; weights must survive; and assignments must survive only when the
// assignee can actually see the new trip, because routes/items.js guarantees
// that an assignedTo always belongs to somebody with access and cloning is an
// easy way to break that from the side.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Collaborator } = require('../models');

async function seedUser(userId, email, name) {
  await User.create({
    userId, name, email,
    password: await bcrypt.hash('password123', 10),
    role: 'user', isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

let ownerToken, collabToken, outsiderToken, source;

const NEW_TRIP = { name: 'Autumn Return', terrain: 'Mountain', season: 'Fall', duration: 2 };

const create = (token, extra = {}) =>
  request(app).post('/trips').set('Authorization', `Bearer ${token}`).send({ ...NEW_TRIP, ...extra });

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ora Owner');
  collabToken = await seedUser('collab-1', 'collab@test.com', 'Cal Collaborator');
  outsiderToken = await seedUser('outsider-1', 'outsider@test.com', 'Otto Outsider');

  source = await Trip.create({
    userId: 'owner-1', name: 'Summer Original', terrain: 'Mountain',
    season: 'Summer', duration: 3, weightTarget: 12000,
  });
  await Collaborator.create({ tripId: source.tripId, userId: 'collab-1', name: 'Cal Collaborator' });

  await Item.insertMany([
    { tripId: source.tripId, name: 'Tent', category: 'Shelter', weight: 2000, packed: true, assignedTo: 'owner-1', source: 'ai', priority: 'essential' },
    { tripId: source.tripId, name: 'Stove', category: 'Food & Water', weight: 350, packed: true, assignedTo: 'collab-1' },
    { tripId: source.tripId, name: 'Trail mix', category: 'Food & Water', weight: null, packed: false, assignedTo: null },
  ]);
});

const itemsOf = (tripId) => Item.find({ tripId }).sort({ name: 1 }).lean();

describe('cloning the checklist', () => {
  test('copies every item from the source', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    expect(res.status).toBe(201);
    expect(res.body.checklistSource).toBe('cloned');
    expect(res.body.clonedFrom).toBe(source.tripId);
    expect(res.body.counts.copied).toBe(3);

    const copied = await itemsOf(res.body.trip.tripId);
    expect(copied.map(i => i.name).sort()).toEqual(['Stove', 'Tent', 'Trail mix']);
  });

  test('the copies belong to the new trip, and the source is untouched', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    expect(await Item.countDocuments({ tripId: source.tripId })).toBe(3);
    expect(await Item.countDocuments({ tripId: res.body.trip.tripId })).toBe(3);
    // Distinct rows, not moved ones.
    const sourceIds = (await itemsOf(source.tripId)).map(i => i.itemId);
    const newIds = (await itemsOf(res.body.trip.tripId)).map(i => i.itemId);
    expect(newIds.some(id => sourceIds.includes(id))).toBe(false);
  });

  test('packed state resets — a new trip starts unpacked', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const copied = await itemsOf(res.body.trip.tripId);
    expect(copied.every(i => i.packed === false)).toBe(true);
  });

  test('weights carry over, including a null', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const copied = await itemsOf(res.body.trip.tripId);
    const byName = Object.fromEntries(copied.map(i => [i.name, i]));
    expect(byName.Tent.weight).toBe(2000);
    expect(byName.Stove.weight).toBe(350);
    expect(byName['Trail mix'].weight).toBeNull();
  });

  test('category and priority carry over', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const byName = Object.fromEntries((await itemsOf(res.body.trip.tripId)).map(i => [i.name, i]));
    expect(byName.Tent.category).toBe('Shelter');
    expect(byName.Tent.priority).toBe('essential');
  });

  test("source becomes 'cloned', so a copied row is not still labelled a suggestion", async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const copied = await itemsOf(res.body.trip.tripId);
    expect(copied.every(i => i.source === 'cloned')).toBe(true);
  });

  test('the weight target is inherited', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    expect(res.body.trip.weightTarget).toBe(12000);

    const stored = await Trip.findOne({ tripId: res.body.trip.tripId }).lean();
    expect(stored.weightTarget).toBe(12000);
  });

  test('no AI generation runs — the list is exactly what was chosen', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    // A generated checklist would add its own items on top of the three.
    expect(await Item.countDocuments({ tripId: res.body.trip.tripId })).toBe(3);
  });
});

describe('assignments are filtered against the new trip, not copied blindly', () => {
  // routes/items.js refuses to assign an item to somebody without access to the
  // trip. Cloning must not become a way around that.
  test("the cloner's own assignments survive", async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const byName = Object.fromEntries((await itemsOf(res.body.trip.tripId)).map(i => [i.name, i]));
    expect(byName.Tent.assignedTo).toBe('owner-1');
  });

  test('assignments to people who are not on the new trip are cleared', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const byName = Object.fromEntries((await itemsOf(res.body.trip.tripId)).map(i => [i.name, i]));
    // Cal collaborates on the source but has no access to the brand-new trip.
    expect(byName.Stove.assignedTo).toBeNull();
  });

  test('the response reports how many assignments were kept and cleared', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    expect(res.body.counts.assignmentsKept).toBe(1);
    expect(res.body.counts.assignmentsCleared).toBe(2);
  });

  test('every surviving assignment points at somebody with access', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });

    const newTripId = res.body.trip.tripId;
    const collaborators = await Collaborator.find({ tripId: newTripId }).lean();
    const allowed = new Set(['owner-1', ...collaborators.map(c => c.userId)]);

    const copied = await itemsOf(newTripId);
    for (const item of copied) {
      if (item.assignedTo) expect(allowed.has(item.assignedTo)).toBe(true);
    }
  });

  test("a collaborator cloning keeps their own assignment, not the owner's", async () => {
    const res = await create(collabToken, { cloneFromTripId: source.tripId });

    const byName = Object.fromEntries((await itemsOf(res.body.trip.tripId)).map(i => [i.name, i]));
    expect(byName.Stove.assignedTo).toBe('collab-1');   // Cal owns the new trip
    expect(byName.Tent.assignedTo).toBeNull();          // Ora is not on it
  });
});

describe('access control', () => {
  test('a collaborator on the source may clone it', async () => {
    const res = await create(collabToken, { cloneFromTripId: source.tripId });
    expect(res.status).toBe(201);
    expect(res.body.counts.copied).toBe(3);
  });

  test('someone with no access to the source cannot clone it', async () => {
    const res = await create(outsiderToken, { cloneFromTripId: source.tripId });
    expect(res.status).toBe(403);
  });

  test('a failed clone leaves no orphan trip behind', async () => {
    const before = await Trip.countDocuments({ userId: 'outsider-1' });
    await create(outsiderToken, { cloneFromTripId: source.tripId });
    expect(await Trip.countDocuments({ userId: 'outsider-1' })).toBe(before);
  });

  test('an unknown source trip is a 404, and creates nothing', async () => {
    const res = await create(ownerToken, { cloneFromTripId: 'no-such-trip' });
    expect(res.status).toBe(404);
    expect(await Trip.countDocuments({ name: 'Autumn Return' })).toBe(0);
  });
});

describe('not cloning still works exactly as before', () => {
  test('omitting cloneFromTripId generates a checklist as usual', async () => {
    const res = await create(ownerToken);

    expect(res.status).toBe(201);
    expect(res.body.checklistSource).toBeUndefined();
    // The rule-based fallback always produces items for a Mountain trip.
    expect(await Item.countDocuments({ tripId: res.body.trip.tripId })).toBeGreaterThan(0);
    const generated = await itemsOf(res.body.trip.tripId);
    expect(generated.every(i => i.source !== 'cloned')).toBe(true);
  });

  test('cloning a source with an empty checklist yields an empty one, not a generated one', async () => {
    const empty = await Trip.create({
      userId: 'owner-1', name: 'Empty', terrain: 'Forest', season: 'Fall', duration: 1,
    });
    const res = await create(ownerToken, { cloneFromTripId: empty.tripId });

    expect(res.status).toBe(201);
    expect(res.body.counts.copied).toBe(0);
    expect(await Item.countDocuments({ tripId: res.body.trip.tripId })).toBe(0);
  });
});
