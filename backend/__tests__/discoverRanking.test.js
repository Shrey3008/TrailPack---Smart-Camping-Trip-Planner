/* Discover's client-side ranking: what the browser still does after the Worker
   has fetched, gated, parsed and de-duplicated.

   That is deliberately a small surface — filter to the radius, sort by real
   distance from the user's exact coordinates — but it carries the guarantee
   people actually notice: widening the radius extends the list rather than
   replacing it. Run against captured /api/nearby-trails envelopes built from
   real 100-mile payloads, so the counts below are real OSM data. */
const { createHarness, fixtureItems, DENVER, NYC, LANDER } = require('./helpers/discoverHarness');

// Module scope, not beforeAll: test.each builds its table when the file is
// collected, which happens before any hook runs.
const { S } = createHarness();
const items = {
  denver: fixtureItems('denver-100').items,
  nyc: fixtureItems('nyc-100').items,
  lander: fixtureItems('lander-100').items
};

const PLACES = () => [
  ['Denver', items.denver, DENVER],
  ['New York', items.nyc, NYC],
  ['Lander, WY', items.lander, LANDER]
];

describe('Discover — widening the radius adds, never swaps', () => {
  // The radii the brief calls out, plus the low end where a city returns
  // nothing and the tier boundary at 50.
  const RADII = [1, 5, 10, 25, 50, 75, 100];

  test.each(PLACES())('%s: each radius is a prefix-extension of the one below', (_city, list, at) => {
    let prev = null;
    RADII.forEach(r => {
      const cur = S.discoverRank(list, at[0], at[1], r).map(x => x.name);
      if (prev) {
        expect(cur.length).toBeGreaterThanOrEqual(prev.length);
        expect(cur.slice(0, prev.length)).toEqual(prev);
      }
      prev = cur;
    });
  });

  test.each(PLACES())('%s: nesting holds across the 50-mile tier boundary', (_city, list, at) => {
    const at50 = S.discoverRank(list, at[0], at[1], 50).map(x => x.name);
    const at51 = S.discoverRank(list, at[0], at[1], 51).map(x => x.name);
    const at100 = S.discoverRank(list, at[0], at[1], 100).map(x => x.name);
    expect(at51.slice(0, at50.length)).toEqual(at50);
    expect(at100.slice(0, at51.length)).toEqual(at51);
  });

  test('totals grow with radius at every location', () => {
    PLACES().forEach(([city, list, at]) => {
      const counts = [10, 25, 50, 75, 100].map(r => S.discoverRank(list, at[0], at[1], r).length);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      }
      expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
    });
  });

  test('the expanded tier reaches materially further than the base one', () => {
    PLACES().forEach(([city, list, at]) => {
      const base = S.discoverRank(list, at[0], at[1], 50).length;
      const expanded = S.discoverRank(list, at[0], at[1], 100).length;
      expect(expanded).toBeGreaterThan(base);
    });
  });

  test('a sparse radius still fills as it widens', () => {
    // Downtown Denver has nothing within a mile — the bottom of the slider is
    // an empty state in exactly the places with the most users.
    expect(S.discoverRank(items.denver, DENVER[0], DENVER[1], 1)).toHaveLength(0);
    expect(S.discoverRank(items.denver, DENVER[0], DENVER[1], 5).length).toBeGreaterThan(0);
    expect(S.discoverRank(items.denver, DENVER[0], DENVER[1], 25).length)
      .toBeGreaterThan(S.discoverRank(items.denver, DENVER[0], DENVER[1], 5).length);
  });
});

