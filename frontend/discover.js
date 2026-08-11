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

  function discoverHomePhotoFor(terrain, idx) {
const pool = (typeof DISCOVER_PHOTO_POOL !== 'undefined' && DISCOVER_PHOTO_POOL[terrain])
  ? DISCOVER_PHOTO_POOL[terrain]
  : (typeof DISCOVER_PHOTO_POOL !== 'undefined' ? DISCOVER_PHOTO_POOL.forest : []);
if (!pool || !pool.length) return '';
return pool[idx % pool.length];
  }

  function discoverHomeCardHTML(item, idx) {
const photo = discoverHomePhotoFor(item.terrain || 'forest', idx);
const safeName = String(item.name).replace(/'/g, "\\'");
const safeRegion = String(item.region || '').replace(/'/g, "\\'");
return ''
  + '<button type="button" class="disc-card" '
  + 'onclick="discoverPickCity(\'' + safeName + (safeRegion ? ', ' + safeRegion : '') + '\',' + item.lat + ',' + item.lon + ')">'
  +   '<div class="disc-card-photo" style="background-image:url(\'' + photo + '\')"></div>'
  +   '<div class="disc-card-body">'
  +     '<p class="disc-card-title">' + item.name + '</p>'
  +     (item.region ? '<p class="disc-card-sub">📍 ' + item.region + '</p>' : '')
  +   '</div>'
  + '</button>';
  }

  function renderDiscoverRow(elId, list) {
const el = document.getElementById(elId);
if (!el) return;
el.innerHTML = list.map((it, i) => discoverHomeCardHTML(it, i)).join('');
  }

  function renderDiscoverLinkList(elId, list) {
const el = document.getElementById(elId);
if (!el) return;
el.innerHTML = list.map((it) => {
  const safe = String(it.name).replace(/'/g, "\\'");
  return '<button type="button" class="disc-link-item" '
    + 'onclick="discoverPickCity(\'' + safe + '\',' + it.lat + ',' + it.lon + ')">'
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

  function updateDiscoverRadius(v) {
discoverRadiusMi = parseInt(v);
document.getElementById('discoverRadiusDisplay').textContent = v + ' miles';
document.getElementById('discoverRadiusBig').textContent = v + ' miles';
  }
  function applyDiscoverRadius() {
closeDiscoverRP();
if (discoverUserLat) fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi);
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
        return '<div class="disc-dd-row" onclick="discoverPickCity(\'' + p[0].replace(/'/g, "\\'") + '\',' + d.lat + ',' + d.lon + ')">'
            + '<div class="disc-dd-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></div>'
            + '<div><div class="disc-dd-title">' + p[0] + '</div>'
            + '<div class="disc-dd-sub">' + (p.slice(1,3).join(',').trim()) + '</div></div></div>';
      }).join('');
      document.getElementById('discoverLocDropdown').hidden = false;
      discoverDDOpen = true;
    });
}, 400);
  }

  function fetchDiscoverTrails(lat, lon, miles) {
// Swap the Hipcamp-style home content out for the results+map block on
// first search. The home content can be brought back via the
// "← Back to Discover" button (discoverHomeShow()).
const home = document.getElementById('discoverHomeContent');
const res  = document.getElementById('discoverResultsBlock');
const pills = document.getElementById('discoverPillRow');
if (home) home.hidden = true;
if (res)  res.hidden  = false;
if (pills) pills.hidden = false;
// Reset the terrain filter on every new search. Carrying it over would
// apply a filter to an already-truncated 12-result set and could land the
// user on "no results match" immediately after searching a new place,
// which reads as a failed search rather than an active filter.
discoverActiveTerrain = 'all';
document.querySelectorAll('.disc-pill').forEach(p => {
  const isAll = p.dataset.terrain === 'all';
  p.classList.toggle('is-active', isAll);
  p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
});

showDiscoverSkeletons();
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
  if (discoverMap) setTimeout(() => discoverMap.invalidateSize(), 0);
}
if (discoverMap) setTimeout(() => discoverMap.invalidateSize(), 0);
const meters = miles * 1609.34;
discoverMap.setView([lat, lon], miles > 35 ? 9 : miles > 20 ? 10 : 11);
discoverMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) discoverMap.removeLayer(l); });
const uIcon = L.divIcon({ html: '<div style="background:#2d6a4f;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">YOU</div>', className: '', iconSize: [30,30], iconAnchor: [15,15] });
L.marker([lat, lon], { icon: uIcon }).addTo(discoverMap).bindPopup('<b>Your Location</b>');
L.circle([lat, lon], { radius: meters, color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4' }).addTo(discoverMap);
const q = `[out:json][timeout:25];(way["leisure"="nature_reserve"](around:${meters},${lat},${lon});relation["route"="hiking"](around:${meters},${lat},${lon});node["tourism"="camp_site"]["name"](around:${meters},${lat},${lon});way["leisure"="park"]["name"](around:${meters},${lat},${lon}););out body 30;>;out skel qt;`;
fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })
  .then(r => r.json())
  .then(data => {
    const trails = data.elements
      .filter(e => e.tags && e.tags.name)
      .map(e => ({ id: e.id, name: e.tags.name, type: e.tags.leisure || e.tags.route || 'trail', op: e.tags.operator || '', lat: e.lat || e.center?.lat, lon: e.lon || e.center?.lon }))
      .filter(t => t.lat && t.lon).slice(0, 12);
    renderDiscoverCards(trails, lat, lon);
    renderDiscoverPins(trails, lat, lon);
    const loc = document.getElementById('discoverLocInput').value.replace('📍 ', '');
    document.getElementById('discoverResCount').innerHTML = '<strong style="color:#111;">' + trails.length + ' trails</strong> found within <strong style="color:#111;">' + miles + ' miles</strong> of ' + loc;
  })
  .catch(() => {
    document.getElementById('discoverTrailResults').innerHTML = discoverEmptyHTML(miles);
    document.getElementById('discoverResCount').textContent = 'Could not load trails — check connection';
  });
  }

  function discoverTerrain(name) {
const n = name.toLowerCase();
if (/mountain|peak|summit|hill|ridge|bluff/.test(n)) return { t: 'Mountain', b: 'rgba(37,99,235,.85)', p: 'mountain' };
if (/beach|shore|lake|river|creek|falls|bay/.test(n))  return { t: 'Lake / Water', b: 'rgba(8,145,178,.85)', p: 'lake' };
if (/desert|canyon|mesa|butte|rock|sand/.test(n))      return { t: 'Desert', b: 'rgba(234,88,12,.85)', p: 'desert' };
return { t: 'Forest', b: 'rgba(45,106,79,.88)', p: 'forest' };
  }
  function discoverDist(a, b, c, d) {
const R = 3958.8, dA = (c-a)*Math.PI/180, dB = (d-b)*Math.PI/180;
const x = Math.sin(dA/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dB/2)**2;
return (R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))).toFixed(1);
  }

  function renderDiscoverCards(trails, ulat, ulon) {
const g = document.getElementById('discoverTrailResults');
if (!trails.length) { g.innerHTML = discoverEmptyHTML(discoverRadiusMi); return; }
g.innerHTML = trails.map((t) => {
  const { t: ter, b: bc, p: ph } = discoverTerrain(t.name);
  const d = discoverDist(ulat, ulon, t.lat, t.lon);
  const tint = DISCOVER_TERRAIN_TINT[ph] || DISCOVER_TERRAIN_TINT.forest;
  return `<div data-terrain="${ter}" onclick="discoverZoom(${t.lat},${t.lon})" style="background:#fff;border-radius:14px;overflow:hidden;cursor:pointer;border:1px solid rgba(0,0,0,.07);transition:box-shadow .18s,transform .18s;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.10)';this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='none';this.style.transform='none'">
    <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:${tint.bg};display:flex;align-items:center;justify-content:center;" aria-hidden="true">
      <span style="font-size:2.6rem;line-height:1;opacity:.55;">${tint.glyph}</span>
      <span style="position:absolute;bottom:10px;left:10px;padding:4px 10px;border-radius:9999px;font-size:.72rem;font-weight:700;background:${bc};color:#fff;">${ter}</span>
    </div>
    <div style="padding:12px 14px 14px;">
      <div style="font-weight:700;font-size:.9rem;line-height:1.3;margin-bottom:2px;">${t.name}</div>
      <div style="font-size:.78rem;color:#9ca3af;margin-bottom:10px;">${t.type.replace(/_/g,' ')} · ${d} miles away</div>
      <button data-trail-name="${(t.name||'').replace(/"/g,'&quot;')}" data-trail-terrain="${ter}" data-trail-lat="${t.lat||''}" data-trail-lon="${t.lon||''}" onclick="event.stopPropagation(); openPlanTripModal({name:this.dataset.trailName, terrain:this.dataset.trailTerrain, lat:this.dataset.trailLat, lon:this.dataset.trailLon})" style="width:100%;padding:9px;background:#2d6a4f;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:.82rem;cursor:pointer;font-family:inherit;" onmouseover="this.style.background='#1b4332'" onmouseout="this.style.background='#2d6a4f'">Plan This Trip →</button>
    </div>
  </div>`;
}).join('');
  }

  function renderDiscoverPins(trails, ulat, ulon) {
const ico = L.divIcon({ html: '<div style="background:#2d6a4f;border-radius:50% 50% 50% 0;width:22px;height:22px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>', className: '', iconSize: [22,22], iconAnchor: [11,22] });
trails.forEach(t => {
  if (!t.lat || !t.lon) return;
  const d = discoverDist(ulat, ulon, t.lat, t.lon);
  const popupPayload = encodeURIComponent(JSON.stringify({ name: t.name, lat: t.lat, lon: t.lon }));
  L.marker([t.lat, t.lon], { icon: ico }).addTo(discoverMap)
    .bindPopup('<b>' + t.name + '</b><br>' + d + ' miles away<br><a href="#" onclick="event.preventDefault(); openPlanTripModal(JSON.parse(decodeURIComponent(\'' + popupPayload + '\')))" style="color:#2d6a4f;font-weight:600;">Plan This Trip →</a>');
});
  }

  function discoverZoom(lat, lon) { discoverMap.setView([lat, lon], 14); }

  function discoverEmptyHTML(m) {
return '<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;color:#6b7280;">'
  + '<div style="font-size:3.5rem;margin-bottom:14px;">🌿</div>'
  + '<h3 style="font-size:1.05rem;font-weight:700;color:#111;margin-bottom:6px;">No trails found within ' + m + ' miles</h3>'
  + '<p style="font-size:.875rem;max-width:30ch;margin-bottom:18px;">Try a larger radius or a different location</p>'
  + '<button onclick="discoverExpandRadius()" style="padding:10px 22px;background:#2d6a4f;color:#fff;border:none;border-radius:9999px;font-weight:600;font-size:.875rem;cursor:pointer;font-family:inherit;">+ Expand to ' + Math.min(m+10,50) + ' miles</button></div>';
  }
  function discoverExpandRadius() {
discoverRadiusMi = Math.min(discoverRadiusMi + 10, 50);
document.getElementById('discoverRadiusSlider').value = discoverRadiusMi;
updateDiscoverRadius(discoverRadiusMi);
if (discoverUserLat) fetchDiscoverTrails(discoverUserLat, discoverUserLon, discoverRadiusMi);
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
btn.addEventListener('click', () => {
  const open = region.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (label) label.textContent = open ? 'Less to Discover' : 'More to Discover';
});
  })();
