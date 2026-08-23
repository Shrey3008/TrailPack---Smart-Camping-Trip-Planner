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
  let discoverDDOpen = false, discoverRPOpen = false;
  let discoverDebT = null;

  /* ---------- Single-query-then-filter ----------
 Discover fetches Overpass exactly once per location, always at the slider's
 maximum radius, and every radius change after that filters the cached set in
 memory. The old code re-queried on every Apply, which cost a multi-megabyte
 round trip per drag and — because Overpass has no distance ordering — handed
 back a *different* arbitrary 30 elements each time, so widening the radius
 swapped the results rather than extending them.

 DISCOVER_FETCH_MI must stay >= the slider's max (dashboard.html sets max=50).
 Fetching at the max is what makes the cache complete: any radius the slider
 can select is a subset of what we already hold. */
  const DISCOVER_FETCH_MI = 50;   // radius we always query Overpass at
  const DISCOVER_SHOW_N   = 12;   // result cards rendered
  const DISCOVER_MI_M     = 1609.34;

  /* Cached Overpass payload: { key, lat, lon, items:[{id,type,name,kind,lat,lon}] }.
 Keyed by lat/lon rounded to 2dp (~0.7 mi). A recentre inside one cache cell
 reuses the payload and re-sorts from the caller's exact coordinates, so the
 only cost of the rounding is up to ~0.7 mi of slack at the outer edge of the
 50-mile disc — invisible at every radius the slider can reach. */
  let discoverCache = null;
  let discoverInFlight = null;
  // Terrain currently selected in the filter pill row ('all' = no filter).
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

  function renderDiscoverHome() {
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
 fetching at DISCOVER_FETCH_MI up front. With no cache yet (the slider is
 reachable before the first search) this only moves the labels. */
  function updateDiscoverRadius(v) {
discoverRadiusMi = parseInt(v);
document.getElementById('discoverRadiusDisplay').textContent = v + ' miles';
document.getElementById('discoverRadiusBig').textContent = v + ' miles';
if (discoverCache && discoverUserLat != null) {
  discoverRenderFromCache(discoverUserLat, discoverUserLon, discoverRadiusMi);
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
discoverUserLat = lat; discoverUserLon = lon;
closeDiscoverDD();
fetchDiscoverTrails(lat, lon, discoverRadiusMi);
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

  /* ---------- Overpass query ----------
 Deliberately minimal. Every tag filter added to the path selector was
 measured against the live API and cost 4-6x the runtime for a modest saving
 in bytes: the unfiltered union returns ~6.9 MB in ~11-20 s from Denver, the
 same union with `["bicycle"!="designated"]["foot"!="no"]` took 39.6 s, and
 with surface/access regexes on top, 66 s. Overpass has to scan tags to
 evaluate those; we already have to scan the payload client-side to sort it by
 distance, so the quality gate lives in discoverIsUrbanPath() instead, where
 it is free and can be tuned without a round trip.

 Two things are load-bearing about the `out` line. There is no `>` recursion
 and no `out skel qt`: `>` walks the *whole* matched set rather than the
 printed elements and was pulling 200,220 elements / 18.8 MB at 50 miles to
 render twelve cards. And there is no element limit, because Overpass sorts by
 type-then-id and has no notion of distance — asking it for 30 gives the
 lowest-id 30, not the nearest 30, which is why widening the radius used to
 replace the results with a different arbitrary set. We take the whole disc
 and rank it ourselves.

 leisure=park is gone. It was the source of Civic Center Park, 17th Street
 Plaza and Pioneer Monument Park topping a hiking app's "nearest trails". */
  function discoverQuery(lat, lon, miles) {
const m = Math.round(miles * DISCOVER_MI_M);
const at = '(around:' + m + ',' + lat + ',' + lon + ');';
return '[out:json][timeout:' + discoverTimeoutFor(miles) + '];('
  + 'relation["route"="hiking"]["name"]' + at
  + 'way["highway"="path"]["name"]' + at
  + 'way["leisure"="nature_reserve"]["name"]' + at
  + 'relation["leisure"="nature_reserve"]["name"]' + at
  + 'node["tourism"="camp_site"]["name"]' + at
  + ');out center;';
  }

  /* The old query hardcoded [timeout:25] at every radius, while 50-mile runs
 measured 11-29 s server-side and drifted higher under load — so the widest
 searches were the ones most likely to trip the timeout, and the timeout was
 being reported to the user as "no trails found". Scaling with the radius
 gives the wide searches room. 180 s is Overpass's own default ceiling. */
  function discoverTimeoutFor(miles) {
return Math.min(180, Math.max(25, Math.round(miles * 1.8)));
  }

  /* Two-decimal rounding, ~0.7 mi per cell. See discoverCache. */
  function discoverCacheKey(lat, lon) {
return lat.toFixed(2) + ',' + lon.toFixed(2);
  }

  const DISCOVER_PAVED = /^(paved|concrete|asphalt|paving_stones|wood|metal|concrete:plates)$/i;

  /* The urban gate, applied only to highway=path ways — nature reserves,
 campsites and named hiking routes are destinations by definition and pass
 through untouched.

 Dropping leisure=park alone was not enough: downtown Denver's nearest
 highway=path ways are Larimer Way, 20th Street Multi-Use Path, Mile High
 Walk and Sports Walk, all of which carry one of the four signals below.
 Bike-park features (Slopestyle XS, Pump track) are caught by foot=no.

 The gate is per *segment*, and OSM splits a trail into many ways with
 inconsistent tagging, so a trail survives if any one of its segments does —
 which is why Sloan's Lake Trail still appears despite most of its segments
 being surface=concrete. That forgiveness is intentional: rejecting a whole
 named trail on one badly tagged segment loses real destinations. */
  function discoverIsUrbanPath(t) {
if (t.highway !== 'path') return false;
if (t.surface && DISCOVER_PAVED.test(t.surface)) return true;
if (t.bicycle === 'designated') return true;
if (t.foot === 'no') return true;
if (t.access === 'private' || t.access === 'no') return true;
return false;
  }

  function discoverKind(t) {
if (t.route === 'hiking')            return 'hiking route';
if (t.leisure === 'nature_reserve')  return 'nature reserve';
if (t.tourism === 'camp_site')       return 'campsite';
return 'trail';
  }

  /* Overpass gives ways and relations a bbox centre under `center` (that is
 what `out center` buys) and nodes a plain lat/lon. */
  function discoverParse(data) {
const items = [];
(data.elements || []).forEach(e => {
  const t = e.tags || {};
  if (!t.name || discoverIsUrbanPath(t)) return;
  const la = e.lat != null ? e.lat : (e.center && e.center.lat);
  const lo = e.lon != null ? e.lon : (e.center && e.center.lon);
  if (la == null || lo == null) return;
  items.push({ id: e.id, type: e.type, name: t.name, kind: discoverKind(t), lat: la, lon: lo });
});
return items;
  }

  /* Nearest-first, then de-duplicated by name keeping the closest instance.
 The dedupe is not cosmetic: OSM models a trail as a chain of separate named
 ways, and 52% of the raw rows around Denver are repeat segments of a trail
 already in the list. */
  function discoverRank(items, lat, lon, miles) {
const near = [];
items.forEach(it => {
  const d = discoverDistNum(lat, lon, it.lat, it.lon);
  if (d <= miles) near.push({ item: it, dist: d });
});
near.sort((a, b) => a.dist - b.dist);
const seen = {}, out = [];
near.forEach(r => {
  const k = r.item.name.toLowerCase();
  if (seen[k]) return;
  seen[k] = 1;
  out.push(r.item);
});
return out;
  }

  /* Marks a failure as a *server* condition rather than an empty region, so
 the renderer can say so and withhold the Expand action. */
  function discoverErr(kind, detail) {
const e = new Error(detail || kind);
e.discoverKind = kind;
return e;
  }

  function discoverFetch(lat, lon) {
const body = 'data=' + encodeURIComponent(discoverQuery(lat, lon, DISCOVER_FETCH_MI));
return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body })
  .then(r => {
    // 429 is the rate limiter (overpass-api.de allows 2 slots per IP);
    // 504 comes back as an HTML page from the dispatcher when the server is
    // too busy or the query hit a resource ceiling. Neither is JSON.
    if (r.status === 429) throw discoverErr('busy', 'rate limited');
    if (!r.ok) throw discoverErr('busy', 'HTTP ' + r.status);
    return r.text();
  })
  .then(txt => {
    let data;
    try { data = JSON.parse(txt); }
    catch (e) { throw discoverErr('busy', 'non-JSON response'); }
    /* The signature this whole branch exists for: a query that ran out of
       time or memory returns HTTP 200 with `elements: []` and a `remark`
       string — byte-for-byte the shape of a genuinely empty area apart from
       that one field. Verified against the live API. Reading only
       elements.length is what made the old code report a server timeout as
       "No trails found within 25 miles" and offer to widen the radius, which
       makes the next query heavier and more likely to time out again. */
    if (data.remark) throw discoverErr('timeout', data.remark);
    return discoverParse(data);
  });
  }

  /* Cache-or-fetch. Resolves with the full 50-mile item list for this cell. */
  function discoverEnsureData(lat, lon) {
const key = discoverCacheKey(lat, lon);
if (discoverCache && discoverCache.key === key) return Promise.resolve(discoverCache.items);
if (discoverInFlight && discoverInFlight.key === key) return discoverInFlight.promise;
const promise = discoverFetch(lat, lon).then(items => {
  discoverCache = { key: key, lat: lat, lon: lon, items: items };
  discoverInFlight = null;
  return items;
}).catch(err => {
  discoverInFlight = null;
  throw err;
});
discoverInFlight = { key: key, promise: promise };
return promise;
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
discoverMap.setView([lat, lon], miles > 35 ? 9 : miles > 20 ? 10 : 11);
discoverMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) discoverMap.removeLayer(l); });
const uIcon = L.divIcon({ html: '<div style="background:#2d6a4f;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">YOU</div>', className: '', iconSize: [30,30], iconAnchor: [15,15] });
L.marker([lat, lon], { icon: uIcon }).addTo(discoverMap).bindPopup('<b>Your Location</b>');
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

