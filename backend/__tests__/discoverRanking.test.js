/* Discover: Overpass query shape, radius-scaled timeout, the urban-path gate,
   and the distance ranking that replaced Overpass's type-then-id ordering.

   Runs against real 50-mile payloads captured from the live API (see
   helpers/fixtures), so the expected counts below are real OSM data, not
   invented numbers. */
const { createHarness, fixture, DENVER, SEATTLE } = require('./helpers/discoverHarness');

let S, denver, seattle;
beforeAll(() => {
  ({ S } = createHarness());
  denver = S.discoverParse(fixture('denver'));
  seattle = S.discoverParse(fixture('seattle'));
});

describe('Discover — Overpass query shape', () => {
  let q;
  beforeAll(() => { q = S.discoverQuery(DENVER[0], DENVER[1], 50); });

  test('carries no ">" recursion', () => {
    // ">" walks the whole matched set, not the printed elements: it was
    // pulling 200,220 elements / 18.35 MB at 50 miles to render 12 cards.
    expect(/(^|[^-])>\s*;/.test(q)).toBe(false);
  });
  test('carries no "out skel qt"', () => expect(/out\s+skel/.test(q)).toBe(false));
  test('uses out center', () => expect(q).toMatch(/out center;/));
  test('sets no element limit on out', () => {
    // Overpass sorts by type-then-id and has no notion of distance, so "out 30"
    // returns the lowest-id 30 rather than the nearest 30 — the reason widening
    // the radius used to replace the result set instead of extending it.
    expect(/out center \d/.test(q)).toBe(false);
    expect(/out body \d/.test(q)).toBe(false);
  });
  test('no longer selects bare leisure=park', () => {
    expect(/leisure"="park/.test(q)).toBe(false);
  });
  test('selects hiking routes, path ways and nature reserves', () => {
    expect(q).toMatch(/route"="hiking/);
    expect(q).toMatch(/highway"="path/);
    expect(q).toMatch(/leisure"="nature_reserve/);
  });
  test('every clause queries at the 50 mi max (80467 m)', () => {
    expect(q.split('around:80467').length - 1).toBe(5);
  });
});

describe('Discover — timeout scales with radius', () => {
  test('10 mi keeps the 25 s floor', () => expect(S.discoverTimeoutFor(10)).toBe(25));
  test('50 mi gets 90 s (was hardcoded 25 s at every radius)', () => {
    expect(S.discoverTimeoutFor(50)).toBe(90);
  });
  test('is monotonic in radius', () => {
    for (let m = 1; m < 50; m++) {
      expect(S.discoverTimeoutFor(m)).toBeLessThanOrEqual(S.discoverTimeoutFor(m + 1));
    }
  });
  test('never exceeds the Overpass 180 s ceiling', () => {
    expect(S.discoverTimeoutFor(500)).toBeLessThanOrEqual(180);
  });
  test('the scaled value reaches the query', () => {
    expect(S.discoverQuery(DENVER[0], DENVER[1], 50)).toMatch(/\[timeout:90\]/);
  });
});

describe('Discover — urban-path gate', () => {
  // Applied only to highway=path ways. Dropping leisure=park was not enough on
  // its own: downtown Denver's nearest path ways were Larimer Way, 20th Street
  // Multi-Use Path, Mile High Walk and Sports Walk.
  const gate = (t) => S.discoverIsUrbanPath(t);

  test.each([
    ['paved multi-use path',   { highway: 'path', surface: 'paved' }],
    ['concrete plaza path',    { highway: 'path', surface: 'concrete' }],
    ['bicycle=designated',     { highway: 'path', bicycle: 'designated' }],
    ['foot=no bike feature',   { highway: 'path', bicycle: 'yes', foot: 'no', surface: 'ground' }],
    ['access=private',         { highway: 'path', access: 'private' }]
  ])('excludes %s', (_label, tags) => expect(gate(tags)).toBe(true));

  test.each([
    ['unpaved trail',          { highway: 'path', foot: 'yes', surface: 'unpaved' }],
    ['untagged-surface path',  { highway: 'path' }],
    ['nature reserve',         { leisure: 'nature_reserve' }],
    ['hiking route relation',  { route: 'hiking' }],
    ['campsite',               { tourism: 'camp_site' }]
  ])('keeps %s', (_label, tags) => expect(gate(tags)).toBe(false));
});

