/* Discover's request behaviour: how many requests a session costs, when the
   expanded tier is allowed to be fetched, and how the Worker's typed envelope
   reaches the user.

   The browser no longer parses Overpass, so there is exactly one field to
   read — `status`. What still has to hold is that `empty` is a statement about
   the world while `timeout` and `busy` are statements about the service, and
   that the second kind never appears as "no trails near you" or offers to
   widen a search that did not complete. */
const { createHarness, fixtureItems, response, settle, DENVER, NYC } = require('./helpers/discoverHarness');

const envelope = (over) => JSON.stringify(Object.assign(
  { status: 'ok', version: 2, tier: 50, cell: { lat: 39.74, lon: -104.99 }, count: 0, items: [] },
  over || {}
));
const DENVER_ITEMS = fixtureItems('denver-100').items;
const baseOk   = envelope({ status: 'ok', tier: 50, items: DENVER_ITEMS, count: DENVER_ITEMS.length });
const expandOk = envelope({ status: 'ok', tier: 100, items: DENVER_ITEMS, count: DENVER_ITEMS.length });

let h, S, calls;
beforeEach(() => {
  h = createHarness();
  S = h.S;
  calls = [];
  h.T.userLat = DENVER[0];
  h.T.userLon = DENVER[1];
  h.T.placeLabel = 'Denver, Colorado';
});

function stub(responder) {
  S.fetch = (url) => {
    calls.push(String(url));
    const r = responder(String(url), calls.length);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
}
const tierOf = (url) => Number(new URL(url, 'https://x.test').searchParams.get('tier'));
async function search(radius) {
  if (radius != null) h.T.radius = radius;
  S.fetchDiscoverTrails(DENVER[0], DENVER[1], h.T.radius);
  await settle();
}

describe('Discover — one request per location per tier', () => {
  beforeEach(() => stub(() => response(200, baseOk)));

  test('a first search costs exactly one request', async () => {
    await search(25);
    expect(calls).toHaveLength(1);
    expect(tierOf(calls[0])).toBe(50);
  });

  test('sweeping the slider inside the base tier costs nothing', async () => {
    await search(25);
    for (let m = 1; m <= 50; m += 2) S.updateDiscoverRadius(m);
    await settle();
    expect(calls).toHaveLength(1);
  });

  test('Apply costs nothing', async () => {
    await search(25);
    S.applyDiscoverRadius();
    await settle();
    expect(calls).toHaveLength(1);
  });

  test('a whole session of radius work inside the tier totals one request', async () => {
    await search(25);
    for (let m = 5; m <= 50; m += 5) S.updateDiscoverRadius(m);
    S.applyDiscoverRadius();
    h.T.radius = 20;
    S.discoverExpandRadius();
    await settle();
    expect(calls).toHaveLength(1);
  });

  test('a different location costs a new request', async () => {
    await search(25);
    S.fetchDiscoverTrails(NYC[0], NYC[1], 25);
    await settle();
    expect(calls).toHaveLength(2);
  });

  test('a nudge inside the same cache cell does not refetch', async () => {
    await search(25);
    S.fetchDiscoverTrails(DENVER[0] + 0.001, DENVER[1] - 0.001, 25);
    await settle();
    expect(calls).toHaveLength(1);
  });

  test('concurrent searches for one place share a single request', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    S.fetch = (url) => { calls.push(String(url)); return gate.then(() => response(200, baseOk)); };
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 25);
    S.fetchDiscoverTrails(DENVER[0], DENVER[1], 30);
    release();
    await settle();
    expect(calls).toHaveLength(1);
  });
});

