// Integration tests for the shared-trips invite/accept flow.
// Mocks DynamoDBDocumentClient with aws-sdk-client-mock and exercises the
// HTTP layer via supertest.
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const ddbMock = mockClient(DynamoDBDocumentClient);
const { app } = require('../server');

const OWNER = { userId: 'owner-1', email: 'owner@test.com', name: 'Owner', role: 'user', isActive: true };
const INVITEE = { userId: 'user-2', email: 'invitee@test.com', name: 'Invitee', role: 'user', isActive: true };
const STRANGER = { userId: 'user-9', email: 'stranger@test.com', name: 'Stranger', role: 'user', isActive: true };
const TRIP_ID = 'trip-abc';
const TRIP_ITEM = {
  PK: `USER#${OWNER.userId}`,
  SK: `TRIP#${TRIP_ID}`,
  tripId: TRIP_ID,
  userId: OWNER.userId,
  name: 'Epic Trip',
  terrain: 'Mountain',
  season: 'Summer',
  duration: 4,
};
const PTR_ITEM = {
  PK: `TRIPPTR#${TRIP_ID}`,
  SK: 'META',
  tripId: TRIP_ID,
  ownerId: OWNER.userId,
};

function tokenFor(user) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Routes-under-test require authenticate, which in turn calls dynamoDBService.getUserById.
// That helper uses GetCommand with Key: { userId }. Our handlers also use GetCommand for
// TRIPPTR and TRIP records, so we key the mock on PK/SK shape.
function defaultGetHandler(input) {
  const key = input.Key || {};
  if (key.userId) {
    // Users lookup from middleware.
    if (key.userId === OWNER.userId) return { Item: OWNER };
    if (key.userId === INVITEE.userId) return { Item: INVITEE };
    if (key.userId === STRANGER.userId) return { Item: STRANGER };
    return {};
  }
  if (key.PK === `TRIPPTR#${TRIP_ID}` && key.SK === 'META') return { Item: PTR_ITEM };
  if (key.PK === `USER#${OWNER.userId}` && key.SK === `TRIP#${TRIP_ID}`) return { Item: TRIP_ITEM };
  // Default: "not a collaborator" / "no such item"
  return {};
}

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(GetCommand).callsFake(defaultGetHandler);
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(DeleteCommand).resolves({});
  ddbMock.on(UpdateCommand).resolves({});
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(ScanCommand).resolves({ Items: [] });
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

  test('201 with a token and invite payload on success', async () => {
    const res = await request(app)
      .post(`/trips/${TRIP_ID}/invites`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`)
      .send({ email: 'new-person@test.com' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.invite.email).toBe('new-person@test.com');
    expect(res.body.invite.expiresAt).toBeTruthy();
    expect(res.body.acceptUrl).toMatch(/token=/);
    // Must have written the invite row.
    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls.some(c => (c.args[0].input.Item.SK || '').startsWith('INVITE#'))).toBe(true);
  });

  test('400 when inviting an already-accepted collaborator', async () => {
    // Existing user lookup finds the invitee.
    ddbMock.on(ScanCommand).resolves({ Items: [INVITEE] });
    // Current collaborators include them.
    ddbMock.on(QueryCommand).callsFake(input => {
      if (input.ExpressionAttributeValues[':pk'] === `TRIP#${TRIP_ID}`
        && input.ExpressionAttributeValues[':sk'] === 'PARTICIPANT#') {
        return { Items: [{ userId: INVITEE.userId, email: INVITEE.email }] };
      }
      return { Items: [] };
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
  const INVITE_ITEM = {
    PK: `TRIP#${TRIP_ID}`,
    SK: 'INVITE#inv-1',
    inviteId: 'inv-1',
    tripId: TRIP_ID,
    email: INVITEE.email,
    token: TOKEN,
    status: 'pending',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  test('400 when token missing', async () => {
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('404 when token does not match any invite', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: 'nope' });
    expect(res.status).toBe(404);
  });

  test('403 when invite was sent to a different email', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ ...INVITE_ITEM, email: 'other@test.com' }] });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(res.status).toBe(403);
  });

  test('400 when invite is expired', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ ...INVITE_ITEM, expiresAt: new Date(Date.now() - 1000).toISOString() }] });
    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });
    expect(res.status).toBe(400);
  });

  test('accepts invite, marks accepted, writes collaborator + reverse lookup', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [INVITE_ITEM] });

    const res = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`)
      .send({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe(TRIP_ID);

    // Invite marked accepted
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    const updated = updateCalls.find(c => c.args[0].input.Key.SK === 'INVITE#inv-1');
    expect(updated).toBeDefined();

    // Collaborator row + reverse SHARED_TRIP# lookup both written
    const putItems = ddbMock.commandCalls(PutCommand).map(c => c.args[0].input.Item);
    expect(putItems.some(i => i.SK === `PARTICIPANT#${INVITEE.userId}`)).toBe(true);
    expect(putItems.some(i => i.SK === `SHARED_TRIP#${TRIP_ID}`)).toBe(true);
  });
});

describe('GET /trips/:id (access control via service)', () => {
  // This exercises the pointer + owner-check path even though the route itself
  // is in trips.js — confirms the end-to-end access model.
  test('owner can fetch', async () => {
    const res = await request(app)
      .get(`/trips/${TRIP_ID}`)
      .set('Authorization', `Bearer ${tokenFor(OWNER)}`);
    // Note: the existing GET /trips/:id in trips.js uses PK: USER#userId so it
    // still works for the owner. This assertion just confirms we didn't break it.
    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe(TRIP_ID);
  });
});

describe('GET /shared-trips/mine', () => {
  test('returns reverse-lookup trips for a user', async () => {
    // User has one SHARED_TRIP# row.
    ddbMock.on(QueryCommand).callsFake(input => {
      const pk = input.ExpressionAttributeValues[':pk'];
      const sk = input.ExpressionAttributeValues[':sk'];
      if (pk === `USER#${INVITEE.userId}` && sk === 'SHARED_TRIP#') {
        return { Items: [{ tripId: TRIP_ID, joinedAt: new Date().toISOString() }] };
      }
      return { Items: [] };
    });

    const res = await request(app)
      .get('/shared-trips/mine')
      .set('Authorization', `Bearer ${tokenFor(INVITEE)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trips)).toBe(true);
    expect(res.body.trips[0]).toMatchObject({ tripId: TRIP_ID, name: 'Epic Trip', ownerId: OWNER.userId });
  });
});
