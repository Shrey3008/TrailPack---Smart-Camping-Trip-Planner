/* Discover: telling an Overpass server failure apart from a genuinely empty
   area, and proving the radius slider costs no Overpass requests.

   The distinction matters because Overpass reports a query that ran out of time
   or memory as HTTP 200 with an empty elements array and a `remark` string —
   the same shape as an area with nothing in it. Reading only elements.length is
   what made the old code answer a server timeout with "No trails found within
   25 miles" and a button offering to widen the search, which makes the next
   query heavier and more likely to time out again. */
const { createHarness, fixture, response, settle, DENVER } = require('./helpers/discoverHarness');

// Captured from the live API.
const TIMEOUT_BODY = JSON.stringify({
  version: 0.6, generator: 'Overpass API 0.7.62.11', elements: [],
  remark: 'runtime error: Query timed out in "query" at line 1 after 2 seconds.'
});
const EMPTY_BODY = JSON.stringify({
  version: 0.6, generator: 'Overpass API 0.7.62.11', elements: []
});
const DISPATCHER_504 = '<!DOCTYPE html><html><body>Error: runtime error: '
  + 'Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy.'
  + '</body></html>';

let h, S, calls;
beforeEach(() => {
  h = createHarness();
  S = h.S;
  calls = 0;
  h.T.userLat = DENVER[0];
  h.T.userLon = DENVER[1];
});

function stub(makeResponse) {
  S.fetch = () => { calls++; return Promise.resolve(makeResponse()); };
}
async function search(radius = 25, opts) {
  S.fetchDiscoverTrails(DENVER[0], DENVER[1], radius, opts);
  await settle();
}

