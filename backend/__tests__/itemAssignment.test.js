// Item assignment: who is carrying what on a shared trip.
//
// The interesting cases are not "does the field save" but the boundaries around
// it — that you cannot name a carrier who has no access to the trip, that
// assigning does not disturb packed state (and vice versa), that re-assigning
// the same person twice does not ping them twice, and that undo carries the
// assignment back rather than silently dropping it.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Item, Notification, Collaborator } = require('../models');
const {
  flushAssignmentNotices,
  resetAssignmentNotices,
} = require('../services/assignmentNotifier');

async function seedUser(userId, email, name) {
  await User.create({
    userId, name, email,
    password: await bcrypt.hash('password123', 10),
    role: 'user', isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

let ownerToken, collabToken, outsiderToken, trip, item;

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  // Notices are coalesced in memory; a pending burst must not leak into the
  // next test's counts.
  resetAssignmentNotices();
  ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ora Owner');
  collabToken = await seedUser('collab-1', 'collab@test.com', 'Cal Collaborator');
  outsiderToken = await seedUser('outsider-1', 'outsider@test.com', 'Otto Outsider');

  trip = await Trip.create({
    userId: 'owner-1', name: 'Rainier Traverse', terrain: 'Mountain',
    season: 'Summer', duration: 3,
  });
  await Collaborator.create({ tripId: trip.tripId, userId: 'collab-1', email: 'collab@test.com', name: 'Cal Collaborator' });
  item = await Item.create({ tripId: trip.tripId, name: 'Tent', category: 'Shelter' });
});

const patch = (token, body) =>
  request(app)
    .patch(`/trips/${trip.tripId}/items/${item.itemId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('assigning an item', () => {
  test('the owner can assign to a collaborator', async () => {
    const res = await patch(ownerToken, { assignedTo: 'collab-1' });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe('collab-1');

    const stored = await Item.findOne({ itemId: item.itemId }).lean();
    expect(stored.assignedTo).toBe('collab-1');
  });

  test('a collaborator can assign too — item routes take access, not ownership', async () => {
    const res = await patch(collabToken, { assignedTo: 'owner-1' });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo).toBe('owner-1');
  });

  test('assigning to someone with no access to the trip is refused', async () => {
    const res = await patch(ownerToken, { assignedTo: 'outsider-1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not on this trip/i);

    const stored = await Item.findOne({ itemId: item.itemId }).lean();
    expect(stored.assignedTo).toBeNull();
  });

  test('a user with no access to the trip cannot assign at all', async () => {
    const res = await patch(outsiderToken, { assignedTo: 'collab-1' });
    expect(res.status).toBe(403);
  });

  test('null and empty string both clear the assignment', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });

    expect((await patch(ownerToken, { assignedTo: null })).body.assignedTo).toBeNull();

    await patch(ownerToken, { assignedTo: 'collab-1' });
    expect((await patch(ownerToken, { assignedTo: '' })).body.assignedTo).toBeNull();
  });

  test('an empty body is rejected rather than silently doing nothing', async () => {
    const res = await patch(ownerToken, {});
    expect(res.status).toBe(400);
  });
});

describe('assignment and packed state are independent', () => {
  test('assigning does not disturb packed', async () => {
    await patch(ownerToken, { packed: true });
    const res = await patch(ownerToken, { assignedTo: 'collab-1' });
    expect(res.body.packed).toBe(true);
    expect(res.body.assignedTo).toBe('collab-1');
  });

  test('toggling packed does not disturb the assignee', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });
    const res = await patch(ownerToken, { packed: true });
    expect(res.body.assignedTo).toBe('collab-1');
    expect(res.body.packed).toBe(true);
  });

  test('the pre-existing packed-only call still behaves exactly as before', async () => {
    const res = await patch(ownerToken, { packed: true });
    expect(res.status).toBe(200);
    expect(res.body.packed).toBe(true);
    expect(res.body.assignedTo).toBeNull();
  });
});

describe('notifying the person now carrying the item', () => {
  test('the assignee gets a notification naming the item and trip', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });
    await flushAssignmentNotices();

    const notes = await Notification.find({ userId: 'collab-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('item-assignment');
    expect(notes[0].message).toMatch(/Tent/);
    expect(notes[0].message).toMatch(/Rainier Traverse/);
    expect(notes[0].read).toBe(false);
  });

  test('assigning to yourself notifies nobody', async () => {
    await patch(ownerToken, { assignedTo: 'owner-1' });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({})).toBe(0);
  });

  test('re-assigning the same person does not ping them twice', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });
    await patch(ownerToken, { assignedTo: 'collab-1' });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({ userId: 'collab-1' })).toBe(1);
  });

  test('unassigning notifies nobody', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });
    await patch(ownerToken, { assignedTo: null });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({})).toBe(0);
  });

  test('a packed-only update never notifies', async () => {
    await patch(ownerToken, { packed: true });
    await flushAssignmentNotices();
    expect(await Notification.countDocuments({})).toBe(0);
  });
});

describe('a burst of assignments collapses into one notification', () => {
  // The checklist assigns one row at a time, so handing someone a whole
  // category is a burst of PATCHes. Twelve near-identical rows in the bell is
  // worse than one summary — it trains people to ignore the bell.
  async function assign(itemId, token, assignedTo) {
    return request(app)
      .patch(`/trips/${trip.tripId}/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedTo });
  }

  test('twelve items to one person produce a single summarised notification', async () => {
    const extra = [];
    for (let i = 0; i < 11; i += 1) {
      extra.push(await Item.create({ tripId: trip.tripId, name: `Gear ${i}`, category: 'Misc' }));
    }
    await assign(item.itemId, ownerToken, 'collab-1');
    for (const it of extra) await assign(it.itemId, ownerToken, 'collab-1');
    await flushAssignmentNotices();

    const notes = await Notification.find({ userId: 'collab-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/12 items/);
    expect(notes[0].message).toMatch(/Rainier Traverse/);
  });

  test('two items read as a list rather than a count', async () => {
    const second = await Item.create({ tripId: trip.tripId, name: 'Stove', category: 'Cooking' });
    await assign(item.itemId, ownerToken, 'collab-1');
    await assign(second.itemId, ownerToken, 'collab-1');
    await flushAssignmentNotices();

    const notes = await Notification.find({ userId: 'collab-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/"Tent" and "Stove"/);
  });

  test('a single assignment still reads exactly as it did before batching', async () => {
    await assign(item.itemId, ownerToken, 'collab-1');
    await flushAssignmentNotices();

    const notes = await Notification.find({ userId: 'collab-1' }).lean();
    expect(notes[0].message).toBe('Ora Owner asked you to bring "Tent" for "Rainier Traverse".');
  });

  test('different assignees get their own notification, not a shared one', async () => {
    const second = await Item.create({ tripId: trip.tripId, name: 'Stove', category: 'Cooking' });
    await assign(item.itemId, collabToken, 'owner-1');
    await assign(second.itemId, ownerToken, 'collab-1');
    await flushAssignmentNotices();

    expect(await Notification.countDocuments({ userId: 'owner-1' })).toBe(1);
    expect(await Notification.countDocuments({ userId: 'collab-1' })).toBe(1);
  });

  test('reassigning mid-window drops the item from the first person', async () => {
    await assign(item.itemId, ownerToken, 'collab-1');
    // Corrected before the window elapses — collab-1 never actually carries it.
    await assign(item.itemId, ownerToken, 'owner-1');
    await flushAssignmentNotices();

    expect(await Notification.countDocuments({ userId: 'collab-1' })).toBe(0);
  });

  test('assign-then-unassign inside the window notifies nobody at all', async () => {
    await assign(item.itemId, ownerToken, 'collab-1');
    await assign(item.itemId, ownerToken, null);
    await flushAssignmentNotices();

    expect(await Notification.countDocuments({})).toBe(0);
  });

  test('one item of a burst being withdrawn leaves the rest summarised', async () => {
    const second = await Item.create({ tripId: trip.tripId, name: 'Stove', category: 'Cooking' });
    await assign(item.itemId, ownerToken, 'collab-1');
    await assign(second.itemId, ownerToken, 'collab-1');
    await assign(item.itemId, ownerToken, null);
    await flushAssignmentNotices();

    const notes = await Notification.find({ userId: 'collab-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/"Stove"/);
    expect(notes[0].message).not.toMatch(/Tent/);
  });

  test('the window really does fire on its own, without an explicit flush', async () => {
    const previous = process.env.ASSIGNMENT_NOTICE_WINDOW_MS;
    process.env.ASSIGNMENT_NOTICE_WINDOW_MS = '40';
    try {
      await assign(item.itemId, ownerToken, 'collab-1');
      expect(await Notification.countDocuments({})).toBe(0);   // still held
      await new Promise(r => setTimeout(r, 140));
      expect(await Notification.countDocuments({ userId: 'collab-1' })).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.ASSIGNMENT_NOTICE_WINDOW_MS;
      else process.env.ASSIGNMENT_NOTICE_WINDOW_MS = previous;
    }
  });
});

describe('undo carries the assignment back', () => {
  // Removal is reversible from a toast, but the restore re-creates the row
  // rather than resurrecting it — so POST /items has to accept assignedTo or
  // the carrier is quietly lost on undo.
  test('POST /items accepts an assignee', async () => {
    const res = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tripId: trip.tripId, name: 'Stove', category: 'Cooking', assignedTo: 'collab-1' });

    expect(res.status).toBe(201);
    expect(res.body.assignedTo).toBe('collab-1');
  });

  test('POST /items still works with no assignee, and defaults to unassigned', async () => {
    const res = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tripId: trip.tripId, name: 'Stove', category: 'Cooking' });

    expect(res.status).toBe(201);
    expect(res.body.assignedTo).toBeNull();
  });

  test('POST /items refuses an assignee who is not on the trip', async () => {
    const res = await request(app)
      .post('/items')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tripId: trip.tripId, name: 'Stove', category: 'Cooking', assignedTo: 'outsider-1' });

    expect(res.status).toBe(400);
    expect(await Item.countDocuments({ name: 'Stove' })).toBe(0);
  });
});

describe('reading items back', () => {
  test('GET /trips/:id/items includes assignedTo', async () => {
    await patch(ownerToken, { assignedTo: 'collab-1' });

    const res = await request(app)
      .get(`/trips/${trip.tripId}/items`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.find(i => i.itemId === item.itemId).assignedTo).toBe('collab-1');
  });
});
