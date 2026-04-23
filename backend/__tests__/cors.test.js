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
