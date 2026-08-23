/* The bundled state anchor table (frontend/state-anchors.js).

   Two things are being protected here. That the table stays structurally sound
   — 51 rows, unique codes, plausible coordinates — and that the anchors remain
   *anchors*: real trail-access points, not geometric centres. The centre of
   Colorado is empty high plains an hour from a trailhead, and a state picker
   that opens there would be worse than not having one.

   The bounding boxes below are deliberately generous. They catch a coordinate
   that has drifted into the wrong part of the country, which is the failure a
   committed table can plausibly develop. They are not precise state outlines
   and are not trying to be: every row was additionally verified once by
   reverse geocoding to land inside the state it claims, which is the check
   that catches a few-miles-over-the-border error. That verification hits a
   public geocoder and so is a build-time script, not part of this suite. */
const path = require('path');
const { STATE_ANCHORS, ANCHORS_VERSION } = require(path.resolve(__dirname, '../../frontend/state-anchors.js'));

// [minLat, minLon, maxLat, maxLon] — generous by roughly a degree.
const BBOX = {
  AL: [30.1, -88.5, 35.1, -84.8],   AK: [51.0, -180.0, 72.0, -129.0], AZ: [31.3, -115.0, 37.1, -109.0],
  AR: [33.0, -94.7, 36.6, -89.6],   CA: [32.5, -124.5, 42.1, -114.1], CO: [36.9, -109.1, 41.1, -102.0],
  CT: [40.9, -73.8, 42.1, -71.7],   DE: [38.4, -75.8, 39.9, -75.0],   DC: [38.79, -77.13, 39.0, -76.9],
  FL: [24.4, -87.7, 31.1, -79.9],   GA: [30.3, -85.7, 35.1, -80.8],   HI: [18.8, -160.3, 22.3, -154.7],
  ID: [41.9, -117.3, 49.1, -110.9], IL: [36.9, -91.6, 42.6, -87.4],   IN: [37.7, -88.2, 41.8, -84.7],
  IA: [40.3, -96.7, 43.6, -90.1],   KS: [36.9, -102.1, 40.1, -94.5],  KY: [36.4, -89.6, 39.2, -81.9],
  LA: [28.9, -94.1, 33.1, -88.7],   ME: [42.9, -71.2, 47.5, -66.9],   MD: [37.8, -79.5, 39.8, -75.0],
  MA: [41.1, -73.6, 42.9, -69.8],   MI: [41.6, -90.5, 48.4, -82.3],   MN: [43.4, -97.3, 49.5, -89.4],
  MS: [30.1, -91.7, 35.1, -88.0],   MO: [35.9, -95.8, 40.7, -89.0],   MT: [44.3, -116.1, 49.1, -104.0],
  NE: [39.9, -104.1, 43.1, -95.2],  NV: [34.9, -120.1, 42.1, -114.0], NH: [42.6, -72.6, 45.4, -70.6],
  NJ: [38.9, -75.6, 41.4, -73.8],   NM: [31.2, -109.1, 37.1, -102.9], NY: [40.4, -79.8, 45.1, -71.8],
  NC: [33.8, -84.4, 36.6, -75.4],   ND: [45.9, -104.1, 49.1, -96.5],  OH: [38.3, -84.9, 42.4, -80.4],
  OK: [33.6, -103.1, 37.1, -94.4],  OR: [41.9, -124.6, 46.3, -116.4], PA: [39.7, -80.6, 42.3, -74.6],
  RI: [41.1, -71.9, 42.1, -71.1],   SC: [32.0, -83.4, 35.3, -78.5],   SD: [42.4, -104.1, 46.0, -96.4],
  TN: [34.9, -90.4, 36.7, -81.6],   TX: [25.8, -106.7, 36.6, -93.5],  UT: [36.9, -114.1, 42.1, -109.0],
  VT: [42.7, -73.5, 45.1, -71.4],   VA: [36.5, -83.7, 39.5, -75.2],   WA: [45.5, -124.8, 49.1, -116.9],
  WV: [37.1, -82.7, 40.7, -77.7],   WI: [42.4, -92.9, 47.1, -86.8],   WY: [40.9, -111.1, 45.1, -104.0]
};

