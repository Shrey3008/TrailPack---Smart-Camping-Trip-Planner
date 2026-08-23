/* Trail data logic (src/trails.js) — the Overpass query, the quality gate, the
   parse, the de-duplication and the classification of Overpass's four failure
   shapes.

   This all used to run in the browser. It moved into the Worker so a 100-mile
   New York search costs 18.22 MB once per day instead of once per user, and
   these tests moved with it. They run against real 50-mile payloads captured
   from the live API (helpers/fixtures), so the expected counts below are real
   OSM data rather than invented numbers. */
const path = require('path');
const trails = require(path.resolve(__dirname, '../../src/trails.js'));
const { fixture, DENVER, SEATTLE } = require('./helpers/discoverHarness');

describe('trails — Overpass query shape', () => {
  const q = () => trails.buildQuery(DENVER[0], DENVER[1], 50);

  test('carries no ">" recursion', () => {
    // ">" walks the whole matched set rather than the printed elements: it was
    // pulling 200,220 elements / 18.35 MB at 50 miles to render 12 cards.
    expect(/(^|[^-])>\s*;/.test(q())).toBe(false);
  });
  test('carries no "out skel qt"', () => expect(/out\s+skel/.test(q())).toBe(false));
  test('uses out center', () => expect(q()).toMatch(/out center;/));
  test('sets no element limit', () => {
    // Overpass sorts by type-then-id and has no notion of distance, so "out 30"
    // returns the lowest-id 30, not the nearest 30.
    expect(/out center \d/.test(q())).toBe(false);
    expect(/out body \d/.test(q())).toBe(false);
  });
  test('does not select bare leisure=park', () => expect(/leisure"="park/.test(q())).toBe(false));
  test('selects hiking routes, path ways and nature reserves', () => {
    expect(q()).toMatch(/route"="hiking/);
    expect(q()).toMatch(/highway"="path/);
    expect(q()).toMatch(/leisure"="nature_reserve/);
  });
  test('converts miles to metres on every clause', () => {
    expect(q().split('around:80467').length - 1).toBe(5);
    expect(trails.buildQuery(DENVER[0], DENVER[1], 100).split('around:160934').length - 1).toBe(5);
  });
});

describe('trails — timeout scales with radius', () => {
  test('50 mi gets 90 s', () => expect(trails.timeoutFor(50)).toBe(90));
  test('100 mi gets 180 s', () => expect(trails.timeoutFor(100)).toBe(180));
  test('small radii keep the 25 s floor', () => expect(trails.timeoutFor(10)).toBe(25));
  test('never exceeds the Overpass 180 s ceiling', () => {
    expect(trails.timeoutFor(500)).toBeLessThanOrEqual(180);
  });
  test('is monotonic', () => {
    for (let m = 1; m < 100; m++) {
      expect(trails.timeoutFor(m)).toBeLessThanOrEqual(trails.timeoutFor(m + 1));
    }
  });
  test('the scaled value reaches the query', () => {
    expect(trails.buildQuery(0, 0, 100)).toMatch(/\[timeout:180\]/);
  });
});

describe('trails — quality gate', () => {
  test.each([
    ['paved multi-use path',  { highway: 'path', surface: 'paved' }],
    ['concrete plaza path',   { highway: 'path', surface: 'concrete' }],
    ['bicycle=designated',    { highway: 'path', bicycle: 'designated' }],
    ['foot=no bike feature',  { highway: 'path', bicycle: 'yes', foot: 'no', surface: 'ground' }]
  ])('excludes %s', (_l, tags) => expect(trails.isExcluded(tags)).toBe(true));

  test.each([
    ['unpaved trail',         { highway: 'path', foot: 'yes', surface: 'unpaved' }],
    ['untagged-surface path', { highway: 'path' }],
    ['nature reserve',        { leisure: 'nature_reserve' }],
    ['hiking route',          { route: 'hiking' }],
    ['campsite',              { tourism: 'camp_site' }]
  ])('keeps %s', (_l, tags) => expect(trails.isExcluded(tags)).toBe(false));

  describe('access is checked on every kind, not just paths', () => {
    // Previously access was only read for highway=path, so a locked nature
    // reserve passed the gate — New York's 100-mile results surfaced "Bird
    // Island", tagged access=no, as somewhere to go hiking.
    test.each([
      ['closed nature reserve', { leisure: 'nature_reserve', access: 'no' }],
      ['private nature reserve',{ leisure: 'nature_reserve', access: 'private' }],
      ['private campsite',      { tourism: 'camp_site', access: 'private' }],
      ['closed hiking route',   { route: 'hiking', access: 'no' }],
      ['private path',          { highway: 'path', access: 'private' }]
    ])('excludes %s', (_l, tags) => expect(trails.isExcluded(tags)).toBe(true));

    test('permissive access is still allowed', () => {
      expect(trails.isExcluded({ leisure: 'nature_reserve', access: 'permissive' })).toBe(false);
    });
  });
});

