/* The /api/nearby-trails Worker route.

   `fetch` and the cache store are injected, so every upstream condition is
   driven here without a network: the remark timeout that arrives as HTTP 200,
   the 429, the 504 HTML dispatcher page, a truncated body, and an outright
   connection failure. The point of the route is that none of those may reach
   the browser as "there are no trails near you". */
const path = require('path');
const { createHandler, HARD_TTL, SOFT_TTL } = require(path.resolve(__dirname, '../../src/handler.js'));
const trails = require(path.resolve(__dirname, '../../src/trails.js'));
const { fixture, DENVER } = require('./helpers/discoverHarness');

const TIMEOUT_BODY = JSON.stringify({
  elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 180 seconds.'
});
const EMPTY_BODY = JSON.stringify({ elements: [] });
const DISPATCHER_504 = '<!DOCTYPE html><html><body>Error: runtime error: '
  + 'Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy.</body></html>';

/* Stands in for caches.default. */
function makeCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const body = store.get(req.url);
      return body === undefined ? undefined
        : new Response(body, { headers: { 'content-type': 'application/json' } });
    },
    async put(req, res) { store.set(req.url, await res.text()); }
  };
}

function req(params) {
  const qs = new URLSearchParams(params).toString();
  return new Request('https://trailpack.test/api/nearby-trails?' + qs);
}

/* Records every upstream call so "did this cost a query?" is answerable. */
function makeUpstream(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init && init.body, headers: init && init.headers });
    const r = responder(calls.length);
    if (r instanceof Error) throw r;
    return new Response(r.body, { status: r.status });
  };
  return { fetchImpl, calls };
}

const ok = (body) => ({ status: 200, body });

function setup(responder, options) {
  const cache = makeCache();
  const up = makeUpstream(responder);
  const handler = createHandler(Object.assign({ fetch: up.fetchImpl, caches: cache }, options || {}));
  return { handler, cache, up };
}

describe('nearby-trails — input validation', () => {
  const { handler } = setup(() => ok(EMPTY_BODY));

  test.each([
    ['missing everything', {}],
    ['missing tier',       { lat: '39.74', lon: '-104.99' }],
    ['missing lat',        { lon: '-104.99', tier: '50' }],
    ['blank lat',          { lat: '', lon: '-104.99', tier: '50' }],
    ['blank lon',          { lat: '39.74', lon: '', tier: '50' }],
    ['non-numeric lat',    { lat: 'abc', lon: '-104.99', tier: '50' }],
    ['lat out of range',   { lat: '120', lon: '-104.99', tier: '50' }],
    ['lon out of range',   { lat: '39.74', lon: '-999', tier: '50' }],
    ['arbitrary radius',   { lat: '39.74', lon: '-104.99', tier: '73' }],
    ['huge radius',        { lat: '39.74', lon: '-104.99', tier: '5000' }],
    ['injection in tier',  { lat: '39.74', lon: '-104.99', tier: '50);out body;' }]
  ])('rejects %s with 400', async (_l, params) => {
    const res = await handler.handle(req(params));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe('error');
  });

  test('rejects a non-GET method', async () => {
    const r = new Request('https://trailpack.test/api/nearby-trails?lat=39.74&lon=-104.99&tier=50',
      { method: 'POST' });
    const res = await handler.handle(r);
    expect(res.status).toBe(405);
  });

  test('a rejected request never reaches Overpass', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '73' }));
    expect(s.up.calls).toHaveLength(0);
  });
});

