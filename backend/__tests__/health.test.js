// Integration tests for non-DB endpoints.
const request = require('supertest');
const { app } = require('../server');

describe('GET /health', () => {
  test('returns 200 with status payload', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('GET /', () => {
  test('returns API heartbeat', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/TrailPack/i);
  });
});

describe('CORS preflight', () => {
  test('allows whitelisted origin', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://trailpack.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('https://trailpack.com');
  });

  test('blocks unknown origin', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');
    // cors() rejects with the error middleware -> 500, and no allow-origin header.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
