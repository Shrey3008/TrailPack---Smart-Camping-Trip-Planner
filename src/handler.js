/* =============================================================================
   /api/nearby-trails — request handling, caching and backpressure.

   Split from index.js so it can be tested. index.js has to be an ES module
   because that is what a Workers entry point is; this file is CommonJS, which
   is what the jest suite can require. Wrangler's esbuild bundles the two
   together, so what ships is what the tests ran against.

   `fetch` and `caches` arrive through createHandler rather than being read off
   the global, so a test can drive every upstream condition — a remark timeout,
   a 429, a 504 HTML page, a truncated body — without a network.
   ========================================================================== */

const trails = require('./trails.js');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/* OSM trail geometry changes on the order of weeks, so a week is still
   conservative — and the week is doing real work here. Overpass rate-limits
   Cloudflare's shared egress IP, so a cold miss can come back busy for a while;
   measured, a warm entry answers in ~0.2 s while a cold 50-mile fetch is 30-70 s
   when it succeeds at all. Every day of retention is a day a colo does not have
   to go back upstream. Raising 24h to 7d costs nothing and cuts repeat upstream
   traffic for a given cell roughly sevenfold.

   Two things this deliberately does not claim. The Cache API evicts LRU across
   all domains on an edge server, so a TTL is a ceiling, not a promise — an
   unpopular entry can still go early. And the cache is local to one data
   centre, so "warm" is always per-colo, never global.

   Past SOFT_TTL a stored answer is still served immediately and refreshed
   behind the response, so nobody waits a minute for data that is merely hours
   stale. That refresh is the explicit waitUntil below, not the
   stale-while-revalidate directive: Cloudflare documents that cache.put does
   not implement stale-while-revalidate at all. The directive stays on the
   stored response as intent for anything else that reads it, but nothing here
   depends on it. */
const HARD_TTL = 604800;  // 7d, what Cache-Control advertises
const SOFT_TTL = 21600;   // 6h, past this serve stale and refresh — via waitUntil

/* Module scope lives as long as the isolate, so this bounds the expensive
   upstream fetches in flight *per isolate* — a real limit, but not a global
   one. Combined with the cache, which absorbs the overwhelming majority of
   traffic, it is enough to stop one cold popular location fanning out into
   dozens of simultaneous 77-second queries. A global ceiling needs a Durable
   Object; that is a deliberate later step, not an oversight. */
const MAX_CONCURRENT_UPSTREAM = 2;

function jsonResponse(status, body, extraHeaders) {
  const headers = Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }, extraHeaders || {});
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

/* The Cache API keys on a Request. This URL is synthetic — never fetched, it
   only has to be stable and unique per cell + tier + schema version. */
function cacheRequestFor(key) {
  return new Request('https://cache.trailpack.internal/nearby-trails?key=' + encodeURIComponent(key));
}