describe('nearby-trails — success envelope', () => {
  test('returns a typed ok envelope with trimmed items', async () => {
    const s = setup(() => ok(JSON.stringify(fixture('denver'))));
    const res = await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.tier).toBe(50);
    expect(body.version).toBe(trails.SCHEMA_VERSION);
    expect(body.cell).toEqual({ lat: 39.74, lon: -104.99 });
    expect(body.count).toBe(body.items.length);
    expect(body.cached).toBe(false);
  });

  test('items carry only the fields the UI renders', async () => {
    const s = setup(() => ok(JSON.stringify(fixture('denver'))));
    const body = await (await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }))).json();
    body.items.slice(0, 50).forEach(i => {
      expect(Object.keys(i).sort()).toEqual(['id', 'kind', 'lat', 'lon', 'name', 'type']);
    });
  });

  test('the browser receives far less than Overpass sent', async () => {
    const raw = JSON.stringify(fixture('denver'));
    const s = setup(() => ok(raw));
    const out = await (await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }))).text();
    // Understates the live saving: the committed fixture is already reduced to
    // the nine tags the gate reads, to keep 12 MB of captured payloads out of
    // the repo. Measured against real responses the reduction is 87x at Denver
    // and 49x at New York. What this pins is that the trimming happens at all.
    expect(out.length).toBeLessThan(raw.length / 3);
    expect(out).not.toContain('"tags"');
    expect(out).not.toContain('"surface"');
  });

  test('a genuinely empty area is "empty", not a failure', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    const res = await s.handler.handle(req({ lat: '0', lon: '-140', tier: '50' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('empty');
    expect(body.items).toEqual([]);
  });

  test('sends a User-Agent — Overpass 406s without one', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(s.up.calls[0].headers['user-agent']).toMatch(/TrailPack/);
  });

  test('asks Overpass for the tier that was requested', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '100' }));
    expect(decodeURIComponent(s.up.calls[0].body)).toContain('around:160934');
  });
});

describe('nearby-trails — failures stay failures', () => {
  test('a remark timeout becomes 504 / timeout', async () => {
    const s = setup(() => ok(TIMEOUT_BODY));
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '100' }));
    const body = await res.json();
    expect(res.status).toBe(504);
    expect(body.status).toBe('timeout');
    expect(body.items).toBeUndefined();
  });

  test.each([
    ['429 rate limit', { status: 429, body: 'rate_limited' }],
    ['504 HTML page',  { status: 504, body: DISPATCHER_504 }],
    ['500',            { status: 500, body: 'oops' }],
    ['non-JSON 200',   { status: 200, body: '<html>proxy</html>' }],
    ['truncated 200',  { status: 200, body: '{"elements":[' }]
  ])('%s becomes 503 / busy', async (_l, upstream) => {
    const s = setup(() => upstream);
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.status).toBe('busy');
    expect(res.headers.get('retry-after')).toBe('30');
  });

  test('a connection failure becomes 503 / busy', async () => {
    const s = setup(() => new Error('ECONNRESET'));
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('busy');
  });

  test('no failure is ever returned as an empty trail list', async () => {
    for (const upstream of [{ status: 429, body: '' }, { status: 504, body: DISPATCHER_504 },
                            { status: 200, body: TIMEOUT_BODY }, { status: 200, body: 'garbage' }]) {
      const s = setup(() => upstream);
      const body = await (await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }))).json();
      expect(body.status).not.toBe('ok');
      expect(body.status).not.toBe('empty');
      expect(body.items).toBeUndefined();
    }
  });

  test('failures are not cached — a blip must not become a day of wrong answers', async () => {
    let n = 0;
    const s = setup(() => (++n === 1 ? { status: 429, body: '' } : ok(EMPTY_BODY)));
    const first = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(first.status).toBe(503);
    expect(s.cache.store.size).toBe(0);
    const second = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(second.status).toBe(200);
    expect(s.up.calls).toHaveLength(2);
  });
});