describe('Discover — server timeout is not an empty area', () => {
  test('the two responses differ only by `remark`', () => {
    const a = JSON.parse(TIMEOUT_BODY);
    const b = JSON.parse(EMPTY_BODY);
    expect(a.elements.length).toBe(b.elements.length);
    delete a.remark;
    expect(a).toEqual(b);
  });

  test('a timeout is reported as a timeout, not as "no trails"', async () => {
    stub(() => response(200, TIMEOUT_BODY));
    await search();
    expect(h.grid()).toMatch(/timed out/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
  });

  test('a timeout offers Try again and withholds Expand', async () => {
    stub(() => response(200, TIMEOUT_BODY));
    await search();
    expect(h.grid()).toMatch(/data-disc-act="retry"/);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });

  test('a timeout disclaims any finding about what is nearby', async () => {
    stub(() => response(200, TIMEOUT_BODY));
    await search();
    expect(h.count()).toMatch(/not a report about what is nearby/i);
  });

  test('a genuinely empty area is reported as empty, with Expand', async () => {
    stub(() => response(200, EMPTY_BODY));
    await search();
    expect(h.grid()).toMatch(/No trails found within 25 miles/);
    expect(h.grid()).toMatch(/data-disc-act="expand"/);
    expect(h.grid()).not.toMatch(/timed out/i);
  });

  test('Expand is withheld at the max radius — nothing wider is cached', async () => {
    stub(() => response(200, EMPTY_BODY));
    h.T.radius = 50;
    await search(50);
    expect(h.grid()).toMatch(/No trails found within 50 miles/);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });
});

describe('Discover — other server conditions', () => {
  test('429 rate limiting reports a busy service', async () => {
    stub(() => response(429, 'rate_limited'));
    await search();
    expect(h.grid()).toMatch(/busy/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });

  test('504 with the HTML dispatcher page reports a busy service', async () => {
    // r.json() would throw on this body; the old catch-all called it a
    // connection problem.
    stub(() => response(504, DISPATCHER_504));
    await search();
    expect(h.grid()).toMatch(/busy/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
  });

  test('a network failure reports a connection problem', async () => {
    S.fetch = () => { calls++; return Promise.reject(new TypeError('Failed to fetch')); };
    await search();
    expect(h.grid()).toMatch(/Could not reach|connection/i);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });

  test('every server state offers a retry', async () => {
    for (const make of [() => response(429, ''), () => response(504, DISPATCHER_504),
                        () => response(200, TIMEOUT_BODY)]) {
      h = createHarness(); S = h.S;
      h.T.userLat = DENVER[0]; h.T.userLon = DENVER[1];
      stub(make);
      await search();
      expect(h.grid()).toMatch(/data-disc-act="retry"/);
    }
  });
});

describe('Discover — one Overpass request per location, not per radius change', () => {
  beforeEach(() => { stub(() => response(200, JSON.stringify(fixture('denver')))); });

  test('the first search issues exactly one request', async () => {
    await search();
    expect(calls).toBe(1);
  });

  test('sweeping the slider issues no further requests', async () => {
    await search();
    for (let m = 1; m <= 50; m += 2.5) S.updateDiscoverRadius(Math.round(m));
    await settle();
    expect(calls).toBe(1);
  });

  test('Apply issues no further request', async () => {
    await search();
    S.applyDiscoverRadius();
    await settle();
    expect(calls).toBe(1);
  });

  test('Expand re-filters the cache instead of re-querying', async () => {
    await search();
    h.T.radius = 20;
    S.discoverExpandRadius();
    await settle();
    expect(calls).toBe(1);
    expect(h.T.radius).toBe(30);
  });

  test('a different location does issue a new request', async () => {
    await search();
    S.fetchDiscoverTrails(47.6062, -122.3321, 25);
    await settle();
    expect(calls).toBe(2);
  });

  test('the cache holds one location — revisiting an earlier one refetches', async () => {
    // A single-entry cache is the deliberate trade: a second 50-mile payload
    // costs more memory than a returning visitor costs in requests.
    await search();
    S.fetchDiscoverTrails(47.6062, -122.3321, 25);
    await settle();
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 25);
    await settle();
    expect(calls).toBe(3);
  });

  test('a whole session of radius work totals one request', async () => {
    // The aggregate claim: under the old code each of these re-queried
    // Overpass for a fresh multi-megabyte payload.
    await search();
    for (let m = 1; m <= 50; m += 5) S.updateDiscoverRadius(m);
    S.applyDiscoverRadius();
    h.T.radius = 20;
    S.discoverExpandRadius();
    S.updateDiscoverRadius(35);
    await settle();
    expect(calls).toBe(1);
  });

  test('a nudge inside the same 2dp cache cell does not refetch', async () => {
    await search();
    S.fetchDiscoverTrails(DENVER[0] + 0.001, DENVER[1] - 0.001, 25);
    await settle();
    expect(calls).toBe(1);
  });

  test('the cache key rounds to 2dp (~0.7 mi cells)', () => {
    expect(S.discoverCacheKey(39.7392, -104.9903)).toBe('39.74,-104.99');
    expect(S.discoverCacheKey(39.7412, -104.9880)).toBe('39.74,-104.99');
    expect(S.discoverCacheKey(39.7592, -104.9903)).not.toBe('39.74,-104.99');
  });

  test('retry forces a real refetch after a failure', async () => {
    await search();
    S.discoverRetry();
    await settle();
    expect(calls).toBe(2);
  });

  test('concurrent searches for one location share a single request', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    S.fetch = () => { calls++; return gate.then(() => response(200, JSON.stringify(fixture('denver')))); };
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 25);
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 30);
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 40);
    release();
    await settle();
    expect(calls).toBe(1);
  });
});

describe('Discover — rendered output', () => {
  beforeEach(() => { stub(() => response(200, JSON.stringify(fixture('denver')))); });

  test('renders cards and an honest total for the radius', async () => {
    await search();
    expect(h.grid()).toMatch(/disc-result/);
    expect(h.count()).toMatch(/776 trails/);
    expect(h.count()).toMatch(/showing nearest 12/);
  });

  test('the total tracks the slider without refetching', async () => {
    await search();
    S.updateDiscoverRadius(10);
    await settle();
    expect(h.count()).toMatch(/118 trails/);
    S.updateDiscoverRadius(50);
    await settle();
    expect(h.count()).toMatch(/1943 trails/);
    expect(calls).toBe(1);
  });

  test('cards carry a human kind label, not a raw OSM tag value', async () => {
    await search();
    expect(h.grid()).not.toMatch(/undefined/);
    expect(h.grid()).toMatch(/(trail|nature reserve|hiking route|campsite) · /);
  });
});