describe('Discover — Denver has no urban parks or plazas', () => {
  // Every one of these topped the old "nearest trails" list for a hiking app.
  const BANNED = [
    'Civic Center Park', '17th Street Plaza', 'Pioneer Monument Park',
    'Lincoln Memorial Park', 'Golden Triangle Park', 'Larimer Way',
    '20th Street Multi-Use Path', 'Mile High Walk', 'Sports Walk',
    'Highland Bridge', 'Paco Sanchez Playground', 'Zeckendorf Plaza Park',
    'Cheesman Park', 'Washington Park', 'Alamo Placita Park'
  ];

  test.each(BANNED)('%s is absent from the top 12', (name) => {
    const top = S.discoverRank(denver, DENVER[0], DENVER[1], 50).slice(0, 12).map(x => x.name);
    expect(top).not.toContain(name);
  });

  test('none of them survives anywhere in the 50 mi payload', () => {
    const all = new Set(denver.map(x => x.name));
    expect(BANNED.filter(n => all.has(n))).toEqual([]);
  });

  test('the top 12 are trails, reserves, routes or campsites', () => {
    const kinds = S.discoverRank(denver, DENVER[0], DENVER[1], 50).slice(0, 12).map(x => x.kind);
    kinds.forEach(k => {
      expect(['trail', 'nature reserve', 'hiking route', 'campsite']).toContain(k);
    });
  });
});

describe('Discover — widening the radius adds, never swaps', () => {
  const RADII = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

  test.each([['Denver', () => denver, DENVER], ['Seattle', () => seattle, SEATTLE]])(
    '%s: each radius is a prefix-extension of the one below', (_city, get, ctr) => {
      const items = get();
      let prev = null;
      RADII.forEach(r => {
        const cur = S.discoverRank(items, ctr[0], ctr[1], r).map(x => x.name);
        if (prev) {
          expect(cur.length).toBeGreaterThanOrEqual(prev.length);
          expect(cur.slice(0, prev.length)).toEqual(prev);
        }
        prev = cur;
      });
    });

  test('Denver totals grow with radius', () => {
    const c = [5, 10, 25, 50].map(r => S.discoverRank(denver, DENVER[0], DENVER[1], r).length);
    expect(c).toEqual([13, 118, 776, 1943]);
  });

  test('in a sparse radius, widening adds visible cards', () => {
    const small = S.discoverRank(denver, DENVER[0], DENVER[1], 2).slice(0, 12);
    const big = S.discoverRank(denver, DENVER[0], DENVER[1], 10).slice(0, 12);
    expect(small.length).toBeLessThan(12);
    expect(big.length).toBeGreaterThan(small.length);
  });
});

describe('Discover — distance ranking and de-duplication', () => {
  test('results are strictly nearest-first', () => {
    const r = S.discoverRank(denver, DENVER[0], DENVER[1], 50);
    for (let i = 1; i < r.length; i++) {
      const a = S.discoverDistNum(DENVER[0], DENVER[1], r[i - 1].lat, r[i - 1].lon);
      const b = S.discoverDistNum(DENVER[0], DENVER[1], r[i].lat, r[i].lon);
      expect(a).toBeLessThanOrEqual(b + 1e-9);
    }
  });

  test('no duplicate names — OSM segment chains are collapsed', () => {
    const names = S.discoverRank(denver, DENVER[0], DENVER[1], 50).map(x => x.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  test('de-duplication keeps the nearest instance of a name', () => {
    const nearest = {};
    denver.forEach(it => {
      const d = S.discoverDistNum(DENVER[0], DENVER[1], it.lat, it.lon);
      const k = it.name.toLowerCase();
      if (nearest[k] === undefined || d < nearest[k]) nearest[k] = d;
    });
    S.discoverRank(denver, DENVER[0], DENVER[1], 50).forEach(it => {
      const d = S.discoverDistNum(DENVER[0], DENVER[1], it.lat, it.lon);
      expect(Math.abs(d - nearest[it.name.toLowerCase()])).toBeLessThan(1e-9);
    });
  });

  test('ranking compares numbers, not the 1-dp strings the cards print', () => {
    // Sorting on "9.8" vs "10.0" lexicographically would put 10 miles first.
    expect(typeof S.discoverDistNum(0, 0, 1, 1)).toBe('number');
    expect(typeof S.discoverDist(0, 0, 1, 1)).toBe('string');
  });

  test('segment collapse is substantial', () => {
    const raw = denver.filter(i => S.discoverDistNum(DENVER[0], DENVER[1], i.lat, i.lon) <= 50).length;
    const deduped = S.discoverRank(denver, DENVER[0], DENVER[1], 50).length;
    expect(deduped).toBeLessThan(raw * 0.75);
  });
});
