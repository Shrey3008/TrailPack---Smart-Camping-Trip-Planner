/* Discover: the contract between dashboard.html's markup and discover.js.

   These two files are coupled by more than the delegated data-disc-act
   actions. The slider's max attribute has to agree with the radius the module
   fetches at, because "fetch once at the maximum, then filter in memory" is
   only correct while every radius the slider can select is inside the cached
   payload. Raising max="50" in the markup alone would silently return short
   results for the radii above 50 rather than fail. */
const fs = require('fs');
const path = require('path');
const { createHarness, response } = require('./helpers/discoverHarness');

const DASHBOARD = path.resolve(__dirname, '../../frontend/dashboard.html');

let html, h, S;
beforeAll(() => {
  html = fs.readFileSync(DASHBOARD, 'utf8');
  h = createHarness();
  S = h.S;
});

describe('Discover — markup/module contract', () => {
  const slider = () => html.match(/<input[^>]*id="discoverRadiusSlider"[^>]*>/)[0];

  test('slider max equals the radius the module fetches at', () => {
    const max = Number(slider().match(/max="(\d+)"/)[1]);
    expect(max).toBe(h.T.FETCH_MI);
  });

  test('slider still calls updateDiscoverRadius on input', () => {
    // This is what makes a drag re-filter the cache instead of doing nothing.
    expect(slider()).toMatch(/oninput="updateDiscoverRadius\(this\.value\)"/);
  });

  test('slider min is at least 1 mile', () => {
    expect(Number(slider().match(/min="(\d+)"/)[1])).toBeGreaterThanOrEqual(1);
  });

  test('radius-apply, expand and retry all reach live handlers', async () => {
    h.T.userLat = 39.7392;
    h.T.userLon = -104.9903;
    h.T.cache = null;
    S.fetch = () => Promise.resolve(response(200, '{"elements":[]}'));
    expect(() => {
      S.applyDiscoverRadius();
      S.discoverExpandRadius();
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
