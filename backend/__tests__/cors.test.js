// Unit tests for the CORS origin allowlist (pure function, no network).
const { isOriginAllowed } = require('../server');

describe('isOriginAllowed', () => {
  test('allows requests without an Origin header', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed(null)).toBe(true);
    expect(isOriginAllowed('')).toBe(true);
  });

  test('always allows localhost + 127.0.0.1 on any port', () => {
    expect(isOriginAllowed('http://localhost:5500')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:8080')).toBe(true);
  });

  test('allows exact-match origins from CORS_ALLOWED_ORIGINS', () => {
    // Configured via __tests__/setup.js: 'https://trailpack.com,*.netlify.app'
    expect(isOriginAllowed('https://trailpack.com')).toBe(true);
  });

  test('allows wildcard subdomain matches via "*." entries', () => {
    expect(isOriginAllowed('https://trailpack.netlify.app')).toBe(true);
    expect(isOriginAllowed('https://preview-42.netlify.app')).toBe(true);
  });

  test('rejects unrelated origins', () => {
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
    expect(isOriginAllowed('http://trailpack.com')).toBe(false); // http vs https
    expect(isOriginAllowed('https://notnetlify.app')).toBe(false);
  });

  test('rejects malformed origins safely (no throw)', () => {
    expect(() => isOriginAllowed('not-a-url')).not.toThrow();
    expect(isOriginAllowed('not-a-url')).toBe(false);
  });
});

describe('the allowlist has no hardcoded production origin', () => {
  // Every test above draws its origins from CORS_ALLOWED_ORIGINS (set in
  // __tests__/setup.js), so none of them would notice a hardcoded default being
  // added back — which is exactly how '*.netlify.app' survived the frontend
  // moving off Netlify. These re-import the module with the env var cleared, so
  // whatever is left is what the code grants on its own.
  function withEnv(value) {
    let fn;
    jest.isolateModules(() => {
      const previous = process.env.CORS_ALLOWED_ORIGINS;
      if (value === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
      else process.env.CORS_ALLOWED_ORIGINS = value;
      fn = require('../server').isOriginAllowed;
      if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
      else process.env.CORS_ALLOWED_ORIGINS = previous;
    });
    return fn;
  }

  test('with no CORS_ALLOWED_ORIGINS, no remote origin is allowed', () => {
    const allowed = withEnv(undefined);
    expect(allowed('https://mytrailpack.netlify.app')).toBe(false);
    expect(allowed('https://anything.netlify.app')).toBe(false);
    expect(allowed('https://trailpack.com')).toBe(false);
    expect(allowed('https://evil.example')).toBe(false);
  });

  test('localhost and origin-less requests still work with nothing configured', () => {
    // These two are unconditional in the code, not defaults — removing the
    // hardcoded production origin must not have taken local development with it.
    const allowed = withEnv(undefined);
    expect(allowed('http://localhost:8080')).toBe(true);
    expect(allowed('http://127.0.0.1:5500')).toBe(true);
    expect(allowed(undefined)).toBe(true);
  });

  test('a configured origin is allowed, and only that one', () => {
    const allowed = withEnv('https://trailpack-frontend.workers.dev');
    expect(allowed('https://trailpack-frontend.workers.dev')).toBe(true);
    expect(allowed('https://mytrailpack.netlify.app')).toBe(false);
  });
});
