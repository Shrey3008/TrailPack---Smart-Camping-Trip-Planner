/* =============================================================================
   Trail data logic — shared by the Worker and its tests.

   This is the query building, quality gating, parsing and de-duplication that
   used to run in the browser in frontend/discover.js. It moved here so the
   Worker can do it once per location and cache the result: Overpass returns
   18.22 MB for a 100-mile search around New York, and the fields TrailPack
   actually renders are 378 KB of that, gzipped. The browser now receives the
   378 KB.

   CommonJS on purpose. The Worker entry point is an ES module, and Wrangler's
   esbuild bundles this into it happily; keeping the source CJS means the jest
   suite can require it directly, so there is one implementation rather than a
   server copy and a test copy that drift.
   ========================================================================== */

const MI_M = 1609.34;

/* The only two radii the Worker will query. Every request is served from one
   of these discs and filtered down in the browser, which is what makes a
   radius change free. Arbitrary radii are rejected rather than honoured: they
   would each need their own cache entry and would break that guarantee. */
const TIERS = [50, 100];

/* Bumped whenever the query, the gate or the shape of a parsed item changes.
   It is part of the cache key, so a bump invalidates every stored response —
   the invalidation step the old browser-only cache had no way to perform. */
const SCHEMA_VERSION = 2;

/* -------------------------------------------------------------------------
   Query
   ------------------------------------------------------------------------- */

/* Deliberately minimal. Every tag filter pushed into the path selector was
   measured against the live API and cost 4-6x the runtime for a modest saving
   in bytes — the plain union runs in ~11-20 s from Denver, the same union with
   ["bicycle"!="designated"]["foot"!="no"] took 39.6 s, and with surface and
   access regexes on top, 66 s. The gate below is free by comparison, because
   the payload has to be walked anyway to sort it.

   No `>` recursion and no `out skel qt`: `>` walks the whole matched set
   rather than the printed elements, and was pulling 200,220 elements / 18.35 MB
   at 50 miles to render twelve cards. No element limit either — Overpass sorts
   by type-then-id and has no notion of distance, so asking it for 30 returns
   the lowest-id 30, not the nearest 30.

   leisure=park is absent by design. It was the source of Civic Center Park,
   17th Street Plaza and Pioneer Monument Park topping a hiking app's list. */
function buildQuery(lat, lon, miles) {
  const m = Math.round(miles * MI_M);
  const at = '(around:' + m + ',' + lat + ',' + lon + ');';
  return '[out:json][timeout:' + timeoutFor(miles) + '];('
    + 'relation["route"="hiking"]["name"]' + at
    + 'way["highway"="path"]["name"]' + at
    + 'way["leisure"="nature_reserve"]["name"]' + at
    + 'relation["leisure"="nature_reserve"]["name"]' + at
    + 'node["tourism"="camp_site"]["name"]' + at
    + ');out center;';
}

/* Scales with radius rather than sitting at a fixed 25 s, because the widest
   searches are both the slowest and the ones a fixed budget cut off first —
   and a cut-off search used to reach the user as "no trails found". Measured
   round trips: 50 miles 11-37 s, 100 miles 26-77 s. 180 s is Overpass's own
   default ceiling. */
function timeoutFor(miles) {
  return Math.min(180, Math.max(25, Math.round(miles * 1.8)));
}

/* -------------------------------------------------------------------------
   Quality gate
   ------------------------------------------------------------------------- */

const PAVED = /^(paved|concrete|asphalt|paving_stones|wood|metal|concrete:plates)$/i;

/* Closed to the public, whatever kind of place it is. This used to be checked
   only on highway=path ways, which let a locked nature reserve through — New
   York's 100-mile results surfaced "Bird Island", tagged access=no, as a
   destination nobody can visit. */
function isClosedToPublic(t) {
  return t.access === 'private' || t.access === 'no';
}

/* Urban infrastructure wearing the highway=path tag. Dropping leisure=park was
   not enough on its own: downtown Denver's nearest path ways are Larimer Way,
   20th Street Multi-Use Path, Mile High Walk and Sports Walk, each carrying one
   of the signals below. Bike-park features (Slopestyle XS, Pump track) are
   caught by foot=no.

   Applied per *segment*, and OSM splits a trail into many ways with
   inconsistent tagging, so a trail survives if any one of its segments does.
   That is why Sloan's Lake Trail still appears despite most of its segments
   being surface=concrete. The forgiveness is intentional — rejecting a whole
   named trail over one badly tagged segment loses real destinations. */
function isUrbanPath(t) {
  if (t.highway !== 'path') return false;
  if (t.surface && PAVED.test(t.surface)) return true;
  if (t.bicycle === 'designated') return true;
  if (t.foot === 'no') return true;
  return false;
}

function isExcluded(t) {
  return isClosedToPublic(t) || isUrbanPath(t);
}

function kindOf(t) {
  if (t.route === 'hiking') return 'hiking route';
  if (t.leisure === 'nature_reserve') return 'nature reserve';
  if (t.tourism === 'camp_site') return 'campsite';
  return 'trail';
}