describe('Discover — ordering', () => {
  test.each(PLACES())('%s: strictly nearest-first', (_city, list, at) => {
    const ranked = S.discoverRank(list, at[0], at[1], 100);
    for (let i = 1; i < ranked.length; i++) {
      const a = S.discoverDistNum(at[0], at[1], ranked[i - 1].lat, ranked[i - 1].lon);
      const b = S.discoverDistNum(at[0], at[1], ranked[i].lat, ranked[i].lon);
      expect(a).toBeLessThanOrEqual(b + 1e-9);
    }
  });

  test('nothing outside the radius is returned', () => {
    PLACES().forEach(([, list, at]) => {
      [10, 50, 100].forEach(r => {
        S.discoverRank(list, at[0], at[1], r).forEach(it => {
          expect(S.discoverDistNum(at[0], at[1], it.lat, it.lon)).toBeLessThanOrEqual(r + 1e-9);
        });
      });
    });
  });

  test('ranks from the exact point, not the rounded cache cell', () => {
    // The Worker caches on a ~0.7 mi cell; the browser must still order from
    // where the user actually is.
    const a = S.discoverRank(items.denver, DENVER[0], DENVER[1], 100);
    const b = S.discoverRank(items.denver, DENVER[0] + 0.4, DENVER[1], 100);
    expect(a[0].name).not.toBe(b[0].name);
  });

  test('compares numbers, not the 1-dp strings the cards print', () => {
    expect(typeof S.discoverDistNum(0, 0, 1, 1)).toBe('number');
    expect(typeof S.discoverDist(0, 0, 1, 1)).toBe('string');
  });
});

describe('Discover — quality of what reaches the cards', () => {
  test('no urban parks or plazas at Denver', () => {
    const top = S.discoverRank(items.denver, DENVER[0], DENVER[1], 100).slice(0, 12).map(x => x.name);
    ['Civic Center Park', '17th Street Plaza', 'Pioneer Monument Park', 'Larimer Way',
     '20th Street Multi-Use Path', 'Mile High Walk', 'Sports Walk', 'Cheesman Park',
     'Washington Park', 'Highland Bridge', 'Paco Sanchez Playground']
      .forEach(n => expect(top).not.toContain(n));
  });

  test('no closed land anywhere — the access gate now covers every kind', () => {
    // "Bird Island" is tagged access=no and used to reach New York's results
    // because access was only checked on highway=path ways.
    PLACES().forEach(([, list]) => {
      expect(list.map(i => i.name)).not.toContain('Bird Island');
    });
  });

  test('every result is a trail, reserve, route or campsite', () => {
    PLACES().forEach(([, list]) => {
      const kinds = new Set(list.map(i => i.kind));
      kinds.forEach(k => expect(['trail', 'nature reserve', 'hiking route', 'campsite']).toContain(k));
    });
  });

  test('names are unique — the Worker collapsed OSM segment chains', () => {
    PLACES().forEach(([, list]) => {
      const names = list.map(i => i.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    });
  });

  test('every item carries what a card renders and nothing more', () => {
    PLACES().forEach(([, list]) => {
      list.slice(0, 25).forEach(i => {
        expect(Object.keys(i).sort()).toEqual(['id', 'kind', 'lat', 'lon', 'name', 'type']);
      });
    });
  });
});

describe('Discover — tier arithmetic', () => {
  test('1 to 50 is the base tier', () => {
    [1, 25, 49, 50].forEach(m => expect(S.discoverTierFor(m)).toBe(50));
  });
  test('51 to 100 is the expanded tier', () => {
    [51, 75, 100].forEach(m => expect(S.discoverTierFor(m)).toBe(100));
  });
  test('a cached tier covers every radius up to its own size', () => {
    const h = createHarness();
    h.T.cache = { key: h.S.discoverCacheKey(DENVER[0], DENVER[1]), tier: 50, items: [] };
    expect(h.S.discoverCacheCovers(DENVER[0], DENVER[1], 50)).toBe(true);
    expect(h.S.discoverCacheCovers(DENVER[0], DENVER[1], 51)).toBe(false);
    h.T.cache.tier = 100;
    expect(h.S.discoverCacheCovers(DENVER[0], DENVER[1], 100)).toBe(true);
    expect(h.S.discoverCacheCovers(DENVER[0], DENVER[1], 25)).toBe(true);
  });
  test('a cached tier for a different place covers nothing', () => {
    const h = createHarness();
    h.T.cache = { key: h.S.discoverCacheKey(NYC[0], NYC[1]), tier: 100, items: [] };
    expect(h.S.discoverCacheCovers(DENVER[0], DENVER[1], 10)).toBe(false);
  });
});