describe('Discover — the expanded tier is never fetched on its own', () => {
  test('a fresh search always asks for the base tier, even with the slider at 100', async () => {
    stub(() => response(200, baseOk));
    await search(100);
    expect(calls).toHaveLength(1);
    expect(tierOf(calls[0])).toBe(50);
  });

  test('crossing 50 on the slider shows a prompt and issues no request', async () => {
    stub(() => response(200, baseOk));
    await search(25);
    expect(calls).toHaveLength(1);
    S.updateDiscoverRadius(80);
    await settle();
    expect(calls).toHaveLength(1);                       // still just the base fetch
    expect(h.grid()).toMatch(/Search further out/i);
    expect(h.grid()).toMatch(/data-disc-act="expand-search"/);
  });

  test('dragging back and forth across 50 never starts a request', async () => {
    stub(() => response(200, baseOk));
    await search(25);
    [55, 30, 70, 45, 100, 20, 90].forEach(m => S.updateDiscoverRadius(m));
    await settle();
    expect(calls).toHaveLength(1);
  });

  test('the prompt says what the wait will cost', async () => {
    stub(() => response(200, baseOk));
    await search(25);
    S.updateDiscoverRadius(90);
    await settle();
    expect(h.grid()).toMatch(/up to a minute/i);
    expect(h.grid()).toMatch(/100 miles/);
  });

  test('only the explicit action fetches the expanded tier', async () => {
    stub((url) => response(200, tierOf(url) === 100 ? expandOk : baseOk));
    await search(25);
    S.updateDiscoverRadius(80);
    await settle();
    expect(calls).toHaveLength(1);

    S.discoverExpandSearch();
    await settle();
    expect(calls).toHaveLength(2);
    expect(tierOf(calls[1])).toBe(100);
  });

  test('once expanded, the whole slider is free again', async () => {
    stub((url) => response(200, tierOf(url) === 100 ? expandOk : baseOk));
    await search(25);
    S.updateDiscoverRadius(80);
    await settle();
    S.discoverExpandSearch();
    await settle();
    const after = calls.length;
    [1, 25, 50, 75, 100, 60, 10].forEach(m => S.updateDiscoverRadius(m));
    await settle();
    expect(calls).toHaveLength(after);
  });

  test('the expanded loading state explains the wait', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    stub((url) => (tierOf(url) === 100 ? gate.then(() => response(200, expandOk)) : response(200, baseOk)));
    await search(25);
    S.updateDiscoverRadius(80);
    await settle();
    S.discoverExpandSearch();
    await settle();
    expect(h.count()).toMatch(/can take up to a minute/i);
    release();
    await settle();
  });
});