/* -------------------------------------------------------------------------
   Parse and rank
   ------------------------------------------------------------------------- */

/* Ways and relations carry a bbox centre under `center` (that is what
   `out center` buys); nodes carry a plain lat/lon. Everything else in the
   element — the full tag object, the version, the timestamp — is dropped
   here, which is where the payload reduction comes from. */
function parse(data) {
  const items = [];
  const elements = (data && data.elements) || [];
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    const t = e.tags || {};
    if (!t.name || isExcluded(t)) continue;
    const la = e.lat != null ? e.lat : (e.center && e.center.lat);
    const lo = e.lon != null ? e.lon : (e.center && e.center.lon);
    if (la == null || lo == null) continue;
    items.push({ id: e.id, type: e.type, name: t.name, kind: kindOf(t), lat: la, lon: lo });
  }
  return items;
}

function distanceMi(aLat, aLon, bLat, bLon) {
  const R = 3958.8;
  const dA = (bLat - aLat) * Math.PI / 180;
  const dB = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dA / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dB / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* Collapses OSM's segment chains: one trail is modelled as many separate ways
   sharing a name, and 52% of the raw rows around Denver are repeats of a trail
   already in the list. Keeps the instance nearest the disc centre.

   Sorting here is a convenience, not the contract — the browser re-sorts from
   the user's exact coordinates, which may differ from this centre by up to the
   ~0.7 mi cache cell. Keeping the nearest instance is stable under that shift
   for every practical case, and the browser's own sort is what the rendered
   order comes from. */
function dedupe(items, lat, lon) {
  const scored = items.map(it => ({ it: it, d: distanceMi(lat, lon, it.lat, it.lon) }));
  scored.sort((a, b) => a.d - b.d);
  const seen = Object.create(null);
  const out = [];
  for (let i = 0; i < scored.length; i++) {
    const name = scored[i].it.name.toLowerCase();
    if (seen[name]) continue;
    seen[name] = true;
    out.push(scored[i].it);
  }
  return out;
}

/* -------------------------------------------------------------------------
   Request shape
   ------------------------------------------------------------------------- */

/* Two decimals, ~0.7 mi cells. Coarser would start returning results centred
   noticeably away from the user; finer would shred the cache hit rate. */
function cell(lat, lon) {
  return { lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) };
}

function cacheKeyFor(lat, lon, tier) {
  const c = cell(lat, lon);
  return 'v' + SCHEMA_VERSION + '/' + c.lat + ',' + c.lon + '/t' + tier;
}

/* Strict, because these values reach an expensive upstream. A radius that is
   not a supported tier is refused rather than rounded: honouring it would mean
   a cache entry per distinct value and would break the guarantee that a radius
   change costs nothing. */
function validate(params) {
  // Number(null) is 0 and Number('') is 0, so a missing or blank coordinate
  // would otherwise validate as the Gulf of Guinea and spend a real upstream
  // query on it. Absence has to be rejected before the coercion, not after.
  const num = (v) => (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));
  const lat = num(params.lat);
  const lon = num(params.lon);
  const tier = num(params.tier);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: 'lat must be a number between -90 and 90' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { ok: false, error: 'lon must be a number between -180 and 180' };
  if (!TIERS.includes(tier)) return { ok: false, error: 'tier must be one of ' + TIERS.join(', ') };
  return { ok: true, lat: lat, lon: lon, tier: tier };
}

/* -------------------------------------------------------------------------
   Upstream classification
   ------------------------------------------------------------------------- */

/* Overpass signals failure four different ways and only one of them looks like
   an error. Verified against the live API:

     - a query that runs out of time or memory returns HTTP 200 with
       `elements: []` and a `remark` string — byte-for-byte an empty area apart
       from that field. Reading elements.length alone is what made the old code
       report a timeout as "No trails found within 25 miles" and then offer to
       widen the search, which makes the next query heavier still;
     - 429 is the rate limiter (the public instance allows 2 slots per IP);
     - 504 arrives as an HTML dispatcher page, so JSON.parse throws;
     - and a truncated or empty body is neither valid JSON nor an error code.

   None of them means "there are no trails here", so none of them may reach the
   browser as an empty result. */
function classifyUpstream(status, bodyText) {
  if (status === 429) return { status: 'busy', reason: 'rate limited upstream' };
  if (status === 504) return { status: 'busy', reason: 'upstream dispatcher busy' };
  if (status < 200 || status >= 300) return { status: 'busy', reason: 'upstream HTTP ' + status };
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (e) {
    return { status: 'busy', reason: 'upstream returned non-JSON' };
  }
  if (data && data.remark) return { status: 'timeout', reason: String(data.remark).slice(0, 200) };
  if (!data || !Array.isArray(data.elements)) return { status: 'busy', reason: 'upstream payload had no elements array' };
  return { status: 'ok', data: data };
}

module.exports = {
  MI_M, TIERS, SCHEMA_VERSION,
  buildQuery, timeoutFor,
  PAVED, isClosedToPublic, isUrbanPath, isExcluded, kindOf,
  parse, distanceMi, dedupe,
  cell, cacheKeyFor, validate,
  classifyUpstream
};
