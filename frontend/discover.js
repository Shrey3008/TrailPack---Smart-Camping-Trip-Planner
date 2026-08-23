/* =============================================================================
   Discover Trails — search, map, result cards, and the Discover home content.

   Extracted from a 462-line inline <script> block in dashboard.html on
   2026-08-11. Loaded by dashboard.html only, after Leaflet (it calls L.map at
   window load) and after dashboard-light.js (it calls openPlanTripModal).

   Not wrapped in an IIFE: the markup still calls several of these by name from
   inline handlers, and dashboard-light.js's openPlanTripModal is likewise a
   global. Wrapping would silently break both.
   ============================================================================= */

// ===== DISCOVER TRAILS =====
  let discoverMap, discoverUserLat, discoverUserLon, discoverRadiusMi = 25;
  /* Human name for the current search centre — a city, a state's curated
 anchor, or "Current Location". Kept separate from the input's value so the
 count line and the map pin can say where they mean without re-reading and
 re-stripping the input. */
  let discoverPlaceLabel = '';
  let discoverDDOpen = false, discoverRPOpen = false;
  let discoverDebT = null;

  /* ---------- Two tiers, fetched once each, filtered locally ----------
 Discover asks the Worker for trails once per location per tier, and every
 radius change after that filters the cached set in memory. Overpass itself is
 never contacted from the browser any more: /api/nearby-trails does that, and
 returns only the fields rendered here. A 100-mile search around New York is
 18.22 MB and 77 s upstream; the trimmed answer is 378 KB gzipped.

 Two tiers rather than one, because the old "always fetch at the slider's
 maximum" rule stops working when the maximum is 100. It would make every
 search a 100-mile search — a 40-77 s wait for the user who only wanted ten
 miles. So 50 stays the default disc, and 51-100 is an explicit expanded
 search the user asks for. Within each tier the guarantee is unchanged: one
 request, then free filtering.

 A cached tier serves any radius up to its own size, so once the 100-mile disc
 is loaded the slider is free across its whole range and never refetches. */
  const DISCOVER_TIERS    = { BASE: 50, EXPANDED: 100 };
  const DISCOVER_MAX_MI   = DISCOVER_TIERS.EXPANDED;  // must match the slider's max
  const DISCOVER_SHOW_N   = 12;                       // result cards rendered
  const DISCOVER_MI_M     = 1609.34;

  /* Cached payload: { key, tier, lat, lon, items }. Keyed by lat/lon rounded
 to 2dp (~0.7 mi) — the same cell the Worker caches on, so the two layers
 agree on what "the same place" means. One entry: a second location evicts the
 first, trading memory for a refetch on the way back. */
  let discoverCache = null;
  let discoverInFlight = null;
  /* Set only by discoverRetry(), so focus moves to the result count when a
 retry *succeeds* and nowhere else. Moving focus on every render would yank
 the caret out of the search box on an ordinary first search. */
  let discoverRetryPending = false;

  let discoverActiveTerrain = 'all';
  /* Terrain tints for the result-card media panel. These replaced four
 picsum.photos URLs (random stock images, seeded per terrain) that were
 rendered with alt="<trail name>" — a photograph of somewhere else
 captioned as the place the user is looking at. A flat tinted panel with
 the terrain glyph reads as a category swatch and claims nothing.

 Also removed alongside them: DISCOVER_RT / DISCOVER_RC, two hardcoded
 arrays rendered as "👍 97% (419)" review scores, and discoverFee(), which
 invented "$25 / vehicle" from a regex on the place name. */
  const DISCOVER_TERRAIN_TINT = {
forest:   { bg: '#e6f2eb', fg: '#2d6a4f', glyph: '🌲' },
mountain: { bg: '#e6eefb', fg: '#1e40af', glyph: '⛰️' },
lake:     { bg: '#e3f4f8', fg: '#0e7490', glyph: '🌊' },
desert:   { bg: '#fdeee2', fg: '#c2410c', glyph: '🏜️' }
  };

  window.addEventListener('load', () => {
if (document.getElementById('discoverMap')) {
  discoverMap = L.map('discoverMap').setView([41.8781, -87.6298], 9);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO', maxZoom: 19, subdomains: 'abcd'
  }).addTo(discoverMap);
}
renderDiscoverHome();
  });

  /* ============================================================
 Discover home content (Hipcamp-style)
 Static destination data → rendered into the carousels and SEO
 link grid. Card clicks reuse the existing discoverPickCity()
 entry-point so they go through the same search → map flow.
 ============================================================ */
  const DISCOVER_HOME_PARKS = [
{ name: 'Yosemite National Park',         region: 'California',     lat: 37.8651, lon: -119.5383, terrain: 'mountain' },
{ name: 'Zion National Park',             region: 'Utah',           lat: 37.2982, lon: -113.0263, terrain: 'desert'   },
{ name: 'Acadia National Park',           region: 'Maine',          lat: 44.3386, lon: -68.2733,  terrain: 'forest'   },
{ name: 'Glacier National Park',          region: 'Montana',        lat: 48.7596, lon: -113.7870, terrain: 'mountain' },
{ name: 'Yellowstone National Park',      region: 'Wyoming',        lat: 44.4280, lon: -110.5885, terrain: 'forest'   },
{ name: 'Grand Canyon National Park',     region: 'Arizona',        lat: 36.1069, lon: -112.1129, terrain: 'desert'   },
{ name: 'Olympic National Park',          region: 'Washington',     lat: 47.8021, lon: -123.6044, terrain: 'forest'   },
{ name: 'Sequoia National Park',          region: 'California',     lat: 36.4864, lon: -118.5658, terrain: 'forest'   },
  ];
  const DISCOVER_HOME_FOREST = [
{ name: 'Redwood National Park',          region: 'California',     lat: 41.2132, lon: -124.0046, terrain: 'forest' },
{ name: 'Great Smoky Mountains',          region: 'Tennessee',      lat: 35.6532, lon: -83.5070,  terrain: 'forest' },
{ name: 'Shenandoah National Park',       region: 'Virginia',       lat: 38.5328, lon: -78.3528,  terrain: 'forest' },
{ name: 'Hoh Rainforest',                 region: 'Washington',     lat: 47.8606, lon: -123.9352, terrain: 'forest' },
{ name: 'Muir Woods',                     region: 'California',     lat: 37.8965, lon: -122.5811, terrain: 'forest' },
{ name: 'Congaree National Park',         region: 'South Carolina', lat: 33.7948, lon: -80.7821,  terrain: 'forest' },
{ name: 'White Mountain National Forest', region: 'New Hampshire',  lat: 44.1004, lon: -71.5800,  terrain: 'forest' },
{ name: 'Pisgah National Forest',         region: 'North Carolina', lat: 35.4140, lon: -82.7484,  terrain: 'forest' },
  ];
  const DISCOVER_HOME_MOUNTAIN = [
{ name: 'Rocky Mountain National Park',   region: 'Colorado',       lat: 40.3428, lon: -105.6836, terrain: 'mountain' },
{ name: 'Grand Teton National Park',      region: 'Wyoming',        lat: 43.7904, lon: -110.6818, terrain: 'mountain' },
{ name: 'Mount Rainier National Park',    region: 'Washington',     lat: 46.8523, lon: -121.7603, terrain: 'mountain' },
{ name: 'North Cascades National Park',   region: 'Washington',     lat: 48.7718, lon: -121.2985, terrain: 'mountain' },
{ name: 'Mount Whitney',                  region: 'California',     lat: 36.5786, lon: -118.2920, terrain: 'mountain' },
{ name: 'Mount Hood',                     region: 'Oregon',         lat: 45.3735, lon: -121.6960, terrain: 'mountain' },
{ name: 'Pikes Peak',                     region: 'Colorado',       lat: 38.8409, lon: -105.0423, terrain: 'mountain' },
{ name: 'Mount Washington',               region: 'New Hampshire',  lat: 44.2705, lon: -71.3033,  terrain: 'mountain' },
  ];
  const DISCOVER_HOME_LAKE = [
{ name: 'Crater Lake National Park',      region: 'Oregon',         lat: 42.8684, lon: -122.1685, terrain: 'lake' },
{ name: 'Lake Tahoe',                     region: 'California',     lat: 39.0968, lon: -120.0324, terrain: 'lake' },
{ name: 'Niagara Falls',                  region: 'New York',       lat: 43.0962, lon: -79.0377,  terrain: 'lake' },
{ name: 'Multnomah Falls',                region: 'Oregon',         lat: 45.5762, lon: -122.1158, terrain: 'lake' },
{ name: 'Lake Powell',                    region: 'Arizona / Utah', lat: 36.9384, lon: -111.4837, terrain: 'lake' },
{ name: 'Lake of the Ozarks',             region: 'Missouri',       lat: 38.1500, lon: -92.6333,  terrain: 'lake' },
{ name: 'Voyageurs National Park',        region: 'Minnesota',      lat: 48.4839, lon: -92.8386,  terrain: 'lake' },
{ name: 'Apostle Islands',                region: 'Wisconsin',      lat: 46.9692, lon: -90.6610,  terrain: 'lake' },
  ];
  const DISCOVER_HOME_DESERT = [
{ name: 'Death Valley National Park',     region: 'California',     lat: 36.5054, lon: -117.0794, terrain: 'desert' },
{ name: 'Joshua Tree National Park',      region: 'California',     lat: 33.8734, lon: -115.9010, terrain: 'desert' },
{ name: 'Saguaro National Park',          region: 'Arizona',        lat: 32.2967, lon: -110.7282, terrain: 'desert' },
{ name: 'Bryce Canyon National Park',     region: 'Utah',           lat: 37.5930, lon: -112.1871, terrain: 'desert' },
{ name: 'Arches National Park',           region: 'Utah',           lat: 38.7331, lon: -109.5925, terrain: 'desert' },
{ name: 'Big Bend National Park',         region: 'Texas',          lat: 29.1275, lon: -103.2425, terrain: 'desert' },
{ name: 'Canyonlands National Park',      region: 'Utah',           lat: 38.3269, lon: -109.8783, terrain: 'desert' },
{ name: 'White Sands National Park',      region: 'New Mexico',     lat: 32.7794, lon: -106.1714, terrain: 'desert' },
  ];
  const DISCOVER_HOME_STATES = [
{ name: 'California',     lat: 36.7783, lon: -119.4179 },
{ name: 'Colorado',       lat: 39.5501, lon: -105.7821 },
{ name: 'Utah',           lat: 39.3210, lon: -111.0937 },
{ name: 'Washington',     lat: 47.7511, lon: -120.7401 },
{ name: 'Oregon',         lat: 43.8041, lon: -120.5542 },
{ name: 'Wyoming',        lat: 43.0760, lon: -107.2903 },
{ name: 'Montana',        lat: 46.8797, lon: -110.3626 },
{ name: 'Arizona',        lat: 34.0489, lon: -111.0937 },
{ name: 'New Mexico',     lat: 34.5199, lon: -105.8701 },
{ name: 'North Carolina', lat: 35.7596, lon: -79.0193 },
  ];
  const DISCOVER_HOME_CITIES = [
{ name: 'Denver, CO',         lat: 39.7392, lon: -104.9903 },
{ name: 'Seattle, WA',        lat: 47.6062, lon: -122.3321 },
{ name: 'Portland, OR',       lat: 45.5152, lon: -122.6784 },
{ name: 'Phoenix, AZ',        lat: 33.4484, lon: -112.0740 },
{ name: 'Salt Lake City, UT', lat: 40.7608, lon: -111.8910 },
{ name: 'Boulder, CO',        lat: 40.0150, lon: -105.2705 },
{ name: 'Asheville, NC',      lat: 35.5951, lon: -82.5515  },
{ name: 'Boise, ID',          lat: 43.6150, lon: -116.2023 },
{ name: 'Bozeman, MT',        lat: 45.6770, lon: -111.0429 },
{ name: 'Albuquerque, NM',    lat: 35.0844, lon: -106.6504 },
  ];

  /* Escapes a value for use inside a double-quoted HTML attribute. The card
 data below is hardcoded, but the autocomplete rows interpolate names that
 came back from Nominatim, so the attributes these builders emit are not all
 trusted input. */
  function discAttr(v) {
return String(v == null ? '' : v)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
  }

  /* Photo for one destination, looked up by the exact name the card shows.

 This replaced a per-terrain stock pool indexed by the card's position in its
 row. That pool never knew which place it was illustrating: it dealt the same
 generic forest or mountain shot to whichever card happened to land on that
 index, which put one image under two different park names eight times over —
 Yosemite and Rocky Mountain, Yellowstone and Muir Woods, and six more.

 A destination with no entry gets no photo. The card then renders the terrain
 tint panel below, the same treatment D3 gave the result cards: it reads as a
 category swatch and claims nothing, which is the honest fallback. Borrowing a
 neighbour's photo to fill the gap is the exact bug being fixed here. */
  function discoverHomePhotoFor(name) {
return (typeof DISCOVER_PLACE_PHOTOS !== 'undefined' && DISCOVER_PLACE_PHOTOS[name])
  ? DISCOVER_PLACE_PHOTOS[name]
  : null;
  }

  function discoverHomeCardHTML(item) {
const photo = discoverHomePhotoFor(item.name);
const query = item.name + (item.region ? ', ' + item.region : '');

// No photo → terrain tint panel, matching the result cards' media panel.
let media;
if (photo) {
  media = '<div class="disc-card-photo" style="background-image:url(\''
        + discAttr(photo.src) + '\')" role="img" aria-label="'
        + discAttr(item.name) + '"></div>';
} else {
  const tint = DISCOVER_TERRAIN_TINT[item.terrain] || DISCOVER_TERRAIN_TINT.forest;
  media = '<div class="disc-card-photo disc-card-photo--tint" style="background:'
        + discAttr(tint.bg) + ';color:' + discAttr(tint.fg) + '" aria-hidden="true">'
        + '<span class="disc-card-glyph">' + tint.glyph + '</span></div>';
}

/* The credit is a sibling of the button, not a child: a link inside a button
   is invalid HTML and would not be independently clickable. It is positioned
   over the photo by CSS. Only licences that actually impose an attribution
   condition get one — the generator sets credit:false for public domain. */
const creditEl = (photo && photo.credit)
  ? '<a class="disc-card-credit" href="' + discAttr(photo.page) + '"'
    + ' target="_blank" rel="noopener noreferrer"'
    + ' title="' + discAttr(photo.by + ' — ' + photo.license
                            + '. Opens the file page on Wikimedia Commons.') + '">'
    + '© ' + discAttr(photo.by) + ' / ' + discAttr(photo.license) + '</a>'
  : '';

return ''
  + '<div class="disc-card-wrap">'
  +   '<button type="button" class="disc-card" data-disc-act="pick-city" '
  +   'data-name="' + discAttr(query) + '" data-lat="' + item.lat + '" data-lon="' + item.lon + '">'
  +     media
  +     '<div class="disc-card-body">'
  +       '<p class="disc-card-title">' + item.name + '</p>'
  +       (item.region ? '<p class="disc-card-sub">📍 ' + item.region + '</p>' : '')
  +     '</div>'
  +   '</button>'
  +   creditEl
  + '</div>';
  }

  function renderDiscoverRow(elId, list) {
const el = document.getElementById(elId);
if (!el) return;
el.innerHTML = list.map((it) => discoverHomeCardHTML(it)).join('');
  }

  function renderDiscoverLinkList(elId, list) {
const el = document.getElementById(elId);
if (!el) return;
el.innerHTML = list.map((it) => {
  return '<button type="button" class="disc-link-item" data-disc-act="pick-city" '
    + 'data-name="' + discAttr(it.name) + '" data-lat="' + it.lat + '" data-lon="' + it.lon + '">'
    + it.name + '</button>';
}).join('');
  }

  /* Fills the state <select> from the bundled table. Runs at render time
 rather than being written into the markup so the 51 rows live in exactly one
 place — state-anchors.js — and the option labels cannot drift from the
 coordinates they are meant to describe. */
  function renderDiscoverStates() {
const sel = document.getElementById('discoverStateSelect');
if (!sel || typeof STATE_ANCHORS === 'undefined') return;
if (sel.options.length > 1) return;                 // already built
const frag = document.createDocumentFragment();
STATE_ANCHORS.forEach(a => {
  const o = document.createElement('option');
  o.value = a.code;
  o.textContent = a.name + ' — ' + a.anchor;
  frag.appendChild(o);
});
sel.appendChild(frag);
  }

  function renderDiscoverHome() {
renderDiscoverStates();
renderDiscoverRow('discoverRowParks',    DISCOVER_HOME_PARKS);
renderDiscoverRow('discoverRowForest',   DISCOVER_HOME_FOREST);
renderDiscoverRow('discoverRowMountain', DISCOVER_HOME_MOUNTAIN);
renderDiscoverRow('discoverRowLake',     DISCOVER_HOME_LAKE);
renderDiscoverRow('discoverRowDesert',   DISCOVER_HOME_DESERT);
renderDiscoverLinkList('discoverLinksParks',  DISCOVER_HOME_PARKS);
renderDiscoverLinkList('discoverLinksStates', DISCOVER_HOME_STATES);
renderDiscoverLinkList('discoverLinksCities', DISCOVER_HOME_CITIES);
  }

  // Show the home content again (called by the "Back to Discover" button
  // inside the results header). Hides the results block + map.
  function discoverHomeShow() {
const home = document.getElementById('discoverHomeContent');
const res  = document.getElementById('discoverResultsBlock');
const pills = document.getElementById('discoverPillRow');
if (home) home.hidden = false;
if (res)  res.hidden  = true;
// Nothing to filter on the home view.
if (pills) pills.hidden = true;
window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Terrain filter pills ----------
 Filters the rendered result cards by the terrain badge discoverTerrain()
 already assigned to each one. Purely client-side over the current result
 set — it does not re-query Overpass, so it cannot surface trails outside
 the radius the user searched. */
  function setDiscoverPill(el) {
document.querySelectorAll('.disc-pill').forEach(p => {
  const active = p === el;
  p.classList.toggle('is-active', active);
  p.setAttribute('aria-pressed', active ? 'true' : 'false');
});
discoverActiveTerrain = el.dataset.terrain || 'all';
applyDiscoverPillFilter();
  }

  function applyDiscoverPillFilter() {
const grid = document.getElementById('discoverTrailResults');
if (!grid) return;
const cards = grid.querySelectorAll('[data-terrain]');
let visible = 0;
cards.forEach(card => {
  const match = discoverActiveTerrain === 'all'
    || card.dataset.terrain === discoverActiveTerrain;
  card.style.display = match ? '' : 'none';
  if (match) visible++;
});

// Only meaningful once results exist; with none rendered there is nothing
// to report and the placeholder/empty state owns the grid.
let note = grid.querySelector('.disc-pill-empty');
if (cards.length && !visible) {
  if (!note) {
    note = document.createElement('div');
    note.className = 'disc-pill-empty';
    grid.appendChild(note);
  }
  note.textContent = 'No results in this search match that terrain.';
  note.style.display = '';
} else if (note) {
  note.style.display = 'none';
}
  }

  function toggleLocDropdown(e) {
e.stopPropagation();
closeDiscoverRP();
discoverDDOpen = !discoverDDOpen;
document.getElementById('discoverLocDropdown').hidden = !discoverDDOpen;
  }
  function closeDiscoverDD() {
discoverDDOpen = false;
document.getElementById('discoverLocDropdown').hidden = true;
  }
  function toggleRadiusPopover(e) {
e.stopPropagation();
closeDiscoverDD();
discoverRPOpen = !discoverRPOpen;
document.getElementById('discoverRadiusPopover').hidden = !discoverRPOpen;
  }
  function closeDiscoverRP() {
discoverRPOpen = false;
document.getElementById('discoverRadiusPopover').hidden = true;
  }
  document.addEventListener('click', () => { closeDiscoverDD(); closeDiscoverRP(); });

  /* Fires on every slider input. Re-rendering straight from the cache is what
 makes the drag feel instant and costs Overpass nothing — the whole point of
 fetching a whole tier up front. With no cache yet (the slider is reachable
 before the first search) this only moves the labels. */
  /* Fires on every slider input. Renders straight from whichever tier is
 already cached, which is what makes the drag instant and costs nothing.
 Crossing 50 without the expanded tier loaded does NOT fetch — it shows the
 expanded-search prompt and waits to be asked. */
  function updateDiscoverRadius(v) {
discoverRadiusMi = parseInt(v);
document.getElementById('discoverRadiusDisplay').textContent = v + ' miles';
document.getElementById('discoverRadiusBig').textContent = v + ' miles';
if (discoverUserLat == null) return;
if (discoverCacheCovers(discoverUserLat, discoverUserLon, discoverRadiusMi)) {
  discoverRenderFromCache(discoverUserLat, discoverUserLon, discoverRadiusMi);
} else if (discoverCache) {
  discoverShowExpandPrompt(discoverRadiusMi);
}
  }
  /* Apply now only closes the popover: updateDiscoverRadius already rendered
 the new radius live. It still repaints for the case where the cache arrived
 while the popover was open. */
  function applyDiscoverRadius() {
closeDiscoverRP();
if (discoverUserLat != null) fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi);
  }

  function discoverPickCity(name, lat, lon) {
document.getElementById('discoverLocInput').value = name;
discoverPlaceLabel = name;
discoverUserLat = lat; discoverUserLon = lon;
discoverCache = null;                       // new place, new disc
closeDiscoverDD();
fetchDiscoverTrails(lat, lon, discoverRadiusMi);
  }

  /* Selecting a state resolves entirely against the bundled anchor table in
 state-anchors.js — no geocoder, no network. The anchor is a real trail-access
 hub rather than the state's geometric centre, and the label says which one it
 picked so the search never claims to be somewhere it isn't. */
  function discoverPickState(code) {
if (!code) return;
const list = (typeof STATE_ANCHORS !== 'undefined') ? STATE_ANCHORS : [];
let a = null;
for (let i = 0; i < list.length; i++) if (list[i].code === code) { a = list[i]; break; }
if (!a) return;
const label = a.anchor + ', ' + a.code;
const input = document.getElementById('discoverLocInput');
if (input) input.value = label;
discoverPlaceLabel = label;
discoverUserLat = a.lat; discoverUserLon = a.lon;
discoverCache = null;
const note = document.getElementById('discoverAnchorNote');
if (note) {
  note.textContent = 'Searching from ' + a.anchor + ' — ' + a.name + '\u2019s trail gateway, not its centre.';
  note.hidden = false;
}
closeDiscoverDD();
fetchDiscoverTrails(a.lat, a.lon, discoverRadiusMi);
  }

  function useDiscoverNearby() {
closeDiscoverDD();
document.getElementById('discoverLocInput').value = '📍 Detecting...';
if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
navigator.geolocation.getCurrentPosition(
  pos => {
    discoverUserLat = pos.coords.latitude;
    discoverUserLon = pos.coords.longitude;
    document.getElementById('discoverLocInput').value = '📍 Current Location';
    discoverPlaceLabel = 'your location';
    discoverCache = null;
    fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi);
  },
  () => {
    document.getElementById('discoverLocInput').value = '';
    alert('Location denied — please pick a city instead');
  }
);
  }

  function triggerDiscoverSearch() {
const v = document.getElementById('discoverLocInput').value.trim();
if (discoverUserLat) { fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi); return; }
if (!v || v.startsWith('📍')) { useDiscoverNearby(); return; }
fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(v) + '&format=json&limit=1&countrycodes=us')
  .then(r => r.json()).then(d => {
    if (d[0]) {
      discoverUserLat = parseFloat(d[0].lat);
      discoverUserLon = parseFloat(d[0].lon);
      discoverPlaceLabel = v;
      discoverCache = null;
      fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi);
    }
  });
  }

  function onDiscoverLocInput(v) {
discoverUserLat = null; discoverUserLon = null;
if (v.length < 2) return;
clearTimeout(discoverDebT);
discoverDebT = setTimeout(() => {
  fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(v) + '&format=json&limit=5&countrycodes=us')
    .then(r => r.json()).then(data => {
      document.getElementById('discoverCityList').innerHTML = data.map(d => {
        const p = d.display_name.split(',');
        return '<div class="disc-dd-row" data-disc-act="pick-city" data-name="' + discAttr(p[0])
            + '" data-lat="' + discAttr(d.lat) + '" data-lon="' + discAttr(d.lon) + '">'
            + '<div class="disc-dd-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></div>'
            + '<div><div class="disc-dd-title">' + p[0] + '</div>'
            + '<div class="disc-dd-sub">' + (p.slice(1,3).join(',').trim()) + '</div></div></div>';
      }).join('');
      document.getElementById('discoverLocDropdown').hidden = false;
      discoverDDOpen = true;
    });
}, 400);
  }

  /* ---------- Talking to the Worker ----------
 The query building, the quality gate, the OSM parsing and the failure
 classification all used to live here. They now live in src/trails.js and run
 in the Worker, which means the browser never sees an Overpass payload and
 never has to know how Overpass reports a timeout. What stays here is what has
 to: ranking from the user's exact coordinates, and the view. */

  function discoverTierFor(miles) {
return miles <= DISCOVER_TIERS.BASE ? DISCOVER_TIERS.BASE : DISCOVER_TIERS.EXPANDED;
  }

  /* Same 2dp cell the Worker caches on. */
  function discoverCacheKey(lat, lon) {
return lat.toFixed(2) + ',' + lon.toFixed(2);
  }

  /* A tier answers every radius up to its own size, so the 100-mile disc
 covers the whole slider and the 50-mile disc covers the bottom half. */
  function discoverCacheCovers(lat, lon, miles) {
return !!discoverCache
  && discoverCache.key === discoverCacheKey(lat, lon)
  && discoverCache.tier >= discoverTierFor(miles);
  }

  /* Marks a failure as a *server* condition rather than an empty region, so
 the renderer can say so and withhold the Expand action. */
  function discoverErr(kind, detail) {
const e = new Error(detail || kind);
e.discoverKind = kind;
return e;
  }

  /* One call to our own origin. The Worker answers with a typed envelope, so
 there is exactly one thing to read — `status` — instead of the four separate
 Overpass failure shapes the browser used to unpick. `empty` is a real answer
 about the world; `timeout` and `busy` are statements about the service and
 must never be shown as "no trails here". */
  function discoverFetch(lat, lon, tier) {
const url = '/api/nearby-trails?lat=' + encodeURIComponent(lat)
  + '&lon=' + encodeURIComponent(lon) + '&tier=' + encodeURIComponent(tier);
return fetch(url, { headers: { accept: 'application/json' } })
  .then(res => res.text().then(text => {
    let body = null;
    try { body = JSON.parse(text); } catch (e) { body = null; }
    if (body && body.status === 'timeout') throw discoverErr('timeout', body.reason);
    if (body && body.status === 'busy')    throw discoverErr('busy', body.reason);
    if (!res.ok || !body) throw discoverErr('busy', 'trail service returned ' + res.status);
    return body;
  }))
  .catch(err => {
    if (err && err.discoverKind) throw err;
    throw discoverErr('network', err && err.message);
  });
  }

  /* Cache-or-fetch for one location at one tier. */
  function discoverEnsureData(lat, lon, tier) {
const key = discoverCacheKey(lat, lon);
if (discoverCache && discoverCache.key === key && discoverCache.tier >= tier) {
  return Promise.resolve(discoverCache.items);
}
const flightKey = key + '/' + tier;
if (discoverInFlight && discoverInFlight.key === flightKey) return discoverInFlight.promise;

const promise = discoverFetch(lat, lon, tier).then(body => {
  const items = body.items || [];
  // A wider tier supersedes a narrower one for the same place.
  if (!discoverCache || discoverCache.key !== key || tier >= discoverCache.tier) {
    discoverCache = { key: key, tier: tier, lat: lat, lon: lon, items: items };
  }
  discoverInFlight = null;
  return items;
}).catch(err => {
  discoverInFlight = null;
  throw err;
});
discoverInFlight = { key: flightKey, promise: promise };
return promise;
  }

  /* Nearest-first within the radius, measured from the caller's exact
 coordinates rather than the rounded cache cell. The Worker already collapsed
 OSM's segment chains — one trail is modelled as many named ways sharing a
 name — so there is nothing left to de-duplicate here; sorting a deduped set
 and cutting it at a radius is what makes each radius a prefix-extension of
 the one below it. */
  function discoverRank(items, lat, lon, miles) {
const near = [];
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const d = discoverDistNum(lat, lon, it.lat, it.lon);
  if (d <= miles) near.push({ item: it, dist: d });
}
near.sort(function (a, b) { return a.dist - b.dist; });
return near.map(function (r) { return r.item; });
  }

  /* Reveal the results view. Runs once per search, not per radius change. */
  function discoverShowResultsView(resetPills) {
const home  = document.getElementById('discoverHomeContent');
const res   = document.getElementById('discoverResultsBlock');
const pills = document.getElementById('discoverPillRow');
if (home) home.hidden = true;
if (res)  res.hidden  = false;
if (pills) pills.hidden = false;
// Reset the terrain filter when the *location* changes. Carrying it over
// would apply a filter to a fresh result set and could land the user on
// "no results match" immediately after searching a new place, which reads
// as a failed search rather than an active filter. A radius change is not
// a new place, so the pill survives one — see fetchDiscoverTrails.
if (resetPills) {
  discoverActiveTerrain = 'all';
  document.querySelectorAll('.disc-pill').forEach(p => {
    const isAll = p.dataset.terrain === 'all';
    p.classList.toggle('is-active', isAll);
    p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
  });
}
// Reveal the map column on first search (it's hidden by default so the
// dashboard isn't dominated by the map until the user opts in via
// Nearby / city pick / Search Trails). Leaflet needs invalidateSize()
// because the map was instantiated while display:none.
const mapWrap = document.getElementById('discoverMapWrap');
const grid    = document.getElementById('discoverGrid');
if (mapWrap && mapWrap.style.display === 'none') {
  mapWrap.style.display = '';
  // Class, not an inline style: the width rules live in CSS so the
  // media queries can stack the map under the results on small screens.
  if (grid) grid.classList.add('has-map');
}
if (discoverMap) setTimeout(() => discoverMap.invalidateSize(), 0);
  }

  /* Recentre the map and redraw the "you are here" pin and the radius ring.
 Called on every radius change too, so the ring tracks the slider. */
  function discoverPositionMap(lat, lon, miles) {
if (!discoverMap) return;
discoverMap.setView([lat, lon], miles > 70 ? 8 : miles > 35 ? 9 : miles > 20 ? 10 : 11);
discoverMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) discoverMap.removeLayer(l); });
const uIcon = L.divIcon({ html: '<div style="background:#2d6a4f;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">YOU</div>', className: '', iconSize: [30,30], iconAnchor: [15,15] });
L.marker([lat, lon], { icon: uIcon }).addTo(discoverMap).bindPopup('<b>' + (discoverPlaceLabel || 'Your Location') + '</b>');
L.circle([lat, lon], { radius: miles * DISCOVER_MI_M, color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4' }).addTo(discoverMap);
  }

  /* The hot path: everything a radius change does. No network. */
  function discoverRenderFromCache(lat, lon, miles) {
if (!discoverCache) return;
const ranked  = discoverRank(discoverCache.items, lat, lon, miles);
const shown   = ranked.slice(0, DISCOVER_SHOW_N);
discoverPositionMap(lat, lon, miles);
renderDiscoverCards(shown, lat, lon);
renderDiscoverPins(shown, lat, lon);
applyDiscoverPillFilter();

const count = document.getElementById('discoverResCount');
if (!count) return;
const where = discoverPlaceLabel || 'your location';
if (!ranked.length) {
  count.textContent = 'No trails within ' + miles + ' miles of ' + where;
  return;
}
// ranked.length is the honest total for the radius; the grid shows the
// nearest DISCOVER_SHOW_N of them.
count.innerHTML = '<strong style="color:#111;">' + ranked.length + ' trail'
  + (ranked.length === 1 ? '' : 's') + '</strong> within <strong style="color:#111;">'
  + miles + ' miles</strong> of ' + discAttr(where)
  + (ranked.length > shown.length ? ' · showing nearest ' + shown.length : '');
  }

  /* Shown when the slider passes 50 and the wider disc has not been fetched.
 Deliberately a prompt and not a fetch: the expanded search is 13-18 MB and
 40-77 s upstream on a cold cache, which is not something to start because a
 thumb moved. */
  function discoverShowExpandPrompt(miles) {
const grid = document.getElementById('discoverTrailResults');
if (grid) {
  grid.innerHTML = '<div class="disc-state">'
    + '<div class="disc-state__icon">🧭</div>'
    + '<h3 class="disc-state__title">Search further out?</h3>'
    + '<p class="disc-state__body">Results so far cover ' + DISCOVER_TIERS.BASE
    + ' miles. Going to ' + miles + ' searches a wider area — it can take up to a minute the first time.</p>'
    + '<button class="disc-state__action" data-disc-act="expand-search">Search up to '
    + DISCOVER_MAX_MI + ' miles</button></div>';
}
const count = document.getElementById('discoverResCount');
if (count) count.textContent = 'Showing trails within ' + DISCOVER_TIERS.BASE
  + ' miles — expand to reach ' + miles;
discoverPositionMap(discoverUserLat, discoverUserLon, miles);
  }

  /* The explicit opt-in. Only this and a fresh search may start a request. */
  function discoverExpandSearch() {
if (discoverUserLat == null) return;
discoverLoadTier(discoverUserLat, discoverUserLon, discoverRadiusMi, DISCOVER_TIERS.EXPANDED, false);
  }

  function discoverLoadingHTML(tier) {
return tier === DISCOVER_TIERS.EXPANDED
  ? 'Searching up to ' + DISCOVER_MAX_MI + ' miles — this can take up to a minute…'
  : 'Searching…';
  }

  /* Shared miss path for both tiers. */
  function discoverLoadTier(lat, lon, miles, tier, resetPills) {
showDiscoverSkeletons();
const count = document.getElementById('discoverResCount');
if (count) count.textContent = discoverLoadingHTML(tier);
const key = discoverCacheKey(lat, lon);

discoverEnsureData(lat, lon, tier)
  .then(() => {
    // Guard against a slow response for a location the user has left.
    if (!discoverCache || discoverCache.key !== key) return;
    const atLat = discoverUserLat != null ? discoverUserLat : lat;
    const atLon = discoverUserLon != null ? discoverUserLon : lon;
    // The slider may have moved past this tier while the request was in
    // flight. Ask rather than chaining straight into a second, slower query.
    if (discoverCacheCovers(atLat, atLon, discoverRadiusMi)) {
      discoverRenderFromCache(atLat, atLon, discoverRadiusMi);
    } else {
      discoverShowExpandPrompt(discoverRadiusMi);
    }
    // A retry that worked: the user was on the Try again button, which has
    // just been replaced. Send them to the line that says what happened
    // rather than dropping focus to the top of the document.
    if (discoverRetryPending) {
      discoverRetryPending = false;
      if (count && count.focus) count.focus();
    }
  })
  .catch(err => {
    const kind = err && err.discoverKind ? err.discoverKind : 'network';
    const grid = document.getElementById('discoverTrailResults');
    if (grid) grid.innerHTML = discoverErrorHTML(kind);
    if (count) count.textContent = DISCOVER_ERR_COUNT[kind] || DISCOVER_ERR_COUNT.network;
    discoverRetryPending = false;
    /* Busy only. The results the user was reading have just been replaced by
       a message and two buttons; leaving focus on <body> means a keyboard or
       screen-reader user has to hunt for the way out. Timeout and network
       keep their existing behaviour untouched. */
    if (kind === 'busy' && grid) {
      const primary = grid.querySelector('[data-disc-act="retry"]');
      if (primary && primary.focus) primary.focus();
    }
  });
  }

  /* Entry point for every search. Never fetches the expanded tier on its own —
 a fresh search always starts from the base disc, and going wider is the
 user's call. */
  function fetchDiscoverTrails(lat, lon, miles, opts) {
const key = discoverCacheKey(lat, lon);
const force = !!(opts && opts.force);
if (force && discoverCache && discoverCache.key === key) discoverCache = null;
const covered = discoverCacheCovers(lat, lon, miles);

discoverShowResultsView(!covered);
discoverPositionMap(lat, lon, miles);

if (covered) { discoverRenderFromCache(lat, lon, miles); return; }
// Slider is already past the base tier and we have base data for this spot:
// ask before spending a minute on the wider disc.
if (discoverCache && discoverCache.key === key
    && discoverTierFor(miles) > discoverCache.tier) {
  discoverShowExpandPrompt(miles);
  return;
}
// Always start from the base disc, whatever the slider says. If it is set
// beyond 50 the prompt appears when this lands, from the one decision point
// in discoverLoadTier's success path.
discoverLoadTier(lat, lon, miles, DISCOVER_TIERS.BASE, true);
  }

  function discoverTerrain(name) {
const n = name.toLowerCase();
if (/mountain|peak|summit|hill|ridge|bluff/.test(n)) return { t: 'Mountain', b: 'rgba(37,99,235,.85)', p: 'mountain' };
if (/beach|shore|lake|river|creek|falls|bay/.test(n))  return { t: 'Lake / Water', b: 'rgba(8,145,178,.85)', p: 'lake' };
if (/desert|canyon|mesa|butte|rock|sand/.test(n))      return { t: 'Desert', b: 'rgba(234,88,12,.85)', p: 'desert' };
return { t: 'Forest', b: 'rgba(45,106,79,.88)', p: 'forest' };
  }
  /* Haversine, miles. Split from discoverDist so ranking can compare numbers
 rather than the 1-dp strings the cards print — sorting on those would put
 "10.0" before "9.8". */
  function discoverDistNum(a, b, c, d) {
const R = 3958.8, dA = (c-a)*Math.PI/180, dB = (d-b)*Math.PI/180;
const x = Math.sin(dA/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dB/2)**2;
return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }
  function discoverDist(a, b, c, d) {
return discoverDistNum(a, b, c, d).toFixed(1);
  }

  function renderDiscoverCards(trails, ulat, ulon) {
const g = document.getElementById('discoverTrailResults');
if (!trails.length) { g.innerHTML = discoverEmptyHTML(discoverRadiusMi); return; }
g.innerHTML = trails.map((t) => {
  const { t: ter, b: bc, p: ph } = discoverTerrain(t.name);
  const d = discoverDist(ulat, ulon, t.lat, t.lon);
  const tint = DISCOVER_TERRAIN_TINT[ph] || DISCOVER_TERRAIN_TINT.forest;
  // Classed rather than inline-styled, so the card shares .disc-card's radius
  // token and its hover lives in CSS instead of two onmouseover handlers.
  // Only the two terrain-derived colours stay inline — they are data.
  return `<div class="disc-result" data-terrain="${ter}" data-disc-act="zoom" data-lat="${t.lat}" data-lon="${t.lon}">
    <div class="disc-result__media" style="background:${tint.bg}" aria-hidden="true">
      <span class="disc-result__glyph">${tint.glyph}</span>
      <span class="disc-result__badge" style="background:${bc}">${ter}</span>
    </div>
    <div class="disc-result__body">
      <div class="disc-result__name">${t.name}</div>
      <div class="disc-result__meta">${t.kind} · ${d} miles away</div>
      <button class="disc-result__cta" data-disc-act="plan" data-trail-name="${discAttr(t.name)}" data-trail-terrain="${discAttr(ter)}" data-trail-lat="${t.lat||''}" data-trail-lon="${t.lon||''}">Plan This Trip →</button>
    </div>
  </div>`;
}).join('');
  }

  function renderDiscoverPins(trails, ulat, ulon) {
const ico = L.divIcon({ html: '<div style="background:#2d6a4f;border-radius:50% 50% 50% 0;width:22px;height:22px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>', className: '', iconSize: [22,22], iconAnchor: [11,22] });
trails.forEach(t => {
  if (!t.lat || !t.lon) return;
  const d = discoverDist(ulat, ulon, t.lat, t.lon);
  // Same data-trail-* contract as the result card's CTA, so both routes into
  // openPlanTripModal go through the one 'plan' action below. Leaflet builds
  // the popup inside #discoverMap, which is inside the delegation root, and
  // its disableClickPropagation only stops mousedown/touchstart/dblclick —
  // click still bubbles — so the delegated listener sees this link.
  // No terrain here, matching what this popup passed before; openPlanTripModal
  // guards on `if (o.terrain)`, so an absent attribute is the same as before.
  L.marker([t.lat, t.lon], { icon: ico }).addTo(discoverMap)
    .bindPopup('<b>' + t.name + '</b><br>' + d + ' miles away<br>'
      + '<a href="#" data-disc-act="plan" data-trail-name="' + discAttr(t.name) + '"'
      + ' data-trail-lat="' + discAttr(t.lat) + '" data-trail-lon="' + discAttr(t.lon) + '"'
      + ' style="color:#2d6a4f;font-weight:600;">Plan This Trip →</a>');
});
  }

  function discoverZoom(lat, lon) { discoverMap.setView([lat, lon], 14); }

  /* The genuinely-empty state: we hold a complete 50-mile payload for this
 location and nothing in it falls inside the current radius. Offering to
 widen is honest here precisely because it costs no new query — the wider
 answer is already in memory. It is *not* offered on the server-error states
 below, where widening would only make a query that already failed heavier. */
  function discoverEmptyHTML(m) {
// Same shape as .empty-state on the trips grid — big glyph, Inter heading,
// muted body, pill action — so the two empty states in the app match.
// Only offer to widen as far as the cached tier already reaches. Beyond
// that the honest control is the expanded-search prompt, which says what it
// will cost, not a button that quietly starts a minute-long query.
const reach = discoverCache ? discoverCache.tier : DISCOVER_TIERS.BASE;
const wider = Math.min(m + 10, reach);
return '<div class="disc-state">'
  + '<div class="disc-state__icon">🌿</div>'
  + '<h3 class="disc-state__title">No trails found within ' + m + ' miles</h3>'
  + '<p class="disc-state__body">Try a larger radius or a different location</p>'
  + (wider > m
      ? '<button class="disc-state__action" data-disc-act="expand">+ Expand to ' + wider + ' miles</button>'
      : '')
  + '</div>';
  }

  /* Server conditions, kept distinct from "no trails here" — the whole point
 of the classification in discoverFetch(). Every one of these offers Try
 again and none offers Expand: the search never completed, so there is no
 evidence about what is or isn't nearby, and a wider radius would make the
 query that just failed strictly more expensive. */
  const DISCOVER_ERR_STATE = {
timeout: { icon: '⏱️', title: 'Trail search timed out',
           body: 'The map service took too long to answer. This usually clears in a moment.' },
busy:    { icon: '⏳', title: 'Trail service is busy',
           body: 'Map data is rate-limited right now. Recently searched places still load instantly.' },
network: { icon: '📡', title: 'Could not reach trail search',
           body: 'Check your connection and try again.' }
  };
  const DISCOVER_ERR_COUNT = {
timeout: 'Search timed out — not a report about what is nearby',
busy:    'Trail service busy — this is not a report about what\u2019s nearby',
network: 'Could not load trails — check connection'
  };
  /* Which state the picker currently holds, if any. Read from the control
 itself rather than a parallel variable, so it cannot disagree with what the
 user can see selected. */
  function discoverSelectedStateCode() {
const sel = document.getElementById('discoverStateSelect');
return sel && sel.value ? sel.value : '';
  }

  function discoverErrorHTML(kind) {
const s = DISCOVER_ERR_STATE[kind] || DISCOVER_ERR_STATE.network;
const head = '<div class="disc-state">'
  + '<div class="disc-state__icon">' + s.icon + '</div>'
  + '<h3 class="disc-state__title">' + s.title + '</h3>'
  + '<p class="disc-state__body">' + s.body + '</p>';
const retry = '<button class="disc-state__action" data-disc-act="retry">Try again</button>';

/* Only `busy` gets a second way out, and only because only `busy` earns
   one: when the upstream is throttling, retrying is the action least
   likely to work — four consecutive busy responses were observed while
   verifying the deploy. A timeout usually does clear on the next attempt,
   and a network failure is not something a different search fixes, so both
   of those keep exactly the markup they had. */
if (kind !== 'busy') return head + retry + '</div>';

const label = discoverSelectedStateCode() ? 'Try another state' : 'Choose a state';
return head
  + '<div class="disc-state__actions">'
  + retry
  + '<button class="disc-state__action disc-state__action--ghost" data-disc-act="state-picker">'
  + label + '</button>'
  + '</div></div>';
  }

  /* Secondary recovery: put the user back on the state picker rather than
 leaving retry as the only door. Deliberately does not clear the current
 selection — someone who picked Montana and hit a busy service is choosing a
 neighbour, not starting over.

 stopPropagation matters here: a document-level listener closes this dropdown
 on any outside click, and the delegated handler on #discoverSection runs
 first, so without it the dropdown would open and shut in the same click —
 the same reason toggleLocDropdown stops propagation. */
  function discoverOpenStatePicker(e) {
if (e) e.stopPropagation();
closeDiscoverRP();
discoverDDOpen = true;
const dd = document.getElementById('discoverLocDropdown');
if (dd) dd.hidden = false;

// Focus first with preventScroll, then scroll deliberately: focusing an
// off-screen control otherwise jumps the page and cancels a smooth scroll.
const sel = document.getElementById('discoverStateSelect');
if (sel) {
  try { sel.focus({ preventScroll: true }); } catch (err) { sel.focus(); }
}
const field = document.getElementById('discoverLocField');
if (field && field.scrollIntoView) {
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
  }

  /* Re-runs the search for the current location, dropping any cached payload
 so a retry after a failure genuinely re-queries. */
  function discoverRetry() {
if (discoverUserLat == null) return;
discoverRetryPending = true;
// Retry the tier that failed, not the base one — a user who asked for 100
// miles and hit a busy service should not be silently downgraded to 50.
const tier = discoverTierFor(discoverRadiusMi);
discoverCache = null;
discoverLoadTier(discoverUserLat, discoverUserLon, discoverRadiusMi, tier, false);
  }

  /* Widening now re-filters the cached 50-mile payload. No network. */
  function discoverExpandRadius() {
const reach = discoverCache ? discoverCache.tier : DISCOVER_TIERS.BASE;
discoverRadiusMi = Math.min(discoverRadiusMi + 10, reach);
const slider = document.getElementById('discoverRadiusSlider');
if (slider) slider.value = discoverRadiusMi;
updateDiscoverRadius(discoverRadiusMi);
  }

  function showDiscoverSkeletons() {
document.getElementById('discoverTrailResults').innerHTML = Array(6).fill(0).map(() =>
  '<div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,.07);">'
  + '<div style="height:190px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:discoverShimmer 1.4s ease-in-out infinite;"></div>'
  + '<div style="padding:14px;display:flex;flex-direction:column;gap:8px;">'
  + '<div style="height:11px;width:35%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:discoverShimmer 1.4s ease-in-out infinite;border-radius:4px;"></div>'
  + '<div style="height:15px;width:85%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:discoverShimmer 1.4s ease-in-out infinite;border-radius:4px;"></div>'
  + '<div style="height:11px;width:55%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:discoverShimmer 1.4s ease-in-out infinite;border-radius:4px;"></div>'
  + '<div style="height:33px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:discoverShimmer 1.4s ease-in-out infinite;border-radius:8px;margin-top:4px;"></div>'
  + '</div></div>'
).join('');
  }

  /* ===== Event delegation =====
 Every Discover control is driven by a data-disc-act attribute read by one
 listener on #discoverSection, rather than by an inline onclick.

 The root is the section, not document, for two reasons. It is in the markup
 at parse time and wraps every surface this file generates later — the five
 carousels, the three link lists, the Nominatim autocomplete rows, the result
 cards, the empty state and Leaflet's popups — so rows created after load are
 live without rebinding anything. And being a descendant of document, it runs
 *before* the document-level click handler further up that closes the dropdown
 and popover. The two toggles depend on that ordering: they call
 stopPropagation to stop the close handler undoing the open, which is what the
 inline handlers did by the same mechanism.

 Only the innermost matching element acts. That is what keeps a click on a
 result card's "Plan This Trip" button from also firing the card's zoom —
 the job the CTA's inline event.stopPropagation() used to do. */
  const DISCOVER_ACTIONS = {
'loc-toggle':    (el, e) => toggleLocDropdown(e),
'radius-toggle': (el, e) => toggleRadiusPopover(e),
'radius-apply':  ()      => applyDiscoverRadius(),
'search':        ()      => triggerDiscoverSearch(),
'nearby':        ()      => useDiscoverNearby(),
'pill':          (el)    => setDiscoverPill(el),
'home':          ()      => discoverHomeShow(),
'expand':        ()      => discoverExpandRadius(),
'expand-search': ()      => discoverExpandSearch(),
'retry':         ()      => discoverRetry(),
'state-picker':  (el, e) => discoverOpenStatePicker(e),
'pick-city':     (el)    => discoverPickCity(el.dataset.name, parseFloat(el.dataset.lat), parseFloat(el.dataset.lon)),
'zoom':          (el)    => discoverZoom(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon)),
'plan':          (el, e) => {
  e.preventDefault();
  openPlanTripModal({
    name:    el.dataset.trailName,
    terrain: el.dataset.trailTerrain,
    lat:     el.dataset.trailLat,
    lon:     el.dataset.trailLon,
  });
},
  };

  (function () {
const root = document.getElementById('discoverSection');
if (!root) return;
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-disc-act]');
  if (!el || !root.contains(el)) return;
  const run = DISCOVER_ACTIONS[el.dataset.discAct];
  if (run) run(el, e);
});
  })();

  // ===== More to Discover toggle =====
  // Shows/hides the four category sections (Forest / Mountain / Lake
  // & Waterfall / Desert) as a single collapsible region. The discover
  // renderer still populates every row regardless of visibility, so no
  // new network requests are issued by toggling — we just flip a class.
  (function () {
const btn    = document.getElementById('disc-more-toggle');
const region = document.getElementById('disc-more-region');
if (!btn || !region) return;
const label  = btn.querySelector('.disc-more-label');

// Keep the collapsed region out of the tab order and off the accessibility
// tree. The CSS does this too via visibility, but `inert` is the explicit
// statement of intent and also swallows pointer events, so a card that is
// clipped rather than fully hidden still cannot be clicked. Set on load
// because the markup ships collapsed.
const syncInert = (open) => { region.inert = !open; };
syncInert(region.classList.contains('is-open'));

btn.addEventListener('click', () => {
  const open = region.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (label) label.textContent = open ? 'Less to Discover' : 'More to Discover';
  syncInert(open);
});
  })();

  // ===== Browse by destination toggle (phones only) =====
  // Same collapse mechanism as the region above, but only live at 640 and
  // below, where the three link columns stack into one and cost about a fifth
  // of the mobile page. Above 640 the CSS holds the region open and removes
  // the button from the layout.
  //
  // Deliberately no `inert` here, unlike More to Discover, and not an
  // oversight. That region collapses at every width, so a flag set on click is
  // always right. This one is width-conditional: a flag set on a phone would
  // still be set after a resize past 640, where the CSS reopens the region —
  // leaving a visible list that cannot be focused or clicked. Keeping it
  // correct would mean reacting to a matchMedia change event, and that is
  // exactly the failure mode found while testing this: the query's *value*
  // updates on a resize but the change event does not always arrive, so the
  // flag can go stale with no second chance to clear it.
  //
  // The collapsed rule already sets `visibility: hidden`, which takes the
  // subtree out of the accessibility tree and out of the focus order. It lives
  // in the media query, so it is width-correct by construction and needs no JS
  // at all. That is the whole reason the flag can be dropped rather than
  // carefully maintained.
  (function () {
const btn    = document.getElementById('disc-links-toggle');
const region = document.getElementById('disc-links-region');
if (!btn || !region) return;
const label  = btn.querySelector('.disc-more-label');

btn.addEventListener('click', () => {
  const open = region.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (label) {
    label.textContent = open ? 'Fewer destinations' : 'Browse all destinations';
  }
});
  })();
