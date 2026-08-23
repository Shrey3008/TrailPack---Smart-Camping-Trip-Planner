/* The contract between dashboard.html's markup and the Discover module.

   These two files are coupled by more than the delegated data-disc-act
   actions. The slider's max has to agree with the widest tier the module can
   fetch, because "fetch a tier, then filter in memory" is only correct while
   every selectable radius sits inside a disc we can actually load. Raising
   max="100" past the widest tier would silently return short results rather
   than fail, which is the kind of bug that ships. */
const fs = require('fs');
const path = require('path');
const { createHarness, response } = require('./helpers/discoverHarness');

const DASHBOARD = path.resolve(__dirname, '../../frontend/dashboard.html');
const html = fs.readFileSync(DASHBOARD, 'utf8');
const { S, T, els, el } = createHarness();

const slider = () => html.match(/<input[^>]*id="discoverRadiusSlider"[^>]*>/)[0];

describe('Discover — slider contract', () => {
  test('slider max equals the widest tier the module can fetch', () => {
    expect(Number(slider().match(/max="(\d+)"/)[1])).toBe(T.MAX_MI);
  });
  test('the widest tier is the expanded one', () => {
    expect(T.MAX_MI).toBe(T.TIERS.EXPANDED);
    expect(T.TIERS.EXPANDED).toBe(100);
  });
  test('the base tier is below the max, so the two-tier split is real', () => {
    expect(T.TIERS.BASE).toBeLessThan(T.TIERS.EXPANDED);
  });
  test('slider still calls updateDiscoverRadius on input', () => {
    // This is what makes a drag re-filter the cache instead of doing nothing.
    expect(slider()).toMatch(/oninput="updateDiscoverRadius\(this\.value\)"/);
  });
  test('slider min is at least 1 mile', () => {
    expect(Number(slider().match(/min="(\d+)"/)[1])).toBeGreaterThanOrEqual(1);
  });
  test('the scale marks the tier boundary rather than an arbitrary midpoint', () => {
    const scale = html.match(/<div class="disc-popover__scale">[\s\S]*?<\/div>/)[0];
    expect(scale).toContain(String(T.TIERS.BASE));
    expect(scale).toContain(String(T.MAX_MI));
  });
});

describe('Discover — state picker contract', () => {
  test('the anchor table is loaded before the module that reads it', () => {
    const anchors = html.indexOf('state-anchors.js');
    const discover = html.indexOf('discover.js');
    expect(anchors).toBeGreaterThan(-1);
    expect(discover).toBeGreaterThan(-1);
    expect(anchors).toBeLessThan(discover);
  });
  test('the select exists and calls discoverPickState', () => {
    const sel = html.match(/<select[^>]*id="discoverStateSelect"[^>]*>/)[0];
    expect(sel).toMatch(/onchange="discoverPickState\(this\.value\)"/);
  });
  test('the select is labelled and described', () => {
    expect(html).toMatch(/<label[^>]*for="discoverStateSelect"/);
    expect(html).toMatch(/aria-describedby="discoverAnchorNote"/);
    expect(html).toMatch(/id="discoverAnchorNote"/);
  });
  test('the select ships empty — the 51 rows come from the bundled table', () => {
    // One source of truth: option labels cannot drift from the coordinates
    // they describe if they are generated from the same rows.
    const block = html.match(/<select[^>]*id="discoverStateSelect"[\s\S]*?<\/select>/)[0];
    expect((block.match(/<option/g) || []).length).toBe(1);
  });
  test('renderDiscoverStates fills it from the bundled table', () => {
    const sel = el('discoverStateSelect');
    sel.options = [{}];
    const appended = [];
    sel.appendChild = (frag) => appended.push(frag);
    S.renderDiscoverStates();
    expect(appended).toHaveLength(1);
  });
  test('state search never contacts a geocoder', () => {
    // Nominatim's policy forbids client-side autocomplete against the public
    // instance; the bundled table is what keeps this clear of it.
    // Comments stripped first: the file explains *why* it avoids Nominatim,
    // and that explanation must not trip its own guard.
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend/state-anchors.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/nominatim|fetch\(|XMLHttpRequest/i);
  });
});

describe('Discover — action wiring', () => {
  test('every data-disc-act in the markup resolves to a handler', () => {
    const used = new Set((html.match(/data-disc-act="([a-z-]+)"/g) || [])
      .map(m => m.replace(/.*="([a-z-]+)"/, '$1')));
    // Actions the module also emits into rendered HTML.
    ['expand', 'expand-search', 'retry', 'zoom', 'plan'].forEach(a => used.add(a));
    used.forEach(a => expect(typeof T.ACTIONS[a]).toBe('function'));
  });

  test('radius-apply, expand, expand-search and retry all reach live code', () => {
    T.userLat = 39.7392; T.userLon = -104.9903; T.cache = null;
    S.fetch = () => Promise.resolve(response(200, JSON.stringify({ status: 'empty', items: [] })));
    expect(() => {
      S.applyDiscoverRadius();
      S.discoverExpandRadius();
      S.discoverExpandSearch();
      S.discoverRetry();
    }).not.toThrow();
  });

  test('the results grid and count nodes the renderer writes to still exist', () => {
    expect(html).toMatch(/id="discoverTrailResults"/);
    expect(html).toMatch(/id="discoverResCount"/);
  });

  test('no filter pill promises data the query does not fetch', () => {
    // "Free Entry", "Easy Difficulty" and "Open Now" were removed because none
    // of fee, difficulty or opening hours is fetched. Comments documenting the
    // removal are stripped first so the record does not trip its own guard.
    const live = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(live).not.toMatch(/Free Entry|Easy Difficulty|Open Now/);
  });
});
