// Integration tests for POST /ai/risk-analysis.
// The endpoint is pure rule-based logic, but it sits behind the authenticate
// middleware which loads the user from the database — so we seed a real user
// into the in-memory Mongo rather than stubbing a client.
const jwt = require('jsonwebtoken');
const request = require('supertest');

const db = require('./helpers/db');
const { app } = require('../server');
const { User } = require('../models');

const USER = {
  userId: 'u1',
  email: 'u@test.com',
  name: 'U',
  password: 'irrelevant-hash',
  role: 'user',
  isActive: true,
};

function makeToken(userId = USER.userId, role = 'user') {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(() => db.connect());
afterAll(() => db.close());

beforeEach(async () => {
  await db.clear();
  await User.create(USER);
});

describe('POST /ai/risk-analysis', () => {
  test('401 without token', async () => {
    const res = await request(app).post('/ai/risk-analysis').send({ terrain: 'Mountain' });
    expect(res.status).toBe(401);
  });

  test('returns Low risk for a short, easy Forest trip', async () => {
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ terrain: 'Forest', season: 'Fall', duration: 2, experience: 'Advanced' });

    expect(res.status).toBe(200);
    expect(res.body.overallRisk).toBe('Low');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.riskFactors)).toBe(true);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  test('returns High risk for a long, strenuous Mountain/Winter trip', async () => {
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ terrain: 'Mountain', season: 'Winter', duration: 7, experience: 'Beginner' });

    expect(res.status).toBe(200);
    expect(res.body.overallRisk).toBe('High');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(60);
    // Should mention key Mountain/Winter hazards.
    const factorsStr = res.body.riskFactors.join(' ').toLowerCase();
    expect(factorsStr).toMatch(/altitude|rockfall|hypothermia|avalanche/);
  });

  test('deduplicates repeated factors/recommendations', async () => {
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ terrain: 'Desert', season: 'Summer', duration: 5, experience: 'Intermediate' });

    expect(res.status).toBe(200);
    const factors = res.body.riskFactors;
    expect(new Set(factors).size).toBe(factors.length);
    const recs = res.body.recommendations;
    expect(new Set(recs).size).toBe(recs.length);
  });

  test('riskScore is capped at 100', async () => {
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ terrain: 'Mountain', season: 'Winter', duration: 30, experience: 'Beginner' });

    expect(res.status).toBe(200);
    expect(res.body.riskScore).toBeLessThanOrEqual(100);
  });

  test('401 when the token references a user that no longer exists', async () => {
    const res = await request(app)
      .post('/ai/risk-analysis')
      .set('Authorization', `Bearer ${makeToken('ghost-user')}`)
      .send({ terrain: 'Forest', season: 'Fall', duration: 2 });

    expect(res.status).toBe(401);
  });
});
