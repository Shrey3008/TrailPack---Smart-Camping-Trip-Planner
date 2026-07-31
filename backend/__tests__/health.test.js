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

  test('blocks unknown origin with 403 and no allow-origin header', async () => {
    // The rejection is logged as a [CORS] warning; silence it so a passing run
    // stays quiet. console.error is spied on separately below to assert that
    // an expected client error does NOT dump a stack trace.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app)
        .options('/health')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'GET');

      // A disallowed origin is a client error, not a server fault.
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      // Expected rejections must not be logged as server faults.
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
