// Integration tests for /auth register + login against an in-memory MongoDB.
// Assertions now read the persisted User document instead of inspecting the
// DynamoDB PutCommand that used to be intercepted.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User } = require('../models');

// Must be one of ALLOWED_SECURITY_QUESTIONS in routes/auth.js.
const QUESTION = 'What was the name of your first pet?';

function registerPayload(overrides = {}) {
  return {
    name: 'New User',
    email: 'new@test.com',
    password: 'secret123',
    securityQuestion: QUESTION,
    securityAnswer: 'Rex',
    ...overrides,
  };
}

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(() => db.clear());

describe('POST /auth/register', () => {
  test('400 when required fields missing', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  test('400 when the security question is missing', async () => {
    const { securityQuestion, ...rest } = registerPayload();
    const res = await request(app).post('/auth/register').send(rest);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/security question/i);
  });

  test('400 when the security question is not in the allowed list', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send(registerPayload({ securityQuestion: 'Favourite colour?' }));
    expect(res.status).toBe(400);
  });

  test('400 when email already exists', async () => {
    await request(app).post('/auth/register').send(registerPayload({ email: 'dup@test.com' }));

    const res = await request(app)
      .post('/auth/register')
      .send(registerPayload({ email: 'dup@test.com', name: 'Dup' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
    expect(await User.countDocuments({ email: 'dup@test.com' })).toBe(1);
  });

  test('201 on success and persists a hashed password', async () => {
    const res = await request(app).post('/auth/register').send(registerPayload());

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/registered/i);

    const stored = await User.findOne({ email: 'new@test.com' }).lean();
    expect(stored).toBeTruthy();
    expect(stored.email).toBe('new@test.com');
    expect(stored.password).not.toBe('secret123'); // must be hashed
    expect(stored.password).toMatch(/^\$2[aby]\$/);
    expect(stored.role).toBe('user');
    expect(stored.isActive).toBe(true);
    expect(stored.userId).toBeTruthy();
  });

  test('normalizes email to lowercase and the security answer for recovery', async () => {
    await request(app)
      .post('/auth/register')
      .send(registerPayload({ email: 'MiXeD@Test.COM', securityAnswer: '  ReX  ' }));

    const stored = await User.findOne({ email: 'mixed@test.com' }).lean();
    expect(stored).toBeTruthy();
    expect(stored.securityAnswer).toBe('rex');
  });

  test('never stores the security answer in plain-text casing that breaks matching', async () => {
    await request(app).post('/auth/register').send(registerPayload({ securityAnswer: 'REX' }));
    const stored = await User.findOne({ email: 'new@test.com' }).lean();
    expect(stored.securityQuestion).toBe(QUESTION);
    expect(stored.securityAnswer).toBe('rex');
  });
});

describe('POST /auth/login', () => {
  async function seedUser(overrides = {}) {
    return User.create({
      userId: 'u1',
      name: 'Test User',
      email: 'u@test.com',
      password: await bcrypt.hash('right-password', 10),
      role: 'user',
      isActive: true,
      ...overrides,
    });
  }

  test('400 when fields missing', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('401 when user does not exist', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'missing@test.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test('401 when password is wrong', async () => {
    await seedUser();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'u@test.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  test('200 with JWT + user payload on success', async () => {
    await seedUser();

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

  test('login is case-insensitive on email', async () => {
    await seedUser();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'U@TEST.COM', password: 'right-password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
