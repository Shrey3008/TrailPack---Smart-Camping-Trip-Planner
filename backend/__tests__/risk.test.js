// Integration tests for POST /ai/risk-analysis.
// The endpoint is pure rule-based logic, but it still sits behind the authenticate
// middleware which fetches a user from DynamoDB — so we mock the DocumentClient.
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const ddbMock = mockClient(DynamoDBDocumentClient);
const { app } = require('../server');

function makeToken(userId = 'u1', role = 'user') {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  ddbMock.reset();
  // Authenticate middleware looks up the user; return a valid one by default.
  ddbMock.on(GetCommand).resolves({
    Item: { userId: 'u1', email: 'u@test.com', name: 'U', role: 'user', isActive: true },
  });
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
});