describe('nearby-trails — nothing escapes as an untyped error', () => {
  // Verified against workerd: an unhandled throw is answered by the runtime
  // with a plain-text 500 carrying a stack trace. Wrong content type for a
  // JSON route, useless to the caller, and it leaks internals.
  const silence = () => jest.spyOn(console, 'error').mockImplementation(() => {});

  test('a throwing cache store still yields a typed envelope', async () => {
    const spy = silence();
    const handler = createHandler({
      fetch: async () => new Response(EMPTY_BODY, { status: 200 }),
      caches: { async match() { throw new Error('cache backend exploded'); }, async put() {} }
    });
    const res = await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    // An unreadable cache is a miss, so this succeeds rather than erroring.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    spy.mockRestore();
  });

  test('a corrupt cached entry reads as a miss and refetches', async () => {
    const up = makeUpstream(() => ok(EMPTY_BODY));
    const handler = createHandler({
      fetch: up.fetchImpl,
      caches: {
        async match() { return new Response('{"items": [trunc', { headers: { 'content-type': 'application/json' } }); },
        async put() {}
      }
    });
    const res = await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('empty');
    expect(up.calls).toHaveLength(1);
  });

  test('an unexpected internal failure is a typed 500, not a stack trace', async () => {
    const spy = silence();
    const handler = createHandler({
      fetch: async () => new Response(EMPTY_BODY, { status: 200 }),
      caches: {
        // Throws on the write path, after the miss is already committed to.
        async match() { return undefined; },
        async put() { throw new Error('quota exceeded'); }
      }
    });
    const res = await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toEqual({ status: 'error', error: 'trail search failed' });
    spy.mockRestore();
  });

  test('the error body carries no internals', async () => {
    const spy = silence();
    const handler = createHandler({
      fetch: async () => { throw Object.assign(new Error('/Users/someone/secret/path.js exploded'), { stack: 'at /Users/someone/secret' }); },
      caches: { async match() { return undefined; }, async put() { throw new Error('boom at /Users/someone/secret'); } }
    });
    const res = await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    const text = await res.text();
    expect(text).not.toMatch(/Users|stack|at \//);
    expect(text).not.toMatch(/exploded/);
    spy.mockRestore();
  });

  test('the failure is logged where operators can see it, not sent to the client', async () => {
    const spy = silence();
    const handler = createHandler({
      fetch: async () => new Response(EMPTY_BODY, { status: 200 }),
      caches: { async match() { return undefined; }, async put() { throw new Error('quota exceeded'); } }
    });
    await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('nearby-trails — failures carry no success-cache header', () => {
  // The 7-day TTL is only ever attached to a stored success. A busy or
  // timed-out upstream must not be retained for a week — or at all.
  const DISPATCHER = '<!DOCTYPE html><html>busy</html>';

  test.each([
    ['timeout', { status: 200, body: TIMEOUT_BODY }],
    ['429',     { status: 429, body: '' }],
    ['504',     { status: 504, body: DISPATCHER }],
    ['garbage', { status: 200, body: 'not json' }]
  ])('%s: nothing is written to the cache at all', async (_l, upstream) => {
    const s = setup(() => upstream);
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(s.cache.store.size).toBe(0);
  });

  test.each([
    ['timeout', { status: 200, body: TIMEOUT_BODY }],
    ['429',     { status: 429, body: '' }],
    ['504',     { status: 504, body: DISPATCHER }]
  ])('%s: the client response is no-store, never s-maxage', async (_l, upstream) => {
    const s = setup(() => upstream);
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('cache-control')).not.toContain('s-maxage');
  });

  test('a validation rejection is no-store and never reaches the cache', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '73' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(s.cache.store.size).toBe(0);
  });

  test('a successful client response is also no-store — only the stored copy is cacheable', async () => {
    // The browser holds its own tier cache; the 7 days belongs to the edge.
    const s = setup(() => ok(EMPTY_BODY));
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('nearby-trails — caching', () => {
  test('a repeat request for the same cell is served from cache', async () => {
    const s = setup(() => ok(JSON.stringify(fixture('denver'))));
    await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }));
    const res = await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }));
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(typeof body.age).toBe('number');
    expect(s.up.calls).toHaveLength(1);
  });

  test('a nudge inside the same 2dp cell hits the same entry', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }));
    await s.handler.handle(req({ lat: '39.7412', lon: '-104.9880', tier: '50' }));
    expect(s.up.calls).toHaveLength(1);
  });

  test('a different cell is a different entry', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '50' }));
    await s.handler.handle(req({ lat: '47.6062', lon: '-122.3321', tier: '50' }));
    expect(s.up.calls).toHaveLength(2);
  });

  test('tiers are isolated — 100 does not read the 50 entry', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '100' }));
    expect(s.up.calls).toHaveLength(2);
    expect(s.cache.store.size).toBe(2);
  });

  test('the stored key carries cell, tier and schema version', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.7392', lon: '-104.9903', tier: '100' }));
    const key = decodeURIComponent([...s.cache.store.keys()][0]);
    expect(key).toContain('v' + trails.SCHEMA_VERSION);
    expect(key).toContain('39.74,-104.99');
    expect(key).toContain('t100');
  });

  test('a schema bump would not read old entries', () => {
    // Version lives in the key, so the invalidation the browser-only cache
    // could never perform is a one-line change here.
    expect(trails.cacheKeyFor(39.74, -104.99, 50)).toMatch(/^v\d+\//);
  });

  /* Retention is the one lever available at zero cost: the Cache API is the
     only store in play, Overpass throttles the shared Cloudflare egress on a
     cold miss, and a warm entry answers in ~0.2 s. Seven days is asserted
     exactly, per tier, because a silent drop back to a day would quietly
     multiply upstream traffic sevenfold for every cell. */
  const captureStoredHeader = async (tier) => {
    const cache = makeCache();
    const up = makeUpstream(() => ok(EMPTY_BODY));
    let stored = null;
    cache.put = async (r, res) => { stored = res.headers.get('cache-control'); };
    const handler = createHandler({ fetch: up.fetchImpl, caches: cache });
    await handler.handle(req({ lat: '39.74', lon: '-104.99', tier: String(tier) }));
    return stored;
  };

  test.each([[50], [100]])('a successful %i-mile result is stored for 7 days', async (tier) => {
    const stored = await captureStoredHeader(tier);
    expect(stored).toContain('s-maxage=604800');
    expect(stored).toContain('public');
    // Exactly 7 days — not "at least", so a regression to 24h fails here.
    expect(stored).toMatch(/s-maxage=604800(\D|$)/);
    expect(stored).not.toContain('s-maxage=86400');
  });

  test('both tiers are stored with the identical TTL', async () => {
    expect(await captureStoredHeader(50)).toBe(await captureStoredHeader(100));
  });

  test('the TTL constant and the stored header agree', async () => {
    expect(HARD_TTL).toBe(604800);
    expect(await captureStoredHeader(50)).toContain('s-maxage=' + HARD_TTL);
  });

  test('the stale refresh does not depend on the stale-while-revalidate directive', async () => {
    // Cloudflare documents that cache.put does not implement
    // stale-while-revalidate. The refresh has to come from the explicit
    // waitUntil path, which the test below this one exercises.
    expect(SOFT_TTL).toBeLessThan(HARD_TTL);
  });

  test('a stale entry is served immediately and refreshed behind the response', async () => {
    const s = setup(() => ok(EMPTY_BODY));
    await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    // Age the stored entry past the soft TTL.
    const key = [...s.cache.store.keys()][0];
    const aged = JSON.parse(s.cache.store.get(key));
    aged.storedAt = Date.now() - 7 * 3600 * 1000;
    s.cache.store.set(key, JSON.stringify(aged));

    const background = [];
    const res = await s.handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }),
      { waitUntil: p => background.push(p) });
    expect((await res.json()).cached).toBe(true);   // answered from cache, not made to wait
    expect(background).toHaveLength(1);
    await Promise.all(background);
    expect(s.up.calls).toHaveLength(2);             // refreshed behind it
  });
});