function createHandler(options) {
  const opts = options || {};
  const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  const cacheStore = opts.caches || (typeof caches !== 'undefined' ? caches.default : null);
  const maxConcurrent = opts.maxConcurrent != null ? opts.maxConcurrent : MAX_CONCURRENT_UPSTREAM;

  let inFlightCount = 0;
  const inFlight = new Map();

  /* One upstream round trip, classified and reduced to what the UI renders. */
  async function fetchFromOverpass(lat, lon, tier) {
    const query = trails.buildQuery(lat, lon, tier);
    let res;
    try {
      res = await fetchImpl(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          // Overpass sits behind an Apache that 406s a request with no
          // User-Agent. Identifying the caller is also basic API courtesy.
          'user-agent': 'TrailPack/1.0 (+https://trailpack.app)'
        }
      });
    } catch (e) {
      return { status: 'busy', reason: 'could not reach upstream' };
    }

    let text;
    try {
      text = await res.text();
    } catch (e) {
      return { status: 'busy', reason: 'upstream response could not be read' };
    }

    const verdict = trails.classifyUpstream(res.status, text);
    if (verdict.status !== 'ok') return verdict;

    const items = trails.dedupe(trails.parse(verdict.data), lat, lon);
    return { status: items.length ? 'ok' : 'empty', items: items };
  }

  function storedPayload(lat, lon, tier, result) {
    return {
      status: result.status,
      version: trails.SCHEMA_VERSION,
      tier: tier,
      cell: trails.cell(lat, lon),
      count: result.items.length,
      storedAt: Date.now(),
      items: result.items
    };
  }

  /* Miss path: bound concurrency, coalesce duplicate misses, store successes. */
  function loadAndStore(cacheKey, lat, lon, tier) {
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    if (inFlightCount >= maxConcurrent) {
      return Promise.resolve({ status: 'busy', reason: 'too many trail searches in progress' });
    }

    inFlightCount++;
    const work = (async () => {
      try {
        const result = await fetchFromOverpass(lat, lon, tier);
        // Only real answers are cached. Storing a busy or timeout response
        // would turn a transient upstream blip into a day of wrong answers.
        if ((result.status === 'ok' || result.status === 'empty') && cacheStore) {
          const body = JSON.stringify(storedPayload(lat, lon, tier, result));
          await cacheStore.put(cacheRequestFor(cacheKey), new Response(body, {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'public, s-maxage=' + HARD_TTL
                + ', stale-while-revalidate=' + SOFT_TTL
            }
          }));
        }
        return result;
      } finally {
        inFlightCount--;
        inFlight.delete(cacheKey);
      }
    })();

    inFlight.set(cacheKey, work);
    return work;
  }

  /* Everything below runs inside handle()'s boundary. Kept separate so the
     boundary itself has nothing in it that can throw. */
  async function route(request, ctx) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { status: 'error', error: 'method not allowed' }, { allow: 'GET' });
    }

    const url = new URL(request.url);
    const check = trails.validate({
      lat: url.searchParams.get('lat'),
      lon: url.searchParams.get('lon'),
      tier: url.searchParams.get('tier')
    });
    if (!check.ok) return jsonResponse(400, { status: 'error', error: check.error });

    const lat = check.lat, lon = check.lon, tier = check.tier;
    const cacheKey = trails.cacheKeyFor(lat, lon, tier);

    if (cacheStore) {
      // A stored entry can be unreadable — a truncated write, an eviction
      // mid-read, a schema that predates a rename. That is a cache miss, not a
      // failure: fall through and fetch rather than failing a request over it.
      let payload = null;
      try {
        const hit = await cacheStore.match(cacheRequestFor(cacheKey));
        if (hit) payload = await hit.json();
      } catch (e) {
        payload = null;
      }
      if (payload) {
        const ageSec = Math.max(0, Math.round((Date.now() - (payload.storedAt || 0)) / 1000));
        // Stale but usable: answer now, refresh behind the response.
        if (ageSec > SOFT_TTL && ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(loadAndStore(cacheKey, lat, lon, tier).catch(function () {}));
        }
        return jsonResponse(200, Object.assign({}, payload, { cached: true, age: ageSec }));
      }
    }

    const result = await loadAndStore(cacheKey, lat, lon, tier);

    if (result.status === 'timeout') {
      return jsonResponse(504, { status: 'timeout', tier: tier, reason: result.reason });
    }
    if (result.status === 'busy') {
      return jsonResponse(503,
        { status: 'busy', tier: tier, reason: result.reason, retryAfter: 30 },
        { 'retry-after': '30' });
    }
    return jsonResponse(200, {
      // 'ok' or 'empty' — a real statement about the world, never a failure
      // wearing an empty trail list.
      status: result.status,
      version: trails.SCHEMA_VERSION,
      tier: tier,
      cell: trails.cell(lat, lon),
      count: result.items.length,
      cached: false,
      age: 0,
      items: result.items
    });
  }

  /* The exception boundary. Without it an unhandled throw leaves the Worker
     runtime to answer, which it does with a plain-text 500 carrying a stack
     trace — verified locally against workerd. That is the wrong content type
     for a JSON route, it tells the caller nothing it can act on, and it leaks
     internals. Every reply from this route is a typed envelope, including the
     one that means "we broke". */
  async function handle(request, ctx) {
    try {
      return await route(request, ctx);
    } catch (e) {
      // Reaches `wrangler tail`, never the client.
      console.error('nearby-trails failed', e && e.stack ? e.stack : e);
      return jsonResponse(500, { status: 'error', error: 'trail search failed' });
    }
  }

  return { handle: handle, cacheRequestFor: cacheRequestFor };
}

module.exports = { createHandler, HARD_TTL, SOFT_TTL, MAX_CONCURRENT_UPSTREAM, OVERPASS_URL };