describe('trails — kinds', () => {
  test.each([
    [{ route: 'hiking' }, 'hiking route'],
    [{ leisure: 'nature_reserve' }, 'nature reserve'],
    [{ tourism: 'camp_site' }, 'campsite'],
    [{ highway: 'path' }, 'trail']
  ])('%j -> %s', (tags, expected) => expect(trails.kindOf(tags)).toBe(expected));
});

describe('trails — parse and dedupe', () => {
  let denver;
  beforeAll(() => { denver = trails.dedupe(trails.parse(fixture('denver')), DENVER[0], DENVER[1]); });

  test('drops unnamed elements and keeps only rendered fields', () => {
    const item = denver[0];
    expect(Object.keys(item).sort()).toEqual(['id', 'kind', 'lat', 'lon', 'name', 'type']);
  });
  test('reads way and relation centres as well as node coordinates', () => {
    expect(denver.every(i => Number.isFinite(i.lat) && Number.isFinite(i.lon))).toBe(true);
  });
  test('collapses OSM segment chains — no duplicate names', () => {
    const names = denver.map(i => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
  test('de-duplication keeps the nearest instance', () => {
    const raw = trails.parse(fixture('denver'));
    const nearest = {};
    raw.forEach(i => {
      const d = trails.distanceMi(DENVER[0], DENVER[1], i.lat, i.lon);
      const k = i.name.toLowerCase();
      if (nearest[k] === undefined || d < nearest[k]) nearest[k] = d;
    });
    denver.forEach(i => {
      const d = trails.distanceMi(DENVER[0], DENVER[1], i.lat, i.lon);
      expect(Math.abs(d - nearest[i.name.toLowerCase()])).toBeLessThan(1e-9);
    });
  });
  test('the collapse is substantial', () => {
    expect(denver.length).toBeLessThan(trails.parse(fixture('denver')).length * 0.75);
  });
  test('no urban parks or plazas survive', () => {
    const names = new Set(denver.map(i => i.name));
    ['Civic Center Park', '17th Street Plaza', 'Pioneer Monument Park', 'Larimer Way',
     'Mile High Walk', 'Sports Walk', 'Cheesman Park', 'Washington Park']
      .forEach(n => expect(names.has(n)).toBe(false));
  });
  test('tolerates a malformed payload without throwing', () => {
    expect(trails.parse(null)).toEqual([]);
    expect(trails.parse({})).toEqual([]);
    expect(trails.parse({ elements: [{ type: 'way', id: 1 }] })).toEqual([]);
  });
});

describe('trails — request validation', () => {
  test('accepts a well-formed request', () => {
    expect(trails.validate({ lat: '39.74', lon: '-104.99', tier: '50' }))
      .toEqual({ ok: true, lat: 39.74, lon: -104.99, tier: 50 });
  });
  test.each([
    ['missing lat',        { lon: '-104.99', tier: '50' }],
    ['null lat',           { lat: null, lon: '-104.99', tier: '50' }],
    ['empty lat',          { lat: '', lon: '-104.99', tier: '50' }],
    ['blank lat',          { lat: '   ', lon: '-104.99', tier: '50' }],
    ['missing lon',        { lat: '39.74', tier: '50' }],
    ['empty lon',          { lat: '39.74', lon: '', tier: '50' }],
    ['non-numeric lat',    { lat: 'abc', lon: '-104.99', tier: '50' }],
    ['lat out of range',   { lat: '91', lon: '-104.99', tier: '50' }],
    ['lon out of range',   { lat: '39.74', lon: '181', tier: '50' }],
    ['missing tier',       { lat: '39.74', lon: '-104.99' }],
    ['unsupported tier',   { lat: '39.74', lon: '-104.99', tier: '75' }],
    ['zero tier',          { lat: '39.74', lon: '-104.99', tier: '0' }],
    ['absurd tier',        { lat: '39.74', lon: '-104.99', tier: '99999' }],
    ['injection attempt',  { lat: '39.74', lon: '-104.99', tier: '50;out body' }]
  ])('rejects %s', (_l, params) => expect(trails.validate(params).ok).toBe(false));

  test('only the two supported tiers exist', () => expect(trails.TIERS).toEqual([50, 100]));

  test('lat 0 / lon 0 is still accepted when actually asked for', () => {
    // The guard rejects absence, not the null island itself.
    expect(trails.validate({ lat: '0', lon: '0', tier: '50' }).ok).toBe(true);
  });
});

describe('trails — cache key', () => {
  test('rounds to a ~0.7 mi cell', () => {
    expect(trails.cacheKeyFor(39.7392, -104.9903, 50))
      .toBe(trails.cacheKeyFor(39.7412, -104.9880, 50));
  });
  test('separates distant cells', () => {
    expect(trails.cacheKeyFor(39.7392, -104.9903, 50))
      .not.toBe(trails.cacheKeyFor(39.7592, -104.9903, 50));
  });
  test('separates tiers', () => {
    expect(trails.cacheKeyFor(39.74, -104.99, 50))
      .not.toBe(trails.cacheKeyFor(39.74, -104.99, 100));
  });
  test('carries the schema version, so a bump invalidates everything', () => {
    expect(trails.cacheKeyFor(39.74, -104.99, 50)).toContain('v' + trails.SCHEMA_VERSION);
  });
});

describe('trails — classifying what Overpass sends back', () => {
  // All four verified against the live API. Only one of them looks like an
  // error, which is the whole reason this function exists.
  const TIMEOUT_BODY = JSON.stringify({
    elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 90 seconds.'
  });
  const EMPTY_BODY = JSON.stringify({ elements: [] });

  test('a remark on an HTTP 200 is a timeout, not an empty area', () => {
    expect(trails.classifyUpstream(200, TIMEOUT_BODY).status).toBe('timeout');
  });
  test('the same body without the remark is a real, empty answer', () => {
    expect(trails.classifyUpstream(200, EMPTY_BODY).status).toBe('ok');
  });
  test('the two bodies are otherwise identical', () => {
    const a = JSON.parse(TIMEOUT_BODY);
    delete a.remark;
    expect(a).toEqual(JSON.parse(EMPTY_BODY));
  });
  test('429 is busy', () => expect(trails.classifyUpstream(429, '').status).toBe('busy'));
  test('504 with an HTML dispatcher page is busy', () => {
    expect(trails.classifyUpstream(504, '<!DOCTYPE html><html>too busy</html>').status).toBe('busy');
  });
  test('a non-JSON 200 is busy, not a crash', () => {
    expect(trails.classifyUpstream(200, '<html>proxy error</html>').status).toBe('busy');
  });
  test('a truncated body is busy', () => {
    expect(trails.classifyUpstream(200, '{"elements":[').status).toBe('busy');
  });
  test('valid JSON with no elements array is busy', () => {
    expect(trails.classifyUpstream(200, '{"version":0.6}').status).toBe('busy');
  });
  test('no failure mode is ever reported as ok', () => {
    [[429, ''], [504, '<html>'], [500, 'x'], [200, 'not json'], [200, TIMEOUT_BODY]]
      .forEach(([s, b]) => expect(trails.classifyUpstream(s, b).status).not.toBe('ok'));
  });
});

describe('trails — distance', () => {
  test('is symmetric and zero at a point', () => {
    expect(trails.distanceMi(39.74, -104.99, 39.74, -104.99)).toBe(0);
    expect(trails.distanceMi(39.74, -104.99, 40.74, -104.99))
      .toBeCloseTo(trails.distanceMi(40.74, -104.99, 39.74, -104.99), 9);
  });
  test('one degree of latitude is about 69 miles', () => {
    expect(trails.distanceMi(39, -105, 40, -105)).toBeGreaterThan(68);
    expect(trails.distanceMi(39, -105, 40, -105)).toBeLessThan(70);
  });
  test('Denver to Seattle is about 1,020 miles', () => {
    const d = trails.distanceMi(DENVER[0], DENVER[1], SEATTLE[0], SEATTLE[1]);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1100);
  });
});
