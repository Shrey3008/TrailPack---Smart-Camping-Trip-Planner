// Integration tests for /auth routes with a mocked DynamoDB client.
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const ddbMock = mockClient(DynamoDBDocumentClient);

// Require app AFTER the mock is installed so the routes use the mocked client.
const { app } = require('../server');

beforeEach(() => {
  ddbMock.reset();
});

describe('POST /auth/register', () => {
  test('400 when required fields missing', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test('400 when email already exists', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ email: 'dup@test.com' }] });
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Dup', email: 'dup@test.com', password: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test('201 on successful registration and hashes password', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'New User', email: 'new@test.com', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/registered/i);

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall).toBeDefined();
    const item = putCall.args[0].input.Item;
    expect(item.email).toBe('new@test.com');
    expect(item.password).not.toBe('secret123'); // must be hashed
    expect(item.role).toBe('user');
    expect(item.isActive).toBe(true);
    expect(item.userId).toBeTruthy();
  });
});

describe('POST /auth/login', () => {
  test('400 when fields missing', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('401 when user does not exist', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'missing@test.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('401 when password is wrong', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    ddbMock.on(ScanCommand).resolves({
      Items: [{ userId: 'u1', email: 'u@test.com', password: hashed, role: 'user' }],
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'u@test.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  test('200 with JWT + user payload on success', async () => {
    const hashed = await bcrypt.hash('right-password', 10);
    ddbMock.on(ScanCommand).resolves({
      Items: [{
        userId: 'u1',
        name: 'Test User',
        email: 'u@test.com',
        password: hashed,
        role: 'user',
      }],
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'u@test.com', password: 'right-password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({
      userId: 'u1',
      name: 'Test User',
      email: 'u@test.com',
      role: 'user',
    });
    // Password must never be returned.
    expect(res.body.user.password).toBeUndefined();
  });
});