describe('Discover — the Worker envelope', () => {
  test('ok renders cards and an honest total', async () => {
    stub(() => response(200, baseOk));
    await search(25);
    expect(h.grid()).toMatch(/disc-result/);
    expect(h.count()).toMatch(/trails/);
    expect(h.count()).toMatch(/Denver, Colorado/);
  });

  test('empty is reported as empty, with an in-tier expand offer', async () => {
    stub(() => response(200, envelope({ status: 'empty', items: [], count: 0 })));
    await search(25);
    expect(h.grid()).toMatch(/No trails found within 25 miles/);
    expect(h.grid()).toMatch(/data-disc-act="expand"/);
    expect(h.grid()).not.toMatch(/timed out/i);
  });

  test('timeout is a service condition, not an empty area', async () => {
    stub(() => response(504, JSON.stringify({ status: 'timeout', tier: 50 })));
    await search(25);
    expect(h.grid()).toMatch(/timed out/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
    expect(h.grid()).toMatch(/data-disc-act="retry"/);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
    expect(h.count()).toMatch(/not a report about what is nearby/i);
  });

  test('busy is a service condition too', async () => {
    stub(() => response(503, JSON.stringify({ status: 'busy', retryAfter: 30 })));
    await search(25);
    expect(h.grid()).toMatch(/busy/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
    expect(h.grid()).toMatch(/data-disc-act="retry"/);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });

  test('a network failure is reported as a connection problem', async () => {
    stub(() => new TypeError('Failed to fetch'));
    await search(25);
    expect(h.grid()).toMatch(/Could not reach|connection/i);
    expect(h.grid()).toMatch(/data-disc-act="retry"/);
    expect(h.grid()).not.toMatch(/data-disc-act="expand"/);
  });

  test('a non-JSON response is treated as busy, not a crash', async () => {
    stub(() => response(502, '<html>bad gateway</html>'));
    await search(25);
    expect(h.grid()).toMatch(/busy/i);
    expect(h.grid()).not.toMatch(/No trails found/i);
  });

  test('an expanded-tier failure does not silently drop back to 50 miles', async () => {
    stub((url) => (tierOf(url) === 100
      ? response(504, JSON.stringify({ status: 'timeout' }))
      : response(200, baseOk)));
    await search(25);
    S.updateDiscoverRadius(80);
    await settle();
    S.discoverExpandSearch();
    await settle();
    expect(h.grid()).toMatch(/timed out/i);

    // Retry must ask for the tier the user actually wanted.
    calls.length = 0;
    S.discoverRetry();
    await settle();
    expect(tierOf(calls[0])).toBe(100);
  });
});

describe('Discover — the busy state offers a second way out', () => {
  /* Retry is the action least likely to work when the upstream is throttling —
     four consecutive busy responses were observed while verifying the deploy —
     so busy, and only busy, also points at the state picker. */
  const busy = () => JSON.stringify({ status: 'busy', reason: 'upstream HTTP 521', retryAfter: 30 });

  async function showBusy() {
    stub(() => response(503, busy()));
    await search(25);
  }

  test('copy is exact', async () => {
    await showBusy();
    expect(h.grid()).toContain('⏳');
    expect(h.grid()).toContain('Trail service is busy');
    expect(h.grid()).toContain('Map data is rate-limited right now. Recently searched places still load instantly.');
    expect(h.count()).toContain('Trail service busy — this is not a report about what\u2019s nearby');
  });

  test('does not name the upstream vendor to the user', async () => {
    await showBusy();
    expect(h.grid()).not.toMatch(/OpenStreetMap|Overpass/i);
  });

  test('keeps Try again as the primary action, unchanged', async () => {
    await showBusy();
    expect(h.grid()).toMatch(/data-disc-act="retry"[^>]*>Try again</);
  });

  test('offers "Choose a state" when no state is selected', async () => {
    h.el('discoverStateSelect').value = '';
    await showBusy();
    expect(h.grid()).toMatch(/data-disc-act="state-picker"[^>]*>Choose a state</);
  });

  test('offers "Try another state" once a state anchor is selected', async () => {
    h.el('discoverStateSelect').value = 'MT';
    await showBusy();
    expect(h.grid()).toMatch(/data-disc-act="state-picker"[^>]*>Try another state</);
    h.el('discoverStateSelect').value = '';
  });

  test('the secondary action uses the shared ghost treatment', async () => {
    await showBusy();
    expect(h.grid()).toContain('disc-state__action disc-state__action--ghost');
  });

  test('both actions sit in a wrapper that can stack', async () => {
    await showBusy();
    expect(h.grid()).toContain('disc-state__actions');
  });

  test('timeout and network keep exactly one action and no wrapper', async () => {
    stub(() => response(504, JSON.stringify({ status: 'timeout' })));
    await search(25);
    expect(h.grid()).not.toContain('disc-state__actions');
    expect(h.grid()).not.toContain('state-picker');
    expect((h.grid().match(/<button/g) || []).length).toBe(1);

    stub(() => new TypeError('Failed to fetch'));
    await search(25);
    expect(h.grid()).not.toContain('disc-state__actions');
    expect(h.grid()).not.toContain('state-picker');
    expect((h.grid().match(/<button/g) || []).length).toBe(1);
  });

  test('timeout and network copy is untouched', async () => {
    stub(() => response(504, JSON.stringify({ status: 'timeout' })));
    await search(25);
    expect(h.grid()).toContain('The map service took too long to answer. This usually clears in a moment.');
    expect(h.count()).toContain('Search timed out — not a report about what is nearby');
  });
});

describe('Discover — busy-state focus and the state picker', () => {
  const busy = () => JSON.stringify({ status: 'busy', reason: 'upstream HTTP 521' });

  test('focus moves to Try again when busy replaces the results', async () => {
    h.clearInteractionLogs();
    stub(() => response(503, busy()));
    await search(25);
    expect(h.focusLog.length).toBeGreaterThan(0);
  });

  test('timeout and network do not move focus', async () => {
    h.clearInteractionLogs();
    stub(() => response(504, JSON.stringify({ status: 'timeout' })));
    await search(25);
    expect(h.focusLog).toEqual([]);

    h.clearInteractionLogs();
    stub(() => new TypeError('Failed to fetch'));
    await search(25);
    expect(h.focusLog).toEqual([]);
  });

  test('the state picker opens the dropdown and focuses the select', async () => {
    h.clearInteractionLogs();
    const stopped = { called: false };
    S.discoverOpenStatePicker({ stopPropagation: () => { stopped.called = true; } });
    // stopPropagation matters: a document-level listener closes this dropdown
    // on any outside click, and the delegated handler runs first.
    expect(stopped.called).toBe(true);
    expect(h.els.discoverLocDropdown.hidden).toBe(false);
    expect(h.activeId()).toBe('discoverStateSelect');
    expect(h.focusLog.some(f => f.id === 'discoverStateSelect' && f.preventScroll)).toBe(true);
  });

  test('it scrolls the search controls into view', () => {
    h.clearInteractionLogs();
    S.discoverOpenStatePicker({ stopPropagation() {} });
    expect(h.scrollLog.some(s => s.id === 'discoverLocField')).toBe(true);
  });

  test('it leaves an existing selection intact', () => {
    h.el('discoverStateSelect').value = 'MT';
    S.discoverOpenStatePicker({ stopPropagation() {} });
    expect(h.el('discoverStateSelect').value).toBe('MT');
    h.el('discoverStateSelect').value = '';
  });

  test('a successful retry moves focus to the result count', async () => {
    stub(() => response(503, busy()));
    await search(25);
    h.clearInteractionLogs();
    stub(() => response(200, baseOk));
    S.discoverRetry();
    await settle();
    expect(h.activeId()).toBe('discoverResCount');
  });

  test('an ordinary search does not move focus', async () => {
    stub(() => response(200, baseOk));
    h.T.cache = null;
    h.clearInteractionLogs();
    await search(25);
    expect(h.focusLog).toEqual([]);
  });
});

describe('Discover — state selection', () => {
  test('a state sets its curated anchor, not a centroid', async () => {
    stub(() => response(200, baseOk));
    S.discoverPickState('CO');
    await settle();
    const co = h.T.ANCHORS.find(a => a.code === 'CO');
    expect(h.T.userLat).toBeCloseTo(co.lat, 4);
    expect(h.T.userLon).toBeCloseTo(co.lon, 4);
    expect(h.T.placeLabel).toMatch(/Estes Park/);
  });

  test('picking a state searches from it', async () => {
    stub(() => response(200, baseOk));
    S.discoverPickState('MT');
    await settle();
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0], 'https://x.test');
    expect(Number(u.searchParams.get('lat'))).toBeCloseTo(48.4959, 3);
    expect(tierOf(calls[0])).toBe(50);
  });

  test('the anchor is named to the user, so the search never misrepresents itself', async () => {
    stub(() => response(200, baseOk));
    S.discoverPickState('NY');
    await settle();
    expect(h.els.discoverAnchorNote.textContent).toMatch(/Lake Placid/);
    expect(h.els.discoverAnchorNote.textContent).toMatch(/not its centre/i);
    expect(h.els.discoverAnchorNote.hidden).toBe(false);
  });

  test('an unknown or empty code does nothing', async () => {
    stub(() => response(200, baseOk));
    S.discoverPickState('');
    S.discoverPickState('ZZ');
    await settle();
    expect(calls).toHaveLength(0);
  });

  test('switching states drops the previous location cache', async () => {
    stub(() => response(200, baseOk));
    S.discoverPickState('CO');
    await settle();
    S.discoverPickState('MT');
    await settle();
    expect(calls).toHaveLength(2);
  });
});
