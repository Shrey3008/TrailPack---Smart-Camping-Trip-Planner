    // ---------- Boot ----------
    document.addEventListener('DOMContentLoaded', () => {
      checkAuth();
      loadTrips();
      loadStats();
      if (typeof loadSharedTrips === 'function') loadSharedTrips();

      if (window.currentUser) {
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
          userInfo.textContent = `${window.currentUser.name} (${window.currentUser.role || 'user'})`;
        }

        // Admin Panel + Organizer entries were removed from the dashboard
        // navbar when the hamburger dropdown was standardised across pages.
        // Keep the role-detection logic here as a no-op-safe lookup so any
        // future re-introduction (or role-only feature) can re-attach.
        const adminBtn = document.getElementById('admin-panel-btn');
        if (adminBtn) {
          adminBtn.style.display =
            window.currentUser.role === 'admin' ? 'inline-block' : 'none';
        }
        if (window.currentUser.role === 'organizer' || window.currentUser.role === 'admin') {
          const orgLink = document.getElementById('organizer-link');
          if (orgLink) orgLink.style.display = 'inline-block';
        }
      }

      wireCreateTripModal();
      wireDestinationAutocomplete();
      wireDateDurationSync();
      wireTripCardEnhancer();
      wireFilterTabs();

      // Auto-open Create Trip modal when arriving from Discover's
      // "Plan This Trip" button (e.g. my-trips.html?create=<trail name>).
      try {
        const params = new URLSearchParams(window.location.search);
        const presetName = params.get('create');
        if (presetName && document.getElementById('tp-ct-overlay')) {
          openCreateTripModal();
          const nameInput = document.getElementById('tp-ct-name');
          if (nameInput) nameInput.value = presetName;
          // Clean the URL so a refresh doesn't keep re-opening it.
          history.replaceState({}, '', window.location.pathname);
        }
      } catch (_) {}
      // Hero greeting + avatar — populated from sessionStorage user.
      updateHero();
    });

    /* ============================================================
       Hero greeting + navbar avatar
       Time-based greeting ("Good morning/afternoon/evening, X") and
       trip-count subtitle. Re-runs whenever the trips grid mutates,
       wired alongside the existing trip-card enhancer below.
       ============================================================ */
    function getFirstName() {
      try {
        const u = window.currentUser || JSON.parse(sessionStorage.getItem('currentUser') || 'null');
        const full = (u && u.name) || '';
        return (full.split(/\s+/)[0] || 'there').trim();
      } catch (_) { return 'there'; }
    }
    function getInitials() {
      try {
        const u = window.currentUser || JSON.parse(sessionStorage.getItem('currentUser') || 'null');
        const full = (u && u.name) || '';
        const parts = full.split(/\s+/).filter(Boolean).slice(0, 2);
        if (!parts.length) return '•';
        return parts.map(p => p[0]).join('').toUpperCase();
      } catch (_) { return '•'; }
    }
    function timeOfDay() {
      const h = new Date().getHours();
      if (h < 12) return 'morning';
      if (h < 18) return 'afternoon';
      return 'evening';
    }
    // Curated hero rotation — five wide hiking shots that all feature
    // people on the trail. Slot 1 is an Unsplash forest-group shot;
    // slots 2-5 are user-supplied photos hosted locally under
    // frontend/assets/hero/. All five share a similar warm-natural
    // grade so the rotation feels like one branded collection. Drop
    // replacement art at the same paths and the rotator picks it up
    // with no code change.
    const HERO_PHOTOS = [
      // 1. Forest hiking group — friends on a forest path (Holly Mandarich)
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1600&q=80&auto=format&fit=crop',
      // 2. Sunset silhouettes — group on a hillside at golden hour
      'assets/hero/hero-2.jpg',
      // 3. Alpine valley trail — group hiking above an alpine lake
      'assets/hero/hero-3.jpg',
      // 4. Emerald lake hikers — three hikers on a path beside a turquoise lake
      'assets/hero/hero-4.jpg',
      // 5. Red-rock canyon hiker — hiker stepping up sandstone in a desert canyon
      'assets/hero/hero-5.jpg',
    ];
    const HERO_INTERVAL_MS = 5000;
    const HERO_FADE_MS     = 700;

    // Fire-and-forget preload so each crossfade swaps to an already-cached
    // image and never reveals a blank layer mid-transition.
    function preloadHeroPhotos() {
      HERO_PHOTOS.forEach((src) => { const img = new Image(); img.src = src; });
    }

    // Idempotent rotator. Both index.html and my-trips.html call
    // updateHero() (which calls this) on DOMContentLoaded; the dataset
    // flag + cleared prior interval ensure we never stack timers if the
    // boot path runs twice (e.g. SPA-style re-entry).
    function initHeroRotation() {
      const hero = document.querySelector('.dash-hero');
      if (!hero) return;
      if (hero.dataset.heroRotation === 'on') return;
      hero.dataset.heroRotation = 'on';

      // Clean any previous artefacts in case a hot-reload left layers behind.
      hero.querySelectorAll('.dash-hero__photo, .dash-hero__overlay').forEach((n) => n.remove());

      // Two stacked photo layers + a single gradient overlay above them.
      // Layers are prepended so the existing .dash-hero__inner copy stays
      // last in source order and z-index:2 keeps it on top.
      const layerA = document.createElement('div');
      const layerB = document.createElement('div');
      const overlay = document.createElement('div');
      layerA.className  = 'dash-hero__photo';
      layerB.className  = 'dash-hero__photo';
      overlay.className = 'dash-hero__overlay';
      layerA.setAttribute('aria-hidden', 'true');
      layerB.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('aria-hidden', 'true');
      hero.insertBefore(layerA,  hero.firstChild);
      hero.insertBefore(layerB,  hero.firstChild);
      hero.insertBefore(overlay, null);
      // overlay needs to sit above the photo layers but below .dash-hero__inner.
      // Re-insert it right after the two layers (still before .dash-hero__inner).
      const inner = hero.querySelector('.dash-hero__inner');
      if (inner) hero.insertBefore(overlay, inner);

      // First image visible immediately on load — no blank flash.
      let activeIdx = 0;     // index into HERO_PHOTOS currently shown
      let activeLayer = layerA;
      let inactiveLayer = layerB;
      activeLayer.style.backgroundImage = "url('" + HERO_PHOTOS[activeIdx] + "')";
      activeLayer.classList.add('is-visible');

      preloadHeroPhotos();

      // Clear any leftover interval from a previous init on the same window.
      if (window.__tpHeroIntervalId) {
        clearInterval(window.__tpHeroIntervalId);
        window.__tpHeroIntervalId = null;
      }

      window.__tpHeroIntervalId = setInterval(() => {
        const nextIdx = (activeIdx + 1) % HERO_PHOTOS.length;
        // Stage the next image on the hidden layer, then on the next
        // animation frame flip opacity so the transition actually runs
        // (without the rAF the browser may batch image-set + class-add
        // and skip the fade).
        inactiveLayer.style.backgroundImage = "url('" + HERO_PHOTOS[nextIdx] + "')";
        requestAnimationFrame(() => {
          inactiveLayer.classList.add('is-visible');
          activeLayer.classList.remove('is-visible');
          // Swap pointers for the next tick.
          const tmp = activeLayer;
          activeLayer = inactiveLayer;
          inactiveLayer = tmp;
          activeIdx = nextIdx;
        });
      }, HERO_INTERVAL_MS);
    }

    function updateHero() {
      const greetEl = document.getElementById('dash-greeting');
      const avEl    = document.getElementById('nav-avatar');
      initHeroRotation();
      if (avEl) avEl.textContent = getInitials();
      if (greetEl) greetEl.textContent = `Good ${timeOfDay()}, ${getFirstName()} 🏕️`;
      // Subtitle (#dash-hero-sub) is intentionally page-static now — each page
      // sets its own tagline in HTML so the hero copy doesn't flicker on load.
    }

    // ---------- Filter tabs ----------
    function wireFilterTabs() {
      const tabs = document.querySelectorAll('#trip-filters .filter-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => {
            t.classList.remove('is-active');
            t.setAttribute('aria-selected', 'false');
          });
          tab.classList.add('is-active');
          tab.setAttribute('aria-selected', 'true');
          applyTripFilter(tab.dataset.filter || 'all');
        });
      });
    }
    function applyTripFilter(filter) {
      const container = document.getElementById('trips-container');
      if (!container) return;
      const cards = container.querySelectorAll('.trip-card');
      cards.forEach(card => {
        if (filter === 'all') {
          card.classList.remove('is-hidden-by-filter');
          return;
        }
        const firstBadge = card.querySelector('.trip-meta .trip-badge');
        const terrain = (firstBadge?.textContent || '').trim().toLowerCase();
        const match = terrain === filter || terrain.startsWith(filter);
        card.classList.toggle('is-hidden-by-filter', !match);
      });
    }

    /* ============================================================
       Date ↔ duration auto-sync for the Plan-a-new-trip modal
       Keeps startDate, endDate and duration consistent without
       ever showing a validation error. Re-entrancy is gated by
       a `syncing` flag so programmatic .value writes don't
       re-fire the cascading change listeners.
       Convention: duration is the number of *nights*, so
       endDate = startDate + duration days.
       ============================================================ */
    function wireDateDurationSync() {
      const startEl = document.getElementById('tp-ct-start');
      const endEl   = document.getElementById('tp-ct-end');
      const durEl   = document.getElementById('tp-ct-duration');
      const hint    = document.getElementById('tp-date-hint');
      if (!startEl || !endEl || !durEl) return;

      const DAY_MS = 86400000;
      let syncing = false;

      // Parse a YYYY-MM-DD <input type="date"> value as a UTC midnight
      // Date so day-arithmetic is unaffected by the user's timezone.
      function parseISO(s) {
        if (!s) return null;
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return isNaN(d.getTime()) ? null : d;
      }
      function toISO(d) {
        const y = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${mo}-${dd}`;
      }
      function diffNights(a, b) { return Math.round((b - a) / DAY_MS); }
      function fmt(d) {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }
      function clampDur(n) { return Math.min(60, Math.max(1, n | 0)); }
      function setSilently(el, v) { syncing = true; el.value = v; syncing = false; }

      function refreshHint() {
        const start = parseISO(startEl.value);
        const end   = parseISO(endEl.value);
        const dur   = parseInt(durEl.value, 10);
        if (start && end && end > start) {
          const n = diffNights(start, end);
          hint.textContent = `\uD83D\uDCC5 ${n} ${n === 1 ? 'night' : 'nights'} \u00B7 ${fmt(start)} \u2013 ${fmt(end)}`;
          hint.hidden = false;
        } else if (start && dur > 0) {
          const projEnd = new Date(start.getTime() + dur * DAY_MS);
          hint.textContent = `\uD83D\uDCC5 ${dur} ${dur === 1 ? 'night' : 'nights'} \u00B7 ${fmt(start)} \u2013 ${fmt(projEnd)}`;
          hint.hidden = false;
        } else {
          hint.hidden = true;
          hint.textContent = '';
        }
      }

      startEl.addEventListener('change', () => {
        if (syncing) return;
        const start = parseISO(startEl.value);
        const end   = parseISO(endEl.value);
        const dur   = clampDur(parseInt(durEl.value, 10) || 1);
        if (start) {
          // End date can't be before start date.
          endEl.min = startEl.value;
          // If end is missing or now <= start, project a fresh end from
          // the current duration. Otherwise keep end and re-sync duration.
          if (!end || end <= start) {
            setSilently(endEl, toISO(new Date(start.getTime() + dur * DAY_MS)));
          } else {
            const n = clampDur(diffNights(start, end));
            setSilently(durEl, String(n));
          }
        }
        refreshHint();
      });

      endEl.addEventListener('change', () => {
        if (syncing) return;
        const start = parseISO(startEl.value);
        const end   = parseISO(endEl.value);
        if (start && end && end > start) {
          setSilently(durEl, String(clampDur(diffNights(start, end))));
        } else if (end && !start) {
          // No start yet: back-fill start from current duration so the
          // three fields stay consistent.
          const dur = clampDur(parseInt(durEl.value, 10) || 1);
          setSilently(startEl, toISO(new Date(end.getTime() - dur * DAY_MS)));
        }
        refreshHint();
      });

      durEl.addEventListener('input', () => {
        if (syncing) return;
        const dur   = parseInt(durEl.value, 10);
        const start = parseISO(startEl.value);
        if (dur > 0 && start) {
          setSilently(endEl, toISO(new Date(start.getTime() + dur * DAY_MS)));
        }
        refreshHint();
      });

      refreshHint();
    }

    /* ============================================================
       Destination autocomplete (Open-Meteo geocoding API, no key)
       Wires the Plan-a-new-trip modal's location input to a
       debounced city search. Picking a suggestion populates the
       hidden #tp-ct-lat / #tp-ct-lon fields, which the submit
       handler ships to POST /trips.
       ============================================================ */
    function wireDestinationAutocomplete() {
      const input    = document.getElementById('tp-ct-location');
      const dropdown = document.getElementById('tp-ac-dropdown');
      const hint     = document.getElementById('tp-ac-hint');
      const latEl    = document.getElementById('tp-ct-lat');
      const lonEl    = document.getElementById('tp-ct-lon');
      if (!input || !dropdown) return;

      let debounceTimer = null;
      let lastQuery = '';
      let activeIdx = -1;
      let suggestions = [];

      const escapeHtml = (s) =>
        String(s).replace(/[&<>"']/g, (c) =>
          ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

      const formatLabel = (s) =>
        [s.name, s.admin1, s.country].filter(Boolean).join(', ');

      function clearCoords() {
        latEl.value = '';
        lonEl.value = '';
        hint.hidden = true;
        hint.classList.remove('is-confirmed');
      }
      function showHint(text, confirmed) {
        hint.textContent = text;
        hint.hidden = false;
        hint.classList.toggle('is-confirmed', !!confirmed);
      }
      function hideDropdown() {
        dropdown.hidden = true;
        dropdown.innerHTML = '';
        activeIdx = -1;
        input.setAttribute('aria-expanded', 'false');
      }
      function renderItems(list) {
        if (!list.length) {
          dropdown.innerHTML = '<div class="tp-ac-empty">No matches found</div>';
          dropdown.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          return;
        }
        dropdown.innerHTML = list.map((s, i) => `
          <div class="tp-ac-item" role="option" data-i="${i}">
            <span class="ac-name">${escapeHtml(s.name)}</span>
            <span class="ac-meta">${escapeHtml([s.admin1, s.country].filter(Boolean).join(', '))}</span>
          </div>`).join('');
        dropdown.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }

      async function search(q) {
        try {
          const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
          const res = await fetch(url);
          const data = await res.json();
          // Stale-response guard: bail if the user kept typing.
          if (input.value.trim() !== q) return;
          suggestions = (data.results || []).map((r) => ({
            name:   r.name,
            admin1: r.admin1 || '',
            country: r.country || '',
            lat:    r.latitude,
            lon:    r.longitude,
          }));
          renderItems(suggestions);
        } catch (e) {
          console.warn('[autocomplete] search failed', e);
          hideDropdown();
        }
      }

      input.addEventListener('input', () => {
        const q = input.value.trim();
        // Any free-typing invalidates a previous selection's lat/lon.
        clearCoords();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (q.length < 2) { hideDropdown(); return; }
        if (q === lastQuery) return;
        lastQuery = q;
        debounceTimer = setTimeout(() => search(q), 300);
      });

      // mousedown (not click) so it fires before input blur hides the dropdown.
      dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.tp-ac-item');
        if (!item) return;
        e.preventDefault();
        const i = parseInt(item.getAttribute('data-i'), 10);
        const s = suggestions[i];
        if (!s) return;
        input.value = formatLabel(s);
        latEl.value = s.lat;
        lonEl.value = s.lon;
        hint.hidden = true;
        hint.textContent = '';
        hint.classList.remove('is-confirmed');
        hideDropdown();
      });

      input.addEventListener('keydown', (e) => {
        if (dropdown.hidden) return;
        const items = dropdown.querySelectorAll('.tp-ac-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIdx = Math.min(activeIdx + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIdx = Math.max(activeIdx - 1, 0);
        } else if (e.key === 'Enter' && activeIdx >= 0) {
          e.preventDefault();
          items[activeIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          return;
        } else if (e.key === 'Escape') {
          hideDropdown();
          return;
        } else {
          return;
        }
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeIdx));
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      });

      input.addEventListener('blur', () => setTimeout(hideDropdown, 150));
    }

    // ---------- Create Trip modal ----------
    function openCreateTripModal() {
      const ov = document.getElementById('tp-ct-overlay');
      ov.style.display = 'flex';
      requestAnimationFrame(() => ov.classList.add('open'));
      setTimeout(() => document.getElementById('tp-ct-name')?.focus(), 120);
    }

    // Public helper used by Discover trail cards + map popups. Opens the
    // shared Create Trip modal and pre-fills name, destination, lat/lon,
    // and terrain (when known). Accepts either an options object or a
    // (name, terrain) positional pair for backward compatibility.
    window.openPlanTripModal = function (opts, terrainArg) {
      const ov = document.getElementById('tp-ct-overlay');
      if (!ov) return;
      const o = (opts && typeof opts === 'object')
        ? opts
        : { name: opts, terrain: terrainArg };
      openCreateTripModal();

      const nameInput = document.getElementById('tp-ct-name');
      if (nameInput && o.name) nameInput.value = o.name;

      // Prefill destination text with the trail name as a sensible default
      // (user can refine to a city). Set hidden lat/lon so the trip is
      // saved with the trail's coordinates even without picking a suggestion.
      const locInput = document.getElementById('tp-ct-location');
      if (locInput && o.name) locInput.value = o.name;
      const latH = document.getElementById('tp-ct-lat');
      const lonH = document.getElementById('tp-ct-lon');
      if (latH && o.lat) latH.value = o.lat;
      if (lonH && o.lon) lonH.value = o.lon;

      if (o.terrain) {
        const sel = document.getElementById('tp-ct-terrain');
        if (sel) {
          const norm = String(o.terrain).toLowerCase();
          const match = Array.from(sel.options).find(opt => opt.value.toLowerCase() === norm);
          if (match) sel.value = match.value;
        }
      }
      // Move focus to start date so the user lands on the next field to fill.
      setTimeout(() => document.getElementById('tp-ct-start')?.focus(), 140);
    };
    function closeCreateTripModal() {
      const ov = document.getElementById('tp-ct-overlay');
      ov.classList.remove('open');
      setTimeout(() => { ov.style.display = 'none'; }, 220);
    }

    function wireCreateTripModal() {
      const open = () => openCreateTripModal();
      document.getElementById('open-create-trip')?.addEventListener('click', open);
      document.getElementById('open-create-trip-empty')?.addEventListener('click', open);

      const ov = document.getElementById('tp-ct-overlay');
      ov.addEventListener('click', (e) => { if (e.target === ov) closeCreateTripModal(); });
      document.getElementById('tp-ct-cancel').addEventListener('click', closeCreateTripModal);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ov.classList.contains('open')) closeCreateTripModal();
      });

      document.getElementById('tp-ct-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('tp-ct-confirm');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating…';

        // Pull lat/lon set by the destination autocomplete (empty when the
        // user typed a custom string without picking a suggestion).
        const latVal = document.getElementById('tp-ct-lat').value;
        const lonVal = document.getElementById('tp-ct-lon').value;
        const body = {
          name: document.getElementById('tp-ct-name').value.trim(),
          terrain: document.getElementById('tp-ct-terrain').value,
          season: document.getElementById('tp-ct-season').value,
          duration: parseInt(document.getElementById('tp-ct-duration').value, 10) || 1,
          groupSize: parseInt(document.getElementById('tp-ct-group-size').value, 10) || 1,
          location: document.getElementById('tp-ct-location').value.trim() || null,
          startDate: document.getElementById('tp-ct-start').value || null,
          endDate: document.getElementById('tp-ct-end').value || null,
        };
        if (latVal && lonVal) {
          body.lat = parseFloat(latVal);
          body.lon = parseFloat(lonVal);
        }

        try {
          // Reuse the shared helper from app.js so auth headers stay consistent.
          const result = await apiCallWithAuth('/trips', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          const tripId = result?.trip?.tripId || result?.tripId;
          if (tripId) {
            sessionStorage.setItem('tripJustCreated', '1');
            window.location.href = `checklist.html?tripId=${tripId}`;
            return;
          }
          closeCreateTripModal();
          if (window.showToast) window.showToast('Trip created.', 'success');
          loadTrips();
          loadStats();
        } catch (err) {
          if (window.showToast) window.showToast(err?.message || 'Failed to create trip', 'error');
          else alert('Failed to create trip: ' + (err?.message || err));
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Trip';
        }
      });
    }

    // ---------- Trip card enhancer ----------
    // app.js renders bare trip cards. We observe the containers and decorate
    // each card with: (1) a top row (terrain emoji + created date) and
    // (2) a progress bar + "X of Y items packed". No other files touched.
    const TERRAIN_EMOJI = {
      mountain: '🏔️', mountains: '🏔️', alpine: '🏔️', snow: '🏔️',
      forest: '🌲', woods: '🌲', woodland: '🌲',
      desert: '🏜️', dunes: '🏜️',
      beach: '🏖️', coast: '🏖️', ocean: '🏖️',
      lake: '🛶', river: '🏞️', canyon: '🏞️', valley: '🏞️',
      tundra: '🥶', arctic: '🥶',
      jungle: '🌴', rainforest: '🌴', tropical: '🌴',
      plains: '🌾', prairie: '🌾', grassland: '🌾',
    };
    const itemCache = new Map(); // tripId -> { total, packed }

    const DISCOVER_PHOTO_POOL = {
      forest: [
        'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&q=80',
        'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=600&q=80',
        'https://images.unsplash.com/photo-1511497584788-876760111969?w=600&q=80',
        'https://images.unsplash.com/photo-1473773508845-188df298d2d1?w=600&q=80',
        'https://images.unsplash.com/photo-1425913397330-cf8af2ff40a1?w=600&q=80',
        'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=600&q=80',
        'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80',
        'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600&q=80',
        'https://images.unsplash.com/photo-1467173572719-f14b9fb86e5f?w=600&q=80',
        'https://images.unsplash.com/photo-1476231682828-37e571bc172f?w=600&q=80',
        'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=600&q=80',
        'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=80',
        'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=600&q=80',
        'https://images.unsplash.com/photo-1440342359743-84fcb8c21f21?w=600&q=80',
        'https://images.unsplash.com/photo-1446329813274-7c9036bd9a1f?w=600&q=80'
      ],
      mountain: [
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&q=80',
        'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=600&q=80',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
        'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=600&q=80',
        'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=600&q=80',
        'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&q=80',
        'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=600&q=80',
        'https://images.unsplash.com/photo-1491555103944-7c647fd857e6?w=600&q=80',
        'https://images.unsplash.com/photo-1544198365-f5d60b6d8190?w=600&q=80',
        'https://images.unsplash.com/photo-1439853949212-36589f9a3aac?w=600&q=80',
        'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=600&q=80',
        'https://images.unsplash.com/photo-1520637836862-4d197d17c93a?w=600&q=80',
        'https://images.unsplash.com/photo-1458442310124-dde6edb43d10?w=600&q=80',
        'https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&q=80',
        'https://images.unsplash.com/photo-1523712999610-f77fbcfc3843?w=600&q=80'
      ],
      lake: [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&q=80',
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
        'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=600&q=80',
        'https://images.unsplash.com/photo-1455763916899-e8b50eca9967?w=600&q=80',
        'https://images.unsplash.com/photo-1475688621402-4257606b5f44?w=600&q=80',
        'https://images.unsplash.com/photo-1416169607655-0c2b3ce2e1cc?w=600&q=80',
        'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=600&q=80',
        'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600&q=80',
        'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=600&q=80',
        'https://images.unsplash.com/photo-1464278533981-50106e6176b1?w=600&q=80',
        'https://images.unsplash.com/photo-1485470733090-0aae1788d5af?w=600&q=80',
        'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=80',
        'https://images.unsplash.com/photo-1510797215324-95aa89f43c33?w=600&q=80',
        'https://images.unsplash.com/photo-1549880338-65ddcdfd017b?w=600&q=80',
        'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&q=80'
      ],
      desert: [
        'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600&q=80',
        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80',
        'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&q=80',
        'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?w=600&q=80',
        'https://images.unsplash.com/photo-1473473433806-a27a84e5a9d8?w=600&q=80',
        'https://images.unsplash.com/photo-1518457900804-7c1965b31ce8?w=600&q=80',
        'https://images.unsplash.com/photo-1528702748617-c64d49f918af?w=600&q=80',
        'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=600&q=80',
        'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=600&q=80',
        'https://images.unsplash.com/photo-1455156218388-5e61b526818b?w=600&q=80',
        'https://images.unsplash.com/photo-1682686580452-37f1892ee5e8?w=600&q=80',
        'https://images.unsplash.com/photo-1445262102387-5fbb30a5e59d?w=600&q=80',
        'https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&q=80',
        'https://images.unsplash.com/photo-1518021964703-4b2030f03085?w=600&q=80',
        'https://images.unsplash.com/photo-1504198453048-49b667b8e8b7?w=600&q=80'
      ]
    };

    async function fetchItemStats(tripId) {
      if (itemCache.has(tripId)) return itemCache.get(tripId);
      try {
        const items = await apiCallWithAuth(`/trips/${tripId}/items`);
        const arr = Array.isArray(items) ? items : (items?.items || []);
        const stats = {
          total: arr.length,
          packed: arr.filter(i => i.packed).length,
        };
        itemCache.set(tripId, stats);
        return stats;
      } catch (_) {
        return { total: 0, packed: 0 };
      }
    }

    function enhanceCard(card) {
      if (!card || card.dataset.tpEnhanced === '1') return;
      card.dataset.tpEnhanced = '1';

      // Extract terrain from the first badge.
      const firstBadge = card.querySelector('.trip-meta .trip-badge');
      const terrain = (firstBadge?.textContent || '').trim();
      // Mirror terrain onto data-attributes so CSS can drive the photo +
      // (legacy) first-badge color hook.
      if (terrain) card.setAttribute('data-terrain', terrain.toLowerCase());

      // Hipcamp-style full-bleed terrain photo as the very first child.
      // URL comes from DISCOVER_PHOTO_POOL[trip.terrain][trip.photoIndex || 0]
      // (photoIndex is rendered by app.js onto the card as data-photo-index).
      // CSS [data-terrain] rules remain as a fallback for legacy cards.
      const photo = document.createElement('div');
      photo.className = 'tp-card-photo';
      photo.setAttribute('aria-hidden', 'true');
      if (terrain) photo.setAttribute('data-terrain', terrain.toLowerCase());
      const photoIndex = parseInt(card.dataset.photoIndex, 10) || 0;
      const poolKey    = (terrain || '').toLowerCase();
      const poolArr    = DISCOVER_PHOTO_POOL[poolKey] || DISCOVER_PHOTO_POOL.forest;
      const photoUrl   = poolArr[photoIndex] || poolArr[0];
      if (photoUrl) photo.style.backgroundImage = `url('${photoUrl}')`;
      card.insertBefore(photo, card.firstChild);
      void TERRAIN_EMOJI; // legacy emoji table is unused in the redesign

      // Extract tripId from the card's inline onclick (app.js renders: viewChecklist('<id>')).
      const onclick = card.getAttribute('onclick') || '';
      const m = onclick.match(/viewChecklist\('([^']+)'\)/);
      const tripId = m ? m[1] : null;
      if (!tripId) return;

      // Insert progress block before .trip-actions
      const actions = card.querySelector('.trip-actions');
      const block = document.createElement('div');
      block.className = 'tp-progress-block';
      block.innerHTML = `
        <div class="tp-progress-label">
          <span><strong>0</strong> of <strong>0</strong> items packed</span>
          <span>0%</span>
        </div>
        <div class="tp-progress-bar"><div class="tp-progress-fill"></div></div>
      `;
      if (actions) card.insertBefore(block, actions);
      else card.appendChild(block);

      fetchItemStats(tripId).then(({ total, packed }) => {
        const pct = total > 0 ? Math.round((packed / total) * 100) : 0;
        const label = block.querySelector('.tp-progress-label');
        const fill  = block.querySelector('.tp-progress-fill');
        if (label) label.innerHTML = `
          <span><strong>${packed}</strong> of <strong>${total}</strong> items packed</span>
          <span>${pct}%</span>
        `;
        if (fill) fill.style.width = pct + '%';
      });
    }

    function wireTripCardEnhancer() {
      const containers = [
        document.getElementById('trips-container'),
        document.getElementById('shared-trips-container'),
      ].filter(Boolean);

      const sweep = (root) => root.querySelectorAll('.trip-card').forEach(enhanceCard);

      containers.forEach(c => {
        sweep(c);
        const obs = new MutationObserver(() => {
          sweep(c);
          // Re-apply the active filter to any newly rendered cards.
          const activeTab = document.querySelector('#trip-filters .filter-tab.is-active');
          if (activeTab) applyTripFilter(activeTab.dataset.filter || 'all');
          // Refresh the hero subtitle whenever trips re-render.
          if (typeof updateHero === 'function') updateHero();
        });
        obs.observe(c, { childList: true, subtree: false });
      });

      // Bust the per-trip cache whenever the user returns to the dashboard
      // (e.g. after packing items on the checklist page).
      window.addEventListener('pageshow', () => {
        itemCache.clear();
        containers.forEach(c => c.querySelectorAll('.trip-card').forEach(card => {
          delete card.dataset.tpEnhanced;
          card.querySelector('.tp-card-photo')?.remove();
          card.querySelector('.tp-card-top')?.remove();      /* legacy cleanup */
          card.querySelector('.tp-progress-block')?.remove();
          enhanceCard(card);
        }));
      });
    }