function milesBetween(aLat, aLon, bLat, bLon) {
  const R = 3958.8;
  const dA = (bLat - aLat) * Math.PI / 180;
  const dB = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dA / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dB / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const boxCentre = (code) => {
  const b = BBOX[code];
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
};

describe('state anchors — table integrity', () => {
  test('covers 50 states plus DC', () => expect(STATE_ANCHORS).toHaveLength(51));
  test('is versioned', () => expect(Number.isInteger(ANCHORS_VERSION)).toBe(true));

  test('every postal code is unique', () => {
    const codes = STATE_ANCHORS.map(a => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  test('every state name is unique', () => {
    const names = STATE_ANCHORS.map(a => a.name);
    expect(new Set(names).size).toBe(names.length);
  });
  test('includes DC', () => {
    expect(STATE_ANCHORS.find(a => a.code === 'DC').name).toBe('District of Columbia');
  });
  test('every row carries the five fields the UI reads', () => {
    STATE_ANCHORS.forEach(a => {
      expect(typeof a.code).toBe('string');
      expect(a.code).toMatch(/^[A-Z]{2}$/);
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(3);
      expect(typeof a.anchor).toBe('string');
      expect(a.anchor.length).toBeGreaterThan(3);
      expect(Number.isFinite(a.lat)).toBe(true);
      expect(Number.isFinite(a.lon)).toBe(true);
    });
  });
  test('no anchor label is a bare state name — it must name a place', () => {
    STATE_ANCHORS.forEach(a => expect(a.anchor.toLowerCase()).not.toBe(a.name.toLowerCase()));
  });
  test('every coordinate is inside the United States', () => {
    STATE_ANCHORS.forEach(a => {
      expect(a.lat).toBeGreaterThan(18);
      expect(a.lat).toBeLessThan(72);
      expect(a.lon).toBeGreaterThan(-180);
      expect(a.lon).toBeLessThan(-66);
    });
  });
});

describe('state anchors — every anchor lands in its own state', () => {
  test.each(STATE_ANCHORS.map(a => [a.code, a]))('%s', (code, a) => {
    const b = BBOX[code];
    expect(b).toBeDefined();
    expect(a.lat).toBeGreaterThanOrEqual(b[0]);
    expect(a.lat).toBeLessThanOrEqual(b[2]);
    expect(a.lon).toBeGreaterThanOrEqual(b[1]);
    expect(a.lon).toBeLessThanOrEqual(b[3]);
  });
});

describe('state anchors — anchors, not centroids', () => {
  // The whole reason the table is curated. A centroid is a defensible number
  // and a bad destination.
  test('Colorado resolves to Estes Park, well away from the state centre', () => {
    const co = STATE_ANCHORS.find(a => a.code === 'CO');
    expect(co.anchor).toMatch(/Estes Park/);
    const [cLat, cLon] = boxCentre('CO');
    expect(milesBetween(co.lat, co.lon, cLat, cLon)).toBeGreaterThan(60);
  });

  test('New York resolves to the Adirondack High Peaks, not the state centre or NYC', () => {
    const ny = STATE_ANCHORS.find(a => a.code === 'NY');
    expect(ny.anchor).toMatch(/Lake Placid/);
    const [cLat, cLon] = boxCentre('NY');
    expect(milesBetween(ny.lat, ny.lon, cLat, cLon)).toBeGreaterThan(60);
    // Explicitly not Manhattan: a state pick should open on trails.
    expect(milesBetween(ny.lat, ny.lon, 40.7128, -74.0060)).toBeGreaterThan(200);
  });

  test('Montana, a rural state, resolves to West Glacier', () => {
    const mt = STATE_ANCHORS.find(a => a.code === 'MT');
    expect(mt.anchor).toMatch(/West Glacier/);
    const [cLat, cLon] = boxCentre('MT');
    expect(milesBetween(mt.lat, mt.lon, cLat, cLon)).toBeGreaterThan(60);
  });

  test('most anchors sit well off the middle of their state', () => {
    // Not all — Kansas's tallgrass prairie really is near the middle, and
    // small states leave nowhere to be far from. A clear majority is the
    // honest assertion.
    const offCentre = STATE_ANCHORS.filter(a => {
      const [cLat, cLon] = boxCentre(a.code);
      return milesBetween(a.lat, a.lon, cLat, cLon) > 40;
    });
    expect(offCentre.length).toBeGreaterThan(STATE_ANCHORS.length * 0.6);
  });

  test('anchors read as places people start a hike', () => {
    // A weak but real signal: the labels name parks, ranges, canyons, forests
    // and gateway towns rather than administrative geography.
    const generic = STATE_ANCHORS.filter(a => /centre|center of|geographic/i.test(a.anchor));
    expect(generic).toEqual([]);
  });
});
