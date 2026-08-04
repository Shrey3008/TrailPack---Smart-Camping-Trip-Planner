// Where assignment, pack weight and cloning meet.
//
// Each feature is tested on its own elsewhere. These are the seams: a rule one
// feature guarantees, reached through a door another one opened. The clone path
// in particular writes items with insertMany, bypassing the assign endpoint
// that enforces the access rule — so the rule has to be checked on the far side
// of a clone, not just at the endpoint that normally protects it.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Collaborator, Notification } = require('../models');
const { flushAssignmentNotices, resetAssignmentNotices } = require('../services/assignmentNotifier');

async function seedUser(userId, email, name) {
  await User.create({
    userId, name, email,
    password: await bcrypt.hash('password123', 10),
    role: 'user', isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

let ownerToken, collabToken, source;

const create = (token, extra = {}) =>
  request(app).post('/trips').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Cloned Trip', terrain: 'Mountain', season: 'Fall', duration: 2, ...extra });

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  resetAssignmentNotices();
  ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ora Owner');
  collabToken = await seedUser('collab-1', 'collab@test.com', 'Cal Collaborator');

  source = await Trip.create({
    userId: 'owner-1', name: 'Source', terrain: 'Mountain', season: 'Summer',
    duration: 3, weightTarget: 12000,
  });
  await Collaborator.create({ tripId: source.tripId, userId: 'collab-1', name: 'Cal Collaborator' });

  await Item.insertMany([
    { tripId: source.tripId, name: 'Tent', category: 'Shelter', weight: 2000, packed: true, assignedTo: 'owner-1' },
    { tripId: source.tripId, name: 'Stove', category: 'Food & Water', weight: 350, packed: true, assignedTo: 'collab-1' },
    { tripId: source.tripId, name: 'Stove fuel', category: 'Tools', weight: 380, assignedTo: 'collab-1' },
    { tripId: source.tripId, name: 'Trail mix', category: 'Food & Water', weight: null },
  ]);
});

describe('Feature 3 does not smuggle past Feature 1s access rule', () => {
  test('no cloned item names an assignee who lacks access to the new trip', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const newTripId = res.body.trip.tripId;

    // The invariant, checked directly against the destination's membership
    // rather than against what the clone claims it did.
    const collaborators = await Collaborator.find({ tripId: newTripId }).lean();
    const allowed = new Set([res.body.trip.userId, ...collaborators.map(c => c.userId)]);

    const items = await Item.find({ tripId: newTripId }).lean();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      if (item.assignedTo) expect(allowed.has(item.assignedTo)).toBe(true);
    }
  });

  test('the assign endpoint still refuses the assignee the clone stripped', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const newTripId = res.body.trip.tripId;
    const stove = await Item.findOne({ tripId: newTripId, name: 'Stove' }).lean();

    // Cal was on the source, is not on the clone, and cannot be put back by
    // hand either — the clone stripping the assignment and the endpoint
    // refusing it are the same rule, not two different ones.
    const attempt = await request(app)
      .patch(`/trips/${newTripId}/items/${stove.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assignedTo: 'collab-1' });

    expect(attempt.status).toBe(400);
    expect(attempt.body.message).toMatch(/not on this trip/i);
  });

  test('once invited, the same person can be assigned the cloned item', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const newTripId = res.body.trip.tripId;
    const stove = await Item.findOne({ tripId: newTripId, name: 'Stove' }).lean();

    // This is the remedy the clone message tells the user about, so it had
    // better work.
    await Collaborator.create({ tripId: newTripId, userId: 'collab-1', name: 'Cal Collaborator' });

    const attempt = await request(app)
      .patch(`/trips/${newTripId}/items/${stove.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assignedTo: 'collab-1' });

    expect(attempt.status).toBe(200);
    expect(attempt.body.assignedTo).toBe('collab-1');
  });

  test('cloning notifies nobody — insertMany must not wake the notifier', async () => {
    await create(ownerToken, { cloneFromTripId: source.tripId });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({})).toBe(0);
  });
});

describe('Feature 2 survives a clone intact', () => {
  test('the weight rollup on a cloned trip matches the copied items', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const newTripId = res.body.trip.tripId;

    const weight = await request(app)
      .get(`/trips/${newTripId}/weight`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(weight.status).toBe(200);
    expect(weight.body.totalGrams).toBe(2730);              // 2000 + 350 + 380
    expect(weight.body.targetGrams).toBe(12000);            // inherited
    expect(weight.body.counts).toEqual({ items: 4, weighed: 3, unweighed: 1 });
  });

  test('base/consumable classification is unchanged by cloning', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const newTripId = res.body.trip.tripId;

    const weight = await request(app)
      .get(`/trips/${newTripId}/weight`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Tent base; Stove durable-in-Food&Water so base; fuel consumable
    // wherever filed; Trail mix consumable with no weight.
    expect(weight.body.split).toEqual({
      baseGrams: 2350, baseItems: 2,
      consumableGrams: 380, consumableItems: 2,
    });
    expect(weight.body.split.baseGrams + weight.body.split.consumableGrams)
      .toBe(weight.body.totalGrams);
  });

  test('a cloned null weight stays unweighed rather than becoming zero', async () => {
    const res = await create(ownerToken, { cloneFromTripId: source.tripId });
    const mix = await Item.findOne({ tripId: res.body.trip.tripId, name: 'Trail mix' }).lean();
    expect(mix.weight).toBeNull();
  });
});

describe('Feature 2 did not disturb Feature 1', () => {
  test('a weight-only PATCH neither reassigns nor notifies', async () => {
    const item = await Item.findOne({ tripId: source.tripId, name: 'Stove' }).lean();

    const res = await request(app)
      .patch(`/trips/${source.tripId}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ weight: 400 });

    expect(res.body.weight).toBe(400);
    expect(res.body.assignedTo).toBe('collab-1');   // untouched
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({})).toBe(0);
  });

  test('all three fields can move at once without interfering', async () => {
    const item = await Item.findOne({ tripId: source.tripId, name: 'Trail mix' }).lean();

    const res = await request(app)
      .patch(`/trips/${source.tripId}/items/${item.itemId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ weight: 600, packed: true, assignedTo: 'collab-1' });

    expect(res.body).toMatchObject({ weight: 600, packed: true, assignedTo: 'collab-1' });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({ userId: 'collab-1' })).toBe(1);
  });
});

describe('undo still restores everything all three features care about', () => {
  test('a removed item comes back with weight and assignment intact', async () => {
    const item = await Item.findOne({ tripId: source.tripId, name: 'Tent' }).lean();

    await request(app)
      .delete(`/items/${item.itemId}?tripId=${source.tripId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(await Item.countDocuments({ tripId: source.tripId, name: 'Tent' })).toBe(0);

    // What checklist.html sends on Undo.
    const restored = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        tripId: source.tripId, name: item.name, category: item.category,
        assignedTo: item.assignedTo, weight: item.weight,
      });

    expect(restored.status).toBe(201);
    expect(restored.body.weight).toBe(2000);
    expect(restored.body.assignedTo).toBe('owner-1');
    expect(restored.body.packed).toBe(false);
  });
});
