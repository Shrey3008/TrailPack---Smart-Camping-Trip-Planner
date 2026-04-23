// Tests for the profile endpoints on /auth (me, profile, password).
const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const ddbMock = mockClient(DynamoDBDocumentClient);
const { app } = require('../server');

const USER = {
  userId: 'u1',
  email: 'me@test.com',
  name: 'Me',
  role: 'user',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function tokenFor(user = USER) {
  return jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  ddbMock.reset();
  // Default: authenticate middleware looks up the user by userId.
  ddbMock.on(GetCommand).callsFake(input => {
    if (input.Key && input.Key.userId === USER.userId) return { Item: USER };
    return {};
  });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(UpdateCommand).resolves({ Attributes: USER });
});

describe('GET /auth/me', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns user payload + stats, never the password hash', async () => {
    ddbMock.on(QueryCommand).callsFake(input => {
      const pk = input.ExpressionAttributeValues[':pk'];
      if (pk === `USER#${USER.userId}`) {
        return { Items: [
          { tripId: 't1', status: 'planned' },
          { tripId: 't2', status: 'completed' },
        ] };
      }
      // Items query for each trip.
      if (pk === 'TRIP#t1') return { Items: [{ itemId: 'i1', packed: true }, { itemId: 'i2', packed: false }] };
      if (pk === 'TRIP#t2') return { Items: [{ itemId: 'i3', packed: true }] };
      return { Items: [] };
    });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      userId: USER.userId,
      email: USER.email,
      name: USER.name,
      role: USER.role,
    });
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.stats).toEqual({
      totalTrips: 2,
      completedTrips: 1,
      totalItemsPacked: 2,
      joinedAt: USER.createdAt,
    });
  });
});

describe('PUT /auth/profile', () => {
  test('401 without token', async () => {
    const res = await request(app).put('/auth/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  test('400 when no updatable fields provided', async () => {
    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('accepts name + phone + notificationSettings and returns sanitized user', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { ...USER, name: 'Updated', profile: { phone: '555', notificationSettings: { email: false } } },
    });
    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ name: 'Updated', phone: '555', notificationSettings: { email: false } });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated');
    expect(res.body.user.profile.phone).toBe('555');
    expect(res.body.user.password).toBeUndefined();
    // Two UpdateCommands: one to ensure profile map exists, one for the SET.
    expect(ddbMock.commandCalls(UpdateCommand).length).toBeGreaterThanOrEqual(2);
  });
});

describe('PUT /auth/password', () => {
  const userWithHash = async () => ({
    ...USER,
    password: await bcrypt.hash('current-secret', 10),
  });

  test('400 when fields missing', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('400 when newPassword too short', async () => {
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'current-secret', newPassword: 'abc' });
    expect(res.status).toBe(400);
  });

  test('401 when currentPassword is wrong', async () => {
    const full = await userWithHash();
    // Return a fresh copy each call — the authenticate middleware deletes
    // `password` off its returned object, which would otherwise poison the
    // subsequent GET inside the route.
    ddbMock.on(GetCommand).callsFake(input => {
      if (input.Key && input.Key.userId === USER.userId) return { Item: { ...full } };
      return {};
    });
    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'wrong-secret', newPassword: 'new-secret-1' });
    expect(res.status).toBe(401);
  });

  test('200 on success and writes new hashed password', async () => {
    const full = await userWithHash();
    ddbMock.on(GetCommand).callsFake(input => {
      if (input.Key && input.Key.userId === USER.userId) return { Item: { ...full } };
      return {};
    });

    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ currentPassword: 'current-secret', newPassword: 'brand-new-secret' });

    expect(res.status).toBe(200);

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const last = updates[updates.length - 1].args[0].input;
    expect(last.ExpressionAttributeValues[':p']).not.toBe('brand-new-secret'); // must be hashed
    expect(last.ExpressionAttributeValues[':p']).toMatch(/^\$2[aby]\$/);
  });
});