describe('nearby-trails — backpressure', () => {
  test('concurrent misses for one cell cost a single upstream query', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const calls = [];
    const fetchImpl = async () => { calls.push(1); await gate; return new Response(EMPTY_BODY, { status: 200 }); };
    const handler = createHandler({ fetch: fetchImpl, caches: makeCache() });
    const all = Promise.all([
      handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' })),
      handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' })),
      handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }))
    ]);
    release();
    const results = await all;
    expect(calls).toHaveLength(1);
    results.forEach(r => expect(r.status).toBe(200));
  });

  test('past the concurrency ceiling the answer is busy, not another query', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const calls = [];
    const fetchImpl = async () => { calls.push(1); await gate; return new Response(EMPTY_BODY, { status: 200 }); };
    const handler = createHandler({ fetch: fetchImpl, caches: makeCache(), maxConcurrent: 1 });

    const first = handler.handle(req({ lat: '39.74', lon: '-104.99', tier: '50' }));
    // A different cell, so it cannot be coalesced into the first.
    const second = await handler.handle(req({ lat: '47.61', lon: '-122.33', tier: '50' }));
    expect(second.status).toBe(503);
    expect((await second.json()).status).toBe('busy');
    expect(calls).toHaveLength(1);

    release();
    expect((await first).status).toBe(200);
  });

  test('the ceiling releases once a query finishes', async () => {
    const handler = createHandler({
      fetch: async () => new Response(EMPTY_BODY, { status: 200 }),
      caches: makeCache(), maxConcurrent: 1
    });
    for (const lat of ['39.74', '40.74', '41.74']) {
      const res = await handler.handle(req({ lat, lon: '-104.99', tier: '50' }));
      expect(res.status).toBe(200);
    }
  });
});