const locEl = document.getElementById('discoverLocInput');
const loc   = locEl ? locEl.value.replace('📍 ', '') : '';
const count = document.getElementById('discoverResCount');
if (!count) return;
if (!ranked.length) {
  count.textContent = 'No trails within ' + miles + ' miles of ' + loc;
  return;
}
// ranked.length is the honest total for the radius; the grid shows the
// nearest DISCOVER_SHOW_N of them.
count.innerHTML = '<strong style="color:#111;">' + ranked.length + ' trail'
  + (ranked.length === 1 ? '' : 's') + '</strong> within <strong style="color:#111;">'
  + miles + ' miles</strong> of ' + loc
  + (ranked.length > shown.length ? ' · showing nearest ' + shown.length : '');
  }

  /* Entry point for every search. Fetches at most once per location cell;
 a radius change on an already-loaded location never reaches here. */
  function fetchDiscoverTrails(lat, lon, miles, opts) {
const key = discoverCacheKey(lat, lon);
const force = !!(opts && opts.force);
if (force && discoverCache && discoverCache.key === key) discoverCache = null;
const cached = !!(discoverCache && discoverCache.key === key);

discoverShowResultsView(!cached);
discoverPositionMap(lat, lon, miles);
if (cached) { discoverRenderFromCache(lat, lon, miles); return; }

showDiscoverSkeletons();
const count = document.getElementById('discoverResCount');
if (count) count.textContent = 'Searching…';

discoverEnsureData(lat, lon)
  .then(() => {
    // Guard against a slow response for a location the user has since
    // moved away from.
    if (!discoverCache || discoverCache.key !== key) return;
    discoverRenderFromCache(discoverUserLat != null ? discoverUserLat : lat,
                            discoverUserLon != null ? discoverUserLon : lon,
                            discoverRadiusMi);
  })
  .catch(err => {
    const kind = err && err.discoverKind ? err.discoverKind : 'network';
    const grid = document.getElementById('discoverTrailResults');
    if (grid) grid.innerHTML = discoverErrorHTML(kind);
    if (count) count.textContent = DISCOVER_ERR_COUNT[kind] || DISCOVER_ERR_COUNT.network;
  });
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
const wider = Math.min(m + 10, DISCOVER_FETCH_MI);
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
busy:    { icon: '🚦', title: 'Trail service is busy',
           body: 'The OpenStreetMap search service is rate-limiting or overloaded right now.' },
network: { icon: '📡', title: 'Could not reach trail search',
           body: 'Check your connection and try again.' }
  };
  const DISCOVER_ERR_COUNT = {
timeout: 'Search timed out — not a report about what is nearby',
busy:    'Trail service busy — please retry shortly',
network: 'Could not load trails — check connection'
  };
  function discoverErrorHTML(kind) {
const s = DISCOVER_ERR_STATE[kind] || DISCOVER_ERR_STATE.network;
return '<div class="disc-state">'
  + '<div class="disc-state__icon">' + s.icon + '</div>'
  + '<h3 class="disc-state__title">' + s.title + '</h3>'
  + '<p class="disc-state__body">' + s.body + '</p>'
  + '<button class="disc-state__action" data-disc-act="retry">Try again</button></div>';
  }

  /* Re-runs the search for the current location, dropping any cached payload
 so a retry after a failure genuinely re-queries. */
  function discoverRetry() {
if (discoverUserLat == null) return;
fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi, { force: true });
  }

  /* Widening now re-filters the cached 50-mile payload. No network. */
  function discoverExpandRadius() {
discoverRadiusMi = Math.min(discoverRadiusMi + 10, DISCOVER_FETCH_MI);
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
'retry':         ()      => discoverRetry(),
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
