// SECURITY REGRESSION GUARD: session-token exfiltration via ?api=.
//
// frontend/config.js sets window.API_URL, and app.js attaches the signed-in
// user's `Authorization: Bearer <token>` to every request sent there. The ?api=
// query parameter used to override that base URL on any host, so
//
//   https://mytrailpack.netlify.app/dashboard.html?api=https://attacker.example
//
// sent to a signed-in user pointed the app at an attacker's server and handed
// over their token on the first request. ?api= is now honoured on localhost
// only.
//
// This is a frontend file, but jest only runs from backend/, so the real
// config.js is executed here in a sandbox with a stubbed window/document rather
// than reimplemented — a copy of the logic would pass while the shipped file
// stayed vulnerable.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'frontend', 'config.js');
const SOURCE = fs.readFileSync(CONFIG_PATH, 'utf8');

const PROD = 'https://trailpack-smart-camping-trip-planner.onrender.com';

function resolveApiUrl({ hostname, search = '', meta = null }) {
  const window = { location: { hostname, search } };
  const document = { querySelector: () => (meta ? { content: meta } : null) };
  const sandbox = { window, document, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return window.API_URL;
}

describe('?api= cannot redirect a deployed page', () => {
  test('THE EXPLOIT: ?api= is ignored on the production host', () => {
    const url = resolveApiUrl({
      hostname: 'mytrailpack.netlify.app',
      search: '?api=https://attacker.example',
    });

    // Old behaviour: window.API_URL became https://attacker.example, and the
    // next authenticated request delivered the token there.
    expect(url).toBe(PROD);
    expect(url).not.toMatch(/attacker/);
  });

  test('ignored on a Netlify deploy preview subdomain too', () => {
    const url = resolveApiUrl({
      hostname: 'deploy-preview-12--mytrailpack.netlify.app',
      search: '?api=https://attacker.example',
    });
    expect(url).toBe(PROD);
  });

  test('ignored when smuggled among other query parameters', () => {
    const url = resolveApiUrl({
      hostname: 'mytrailpack.netlify.app',
      search: '?tripId=abc&api=https://attacker.example&view=list',
    });
    expect(url).toBe(PROD);
  });

  test('a protocol-relative value is ignored just the same', () => {
    const url = resolveApiUrl({
      hostname: 'mytrailpack.netlify.app',
      search: '?api=//attacker.example',
    });
    expect(url).toBe(PROD);
  });
});

describe('the legitimate paths still work', () => {
  test('production with no override points at the Render backend', () => {
    expect(resolveApiUrl({ hostname: 'mytrailpack.netlify.app' })).toBe(PROD);
  });

  test('localhost with no override points at the local backend', () => {
    expect(resolveApiUrl({ hostname: 'localhost' })).toBe('http://localhost:3000');
  });

  test('?api= still works on localhost, where it is a dev convenience', () => {
    expect(resolveApiUrl({ hostname: 'localhost', search: '?api=http://localhost:4000' }))
      .toBe('http://localhost:4000');
    expect(resolveApiUrl({ hostname: '127.0.0.1', search: '?api=http://localhost:4000' }))
      .toBe('http://localhost:4000');
  });

  test('the meta override still works in production', () => {
    // Setting this means editing the served HTML, which requires already
    // controlling the page — unlike a link someone can send you.
    expect(resolveApiUrl({ hostname: 'mytrailpack.netlify.app', meta: 'https://staging.example' }))
      .toBe('https://staging.example');
  });

  test('a file:// style empty hostname is still treated as local', () => {
    expect(resolveApiUrl({ hostname: '' })).toBe('http://localhost:3000');
  });
});
