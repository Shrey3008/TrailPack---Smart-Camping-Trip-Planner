// Integration tests for the shared-trips invite/accept flow.
//
// The DynamoDB single-table encoding these tests used to assert on (PARTICIPANT#
// / SHARED_TRIP# / TRIPPTR# rows) no longer exists — collaborators are now a
// single Collaborator collection queryable in both directions. Assertions
// therefore check the persisted documents instead of emitted SDK commands.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Invite, Collaborator } = require('../models');

const OWNER = { userId: 'owner-1', email: 'owner@test.com', name: 'Owner', role: 'user', isActive: true };
const INVITEE = { userId: 'user-2', email: 'invitee@test.com', name: 'Invitee', role: 'user', isActive: true };
const STRANGER = { userId: 'user-9', email: 'stranger@test.com', name: 'Stranger', role: 'user', isActive: true };
const TRIP_ID = 'trip-abc';

function tokenFor(user) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function seedInvite(overrides = {}) {
  return Invite.create({
    inviteId: 'inv-1',
    tripId: TRIP_ID,
    email: INVITEE.email,
    token: 'good-token-xyz',
    status: 'pending',
    invitedBy: OWNER.userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await User.create([
    { ...OWNER, password: 'x' },
    { ...INVITEE, password: 'x' },
    { ...STRANGER, password: 'x' },
  ]);
  await Trip.create({
    tripId: TRIP_ID,
    userId: OWNER.userId,
    name: 'Epic Trip',
    terrain: 'Mountain',
    season: 'Summer',
    duration: 4,
  });
});

describe('POST /trips/:id/invites', () => {
  test('403 when caller is not the owner', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(STRANGER)}`)
      .send({ email: 'x@y.com' });
    expect(res.status).toBe(403);
  });

  test('400 when email is missing or invalid', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('201 with a token and invite payload on success, and persists the invite', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: 'new-person@test.com' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.invite.email).toBe('new-person@test.com');
    expect(res.body.invite.expiresAt).toBeTruthy();
    expect(res.body.acceptUrl).toMatch(/token=/);

    const stored = await Invite.findOne({ token: res.body.token }).lean();
    expect(stored).toBeTruthy();
    expect(stored.tripId).toBe(TRIP_ID);
    expect(stored.email).toBe('new-person@test.com');
    expect(stored.status).toBe('pending');
    expect(stored.invitedBy).toBe(OWNER.userId);
  });

  test('normalizes the invited email to lowercase', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: '  MiXeD@Test.COM ' });

    expect(res.status).toBe(201);
    expect(res.body.invite.email).toBe('mixed@test.com');
  });

  test('400 when the owner invites themselves', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: OWNER.email });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/owner/i);
  });

  test('400 when inviting an already-accepted collaborator', async () => {
    await Collaborator.create({
      tripId: TRIP_ID,
      userId: INVITEE.userId,
      email: INVITEE.email,
      name: INVITEE.name,
    });

    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: INVITEE.email });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already a collaborator/i);
  });
});

describe('POST /invites/accept', () => {
  const TOKEN = 'good-token-xyz';

  test('400 when token missing', async () => {
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('404 when token does not match any invite', async () => {
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: 'nope' });
    expect(res.status).toBe(404);
  });

  test('403 when invite was sent to a different email', async () => {
    await seedInvite({ email: 'other@test.com' });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(res.status).toBe(403);
  });

  test('400 when invite is expired', async () => {
    await seedInvite({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(res.status).toBe(400);
  });

  test('400 when the invite has already been accepted', async () => {
    await seedInvite({ status: 'accepted' });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(res.status).toBe(400);
  });

  test('accepts invite, marks it accepted, and creates the collaborator row', async () => {
    await seedInvite();

    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe(TRIP_ID);

    const invite = await Invite.findOne({ inviteId: 'inv-1' }).lean();
    expect(invite.status).toBe('accepted');
    expect(invite.acceptedBy).toBe(INVITEE.userId);
    expect(invite.acceptedAt).toBeTruthy();

    // One collaborator row now serves both lookup directions.
    const collab = await Collaborator.findOne({ tripId: TRIP_ID, userId: INVITEE.userId }).lean();
    expect(collab).toBeTruthy();
    expect(collab.email).toBe(INVITEE.email);
  });

  test('a second accept of the same token is rejected', async () => {
    await seedInvite();
    const first = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(second.status).toBe(400);

    // Still exactly one collaborator row.
    expect(await Collaborator.countDocuments({ tripId: TRIP_ID, userId: INVITEE.userId })).toBe(1);
  });
});

describe('GET /trips/:id (access control)', () => {
  test('owner can fetch', async () => {
    const res = await request(app)
      .get(`/trips/${TRIP_ID}`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);

    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe(TRIP_ID);
  });
});

describe('GET /shared-trips/mine', () => {
  test('returns an empty list when nothing is shared with the user', async () => {
    const res = await request(app)
      .get('/shared-trips/mine')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`);

    expect(res.status).toBe(200);
    expect(res.body.trips).toEqual([]);
  });

  test('returns trips shared with the user, with the owner attached', async () => {
    await Collaborator.create({
      tripId: TRIP_ID,
      userId: INVITEE.userId,
      email: INVITEE.email,
      name: INVITEE.name,
    });

    const res = await request(app)
      .get('/shared-trips/mine')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trips)).toBe(true);
    expect(res.body.trips[0]).toMatchObject({
      tripId: TRIP_ID,
      name: 'Epic Trip',
      ownerId: OWNER.userId,
    });
  });

  test("does not leak another user's shared trips", async () => {
    await Collaborator.create({
      tripId: TRIP_ID,
      userId: INVITEE.userId,
      email: INVITEE.email,
    });

    const res = await request(app)
      .get('/shared-trips/mine')
      .set('Authorization', `Bearer ${tokenFor(STRANGER)}`);

    expect(res.status).toBe(200);
    expect(res.body.trips).toEqual([]);
  });
});
