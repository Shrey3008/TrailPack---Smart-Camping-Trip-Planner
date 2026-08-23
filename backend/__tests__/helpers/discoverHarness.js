/* Loads the real frontend/discover.js into a stubbed DOM so the Discover tests
   exercise shipped code rather than a copy of it.

   discover.js is a browser script, not a module: it is deliberately not wrapped
   in an IIFE because dashboard.html calls several of its functions by name from
   inline handlers. That makes it loadable in a vm context, which is what this
   helper does — the alternative, duplicating the ranking and classification
   logic into the test, would let the two drift apart silently.

   Note the __t shim appended below. `let`/`const` at a vm script's top level
   live in a lexical scope that is not reflected onto the context object, so the
   module's private state (the cache, the current radius) is otherwise
   unreachable from a test. Function declarations do land on the context, which
   is why the functions themselves need no shim. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DISCOVER_JS = path.resolve(__dirname, '../../../frontend/discover.js');
const ANCHORS_JS = path.resolve(__dirname, '../../../frontend/state-anchors.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function createHarness() {
  const els = {};
  const focusLog = [];
  const scrollLog = [];
  let activeId = null;
  function el(id) {
    if (!els[id]) {
      els[id] = {
        id, value: '', textContent: '', innerHTML: '', hidden: false,
        style: {}, dataset: {},
        classList: { toggle() {}, contains() { return false; }, add() {} },
        setAttribute() {},
        /* Narrowly capable: the busy state focuses its primary button via
           grid.querySelector('[data-disc-act="retry"]'), so that one shape has
           to resolve to something focusable. Everything else still returns
           null, as before. */
        querySelector(sel) {
          return /^\[data-disc-act=/.test(String(sel)) ? el(this.id + ' ' + sel) : null;
        },
        querySelectorAll() { return []; }, addEventListener() {},
        // Focus and scrolling are behaviour the busy state depends on, so the
        // stub records them rather than swallowing them.
        focus(opts) { focusLog.push({ id: this.id, preventScroll: !!(opts && opts.preventScroll) }); activeId = this.id; },
        blur() { if (activeId === this.id) activeId = null; },
        scrollIntoView(opts) { scrollLog.push({ id: this.id, behavior: opts && opts.behavior }); },
        options: [], appendChild() {}
      };
    }
    return els[id];
  }

  // Leaflet stand-ins. discoverMap stays undefined, so discoverPositionMap
  // returns early; renderDiscoverPins still calls L.divIcon/L.marker at the top
  // of the function regardless, so those must exist.
  const marker = { addTo: () => marker, bindPopup: () => marker };
  const sandbox = {
    console,
    document: {
      getElementById: (id) => el(id),
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ value: '', textContent: '', dataset: {} }),
      createDocumentFragment: () => { const kids = []; return { kids, appendChild: k => kids.push(k) }; }
    },
    window: { addEventListener: () => {}, scrollTo: () => {} },
    setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error('no fetch stub installed')),
    L: {
      divIcon: () => ({}), marker: () => marker,
      circle: () => ({ addTo: () => {} }),
      map: () => ({}), tileLayer: () => ({ addTo: () => {} })
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // state-anchors.js first: discover.js reads STATE_ANCHORS when a state is
  // picked and when it builds the dropdown, matching the order dashboard.html
  // loads the two <script> tags in.
  const src = fs.readFileSync(ANCHORS_JS, 'utf8') + '\n'
    + fs.readFileSync(DISCOVER_JS, 'utf8') + `
;globalThis.__t = {
  get cache(){ return discoverCache; },       set cache(v){ discoverCache = v; },
  get inFlight(){ return discoverInFlight; }, set inFlight(v){ discoverInFlight = v; },
  get radius(){ return discoverRadiusMi; },   set radius(v){ discoverRadiusMi = v; },
  get userLat(){ return discoverUserLat; },   set userLat(v){ discoverUserLat = v; },
  get userLon(){ return discoverUserLon; },   set userLon(v){ discoverUserLon = v; },
  get placeLabel(){ return discoverPlaceLabel; }, set placeLabel(v){ discoverPlaceLabel = v; },
  TIERS: DISCOVER_TIERS, MAX_MI: DISCOVER_MAX_MI, SHOW_N: DISCOVER_SHOW_N,
  ANCHORS: STATE_ANCHORS, ANCHORS_VERSION: ANCHORS_VERSION,
  ACTIONS: DISCOVER_ACTIONS
};`;
  vm.runInContext(src, sandbox, { filename: 'discover.js' });

  const T = sandbox.__t;
  return {
    S: sandbox, els, T, el,
    focusLog, scrollLog,
    activeId: () => activeId,
    clearInteractionLogs() { focusLog.length = 0; scrollLog.length = 0; activeId = null; },
    grid:  () => els.discoverTrailResults ? els.discoverTrailResults.innerHTML : '',
    count: () => els.discoverResCount
      ? els.discoverResCount.textContent + els.discoverResCount.innerHTML : '',
    reset() {
      T.cache = null; T.inFlight = null; T.radius = 25;
      T.userLat = undefined; T.userLon = undefined; T.placeLabel = '';
      Object.keys(els).forEach(k => { els[k].innerHTML = ''; els[k].textContent = ''; });
    }
  };
}

/* Real 50-mile Overpass payloads captured from the live API with the query
   discoverQuery() builds, then reduced to the fields discoverParse() and
   discoverIsUrbanPath() actually read (12 MB -> 1.6 MB). Verified to produce
   identical rankings and counts to the untrimmed responses. */
function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.overpass.json'), 'utf8'));
}

/* The *other* kind of fixture: a captured /api/nearby-trails envelope, which is
   what the browser actually receives now that the Worker parses and trims.
   Generated from real 100-mile payloads, so the counts in the frontend tests
   are real OSM data. */
function fixtureItems(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.items.json'), 'utf8'));
}

// A resolved fetch Response stand-in.
const response = (status, body) => ({
  status, ok: status >= 200 && status < 300, text: () => Promise.resolve(body)
});

// Lets pending promise chains inside discover.js run to completion.
const settle = () => new Promise(r => setTimeout(r, 5));

const DENVER = [39.7392, -104.9903];
const SEATTLE = [47.6062, -122.3321];

const NYC = [40.7128, -74.0060];
const LANDER = [42.8330, -108.7307];

module.exports = { createHarness, fixture, fixtureItems, response, settle,
                   DENVER, SEATTLE, NYC, LANDER, DISCOVER_JS };
