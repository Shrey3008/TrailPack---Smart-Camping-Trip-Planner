// API Configuration (shared via window.API_URL from config.js)
if (!window.API_URL) {
  console.warn('[app.js] window.API_URL not set; did config.js load? Falling back to localhost.');
  window.API_URL = 'http://localhost:3000';
}

// Auth token storage (in sessionStorage for persistence)
window.authToken = sessionStorage.getItem('authToken');
window.currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');

// Centralized unauthenticated handler: clear session, toast, redirect.
let __tpRedirecting = false;
function handleUnauthenticated(reason) {
  if (__tpRedirecting) return;
  __tpRedirecting = true;
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('currentUser');
  window.authToken = null;
  window.currentUser = null;
  if (window.showToast) window.showToast(reason || 'Session expired — please log in again.', 'warning', 2400);
  setTimeout(() => { window.location.href = 'login.html'; }, 600);
}

// Check authentication status
function checkAuth() {
  const token = sessionStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  // Update global auth token from storage
  window.authToken = token;
  window.currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
  return true;
}

// Logout function
function logout() {
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('currentUser');
  window.authToken = null;
  window.currentUser = null;
  window.location.href = 'login.html';
}

// Helper function for API calls with auth
async function apiCall(endpoint, options = {}) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add JWT token if available
    if (window.authToken) {
      headers['Authorization'] = `Bearer ${window.authToken}`;
    }

    const response = await fetch(`${window.API_URL}${endpoint}`, {
      headers,
      ...options
    });

    if (response.status === 401) {
      handleUnauthenticated('Your session has expired. Please log in again.');
      throw new Error('Unauthenticated');
    }

    if (!response.ok) {
      let error = {};
      try { error = await response.json(); } catch (_) {}
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Alias for backward compatibility
const apiCallWithAuth = apiCall;

// Season → emoji + pill palette. Keys are lowercased for lookup.
const SEASON_EMOJI = {
  summer: { icon: '☀️', bg: '#FEF9C3', color: '#92400E', border: '#FDE68A' },
  winter: { icon: '❄️', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  fall:   { icon: '🍂', bg: '#FFF7ED', color: '#92400E', border: '#FED7AA' },
  autumn: { icon: '🍂', bg: '#FFF7ED', color: '#92400E', border: '#FED7AA' },
  spring: { icon: '🌸', bg: '#FDF2F8', color: '#9D174D', border: '#FBCFE8' },
};

// Render a season badge with emoji + palette. Falls back to a plain
// trip-badge (empty string if no season given) so existing layout stays
// stable. Returns an HTML string.
function renderSeasonBadge(season, { suffix = '' } = {}) {
  const raw = (season || '').toString().trim();
  if (!raw) return `<span class="trip-badge"></span>`;
  const label = escapeHtml(raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() + suffix);
  const style = SEASON_EMOJI[raw.toLowerCase()];
  if (!style) return `<span class="trip-badge">${label}</span>`;
  // Use !important inline so our palette beats the generic .trip-badge
  // rules in index.html (and the dark-theme color override) which are
  // declared with !important at equal specificity.
  return `<span class="trip-badge season-badge" style="background:${style.bg} !important;color:${style.color} !important;border:1px solid ${style.border} !important;">${style.icon} ${label}</span>`;
}

/* Populate the four-number stats bar, where a page has one.
   my-trips.html still does; the dashboard replaced it with the "Next up" card.
   Each write is guarded because getElementById returns null on a page without
   the element and assigning .textContent to null throws, which would abort the
   rest of the function — the same failure profileStats.test.js exists to catch. */
async function loadStats() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const errorEl = document.getElementById('stats-error');
  try {
    const stats = await apiCall('/trips/stats');
    set('stat-trips', stats.totalTrips);
    set('stat-items', stats.totalItems);
    set('stat-packed', stats.packedItems);
    set('stat-percentage', `${stats.packedPercentage}%`);
    if (errorEl) errorEl.hidden = true;
  } catch (error) {
    console.error('Error loading stats:', error);
    // A failed request used to leave the markup's hardcoded zeroes on screen,
    // so an outage rendered as "you have packed nothing". An em dash reads as
    // "unknown", which is what we actually know.
    set('stat-trips', '—');
    set('stat-items', '—');
    set('stat-packed', '—');
    set('stat-percentage', '—');
    if (errorEl) errorEl.hidden = false;
  }
}

/* Placeholder cards shown while /trips is in flight. Mirrors .trip-card's
   shape — photo block, title, badge row, progress, action — so the grid does
   not reflow when the real cards replace them. */
function tripSkeletonHTML(count) {
  const one = `
    <div class="tp-skel-card" aria-hidden="true">
      <div class="tp-skel-photo"></div>
      <div class="tp-skel-body">
        <div class="tp-skel-line tp-skel-line--title"></div>
        <div class="tp-skel-badges">
          <span class="tp-skel-pill"></span><span class="tp-skel-pill"></span>
        </div>
        <div class="tp-skel-line tp-skel-line--short"></div>
        <div class="tp-skel-bar"></div>
        <div class="tp-skel-button"></div>
      </div>
    </div>`;
  return one.repeat(count);
}

/* Shared failure panel. Replaces the previous
   "Failed to load trips. Please make sure the server is running." — which told
   the user to check a server they do not run, in an unstyled legacy
   .error-message box. onRetryAttr names a global function to call. */
function loadErrorHTML({ title, body, retryFn }) {
  return `
    <div class="tp-load-error" role="alert">
      <span class="tp-load-error__icon" aria-hidden="true">⚠️</span>
      <div class="tp-load-error__text">
        <p class="tp-load-error__title">${title}</p>
        <p class="tp-load-error__body">${body}</p>
      </div>
      <button type="button" class="tp-load-error__retry" onclick="${retryFn}">Try again</button>
    </div>`;
}

/* ----------------------------------------------------------------
   formatTripRange(trip)
   Renders the trip's date row used on every card.
     - Both startDate + endDate present  -> "May 1 – 6, 2026" (same
       month) or "Apr 28 – May 3, 2026" (cross-month).
     - Only startDate                    -> "Starts May 1, 2026".
     - Neither                           -> falls back to created date
       (keeps backwards compatibility with older trips).
   Stays a pure helper so loadTrips + loadSharedTrips can both reuse
   it without any backend changes.
   ---------------------------------------------------------------- */
function formatTripRange(trip) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parseLocal = (iso) => {
    if (!iso || typeof iso !== 'string') return null;
    // ISO date strings like "2026-05-01" must be parsed as local dates,
    // not UTC, so the day doesn't drift across timezones.
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      const d = new Date(iso);
      return isNaN(d) ? null : d;
    }
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  };

  const start = parseLocal(trip && trip.startDate);
  const end   = parseLocal(trip && trip.endDate);

  if (start && end) {
    const sameYear  = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${MONTHS[start.getMonth()]} ${start.getDate()} \u2013 ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (sameYear) {
      return `${MONTHS[start.getMonth()]} ${start.getDate()} \u2013 ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} \u2013 ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (start) {
    return `Starts ${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
  }

  // Fallback for legacy trips with no start/end yet.
  if (trip && trip.createdAt) {
    return `Created ${new Date(trip.createdAt).toLocaleDateString()}`;
  }
  return '';
}

/* Render the caller's trips into #trips-container.
   Shared by dashboard.html and my-trips.html. The dashboard shows a preview of
   the few most recent trips and sends people to my-trips.html for the full
   list, so the container may carry `data-limit="N"` to cap how many cards are
   rendered. my-trips.html sets no limit and is unaffected.
   GET /trips is sorted createdAt:-1 server-side, so the first N are the N most
   recently created — not the next N by start date. */
async function loadTrips() {
  const container = document.getElementById('trips-container');
  const emptyState = document.getElementById('empty-state');
  const viewAll = document.getElementById('trips-view-all');

  if (!container) return;

  const limit = parseInt(container.dataset.limit, 10) || 0;

  try {
    // Skeletons rather than a centred spinner: the grid keeps its shape, so
    // the page does not jump when the cards arrive. Match the number we are
    // actually going to render.
    container.style.display = 'grid';
    container.innerHTML = tripSkeletonHTML(limit > 0 ? limit : 6);

    const data = await apiCallWithAuth('/trips');
    const trips = data.trips || [];

    if (trips.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      if (viewAll) viewAll.hidden = true;
      return;
    }

    container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    const visibleTrips = limit > 0 ? trips.slice(0, limit) : trips;

    // Only worth an explicit count when cards are actually being withheld.
    if (viewAll) {
      const truncated = limit > 0 && trips.length > limit;
      viewAll.textContent = truncated
        ? `View all ${trips.length} trips →`
        : 'View all trips →';
      viewAll.hidden = false;
    }

    container.innerHTML = visibleTrips.map(trip => `
      <div class="trip-card" data-photo-index="${trip.photoIndex || 0}" onclick="viewChecklist('${trip.tripId}')">
        <h3>${escapeHtml(trip.name)}</h3>
        <div class="trip-meta">
          <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
          ${renderSeasonBadge(trip.season)}
          <span class="trip-badge">${trip.duration} days</span>
        </div>
        <div class="trip-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${escapeHtml(formatTripRange(trip))}</span>
        </div>
        <div class="trip-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); viewChecklist('${trip.tripId}')">
            View Checklist
          </button>
          <div class="trip-more" data-trip-more>
            <button type="button" class="trip-more__toggle" data-trip-more-toggle
                    aria-haspopup="true" aria-expanded="false"
                    aria-label="More actions for ${escapeAttr(trip.name)}">
              <span aria-hidden="true">&#8943;</span>
            </button>
            <div class="trip-more__menu" data-trip-more-menu role="menu" hidden>
              <button type="button" role="menuitem" class="trip-more__item trip-more__item--danger"
                      data-trip-delete="${escapeAttr(trip.tripId)}">Delete trip</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading trips:', error);
    container.style.display = 'block';
    container.innerHTML = loadErrorHTML({
      title: "We couldn't load your trips",
      body: 'This is usually a connection problem — your trips are safe.',
      retryFn: 'loadTrips()',
    });
    if (emptyState) emptyState.style.display = 'none';
    if (viewAll) viewAll.hidden = true;
  }
}

// Load trips shared with the current user (dashboard "Shared With Me")
async function loadSharedTrips() {
  const section = document.getElementById('shared-trips-section');
  const container = document.getElementById('shared-trips-container');
  const viewAll = document.getElementById('shared-trips-view-all');
  if (!section || !container) return;

  try {
    // Real endpoint lives on the sharedTrips router: GET /shared-trips/mine
    // (see backend/routes/sharedTrips.js). Response shape: { trips: [...] }.
    const response = await apiCallWithAuth('/shared-trips/mine');
    const trips = Array.isArray(response)
      ? response
      : (response && Array.isArray(response.trips) ? response.trips : []);
    if (trips.length === 0) {
      // Clear before hiding. Losing access to the last shared trip hid the
      // section but left its cards in the DOM, so anything that reveals the
      // section again — or reads it, as the trip-card enhancer's
      // MutationObserver does — still saw trips that are no longer shared.
      container.innerHTML = '';
      section.style.display = 'none';
      return;
    }

    // Same opt-in cap as loadTrips(): the dashboard previews, my-trips.html
    // lists everything.
    const limit = parseInt(container.dataset.limit, 10) || 0;
    const visibleTrips = limit > 0 ? trips.slice(0, limit) : trips;

    // Only surfaced when cards are actually withheld — the recent-trips link
    // above already routes to my-trips.html, so an always-on second link to
    // the same place would just be noise.
    if (viewAll) {
      const truncated = limit > 0 && trips.length > limit;
      viewAll.textContent = `View all ${trips.length} shared trips →`;
      viewAll.hidden = !truncated;
    }

    container.innerHTML = visibleTrips.map(trip => `
      <div class="trip-card" data-photo-index="${trip.photoIndex || 0}" onclick="viewChecklist('${trip.tripId}')">
        <h3>${escapeHtml(trip.name)}</h3>
        <div class="trip-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${escapeHtml(formatTripRange(trip))}</span>
        </div>
        <div class="trip-meta">
          <span class="trip-badge">${escapeHtml(trip.terrain || '')}</span>
          ${renderSeasonBadge(trip.season)}
          <span class="trip-badge">${trip.duration || 0} days</span>
          <span class="trip-badge" style="background:#E8F5E9;color:#1B4332;">Collaborator</span>
        </div>
        <div class="trip-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); viewChecklist('${trip.tripId}')">
            View Checklist
          </button>
        </div>
      </div>
    `).join('');
    section.style.display = 'block';
  } catch (_error) {
    // Fail silently — shared-trips is a best-effort dashboard section.
    // If the endpoint is unavailable (404/network), just hide the section.
    section.style.display = 'none';
  }
}


/* ---------- Trip card overflow menu ----------
   "Delete Trip" used to sit beside "View Checklist" as a full danger button on
   every card — a destructive action given primary weight, repeated once per
   trip and, on a phone, directly under the thumb aiming for the primary one.
   It lives behind a menu now. deleteTrip() still runs its own danger-styled
   confirm, so this adds a deliberate tap, not a second prompt.

   One capture-phase listener, not a handler per card. Capture matters: the
   whole .trip-card carries an inline onclick that opens the checklist, and
   that handler sits on an ancestor of these controls. A bubble-phase listener
   here would run *after* it, so the card would already have navigated away.
   Intercepting on the way down is what keeps the menu clickable at all. */
function closeAllTripMenus(except) {
  document.querySelectorAll('[data-trip-more]').forEach((wrap) => {
    if (wrap === except) return;
    const menu = wrap.querySelector('[data-trip-more-menu]');
    const toggle = wrap.querySelector('[data-trip-more-toggle]');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (e) => {
  const toggle = e.target.closest?.('[data-trip-more-toggle]');
  const item   = e.target.closest?.('[data-trip-delete]');

  if (toggle || item) {
    e.stopPropagation();
    e.preventDefault();
  }

  if (toggle) {
    const wrap = toggle.closest('[data-trip-more]');
    const menu = wrap.querySelector('[data-trip-more-menu]');
    const opening = menu.hidden;
    closeAllTripMenus(wrap);
    menu.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    return;
  }

  if (item) {
    closeAllTripMenus();
    deleteTrip(item.getAttribute('data-trip-delete'));
    return;
  }

  // Any other click anywhere dismisses an open menu.
  closeAllTripMenus();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('[data-trip-more-menu]:not([hidden])');
  if (!open) return;
  const toggle = open.closest('[data-trip-more]')?.querySelector('[data-trip-more-toggle]');
  closeAllTripMenus();
  if (toggle) toggle.focus();   // Escape should not strand focus in a hidden menu
});

// View checklist for a trip
function viewChecklist(tripId) {
  console.log('viewChecklist called with tripId:', tripId);
  const url = `checklist.html?tripId=${encodeURIComponent(tripId)}`;
  console.log('Navigating to:', url);
  window.location.href = url;
}

// Delete a trip
async function deleteTrip(tripId) {
  const confirmed = window.showConfirm
    ? await window.showConfirm('This will permanently remove the trip and its checklist.', { title: 'Delete trip?', confirmText: 'Delete', danger: true })
    : confirm('Are you sure you want to delete this trip?');
  if (!confirmed) return;

  try {
    await apiCallWithAuth(`/trips/${tripId}`, {
      method: 'DELETE'
    });
    if (window.showToast) window.showToast('Trip deleted.', 'success');
    // Reload trips
    loadTrips();
    if (typeof loadStats === 'function') loadStats();
  } catch (error) {
    (window.showToast ? window.showToast('Failed to delete trip.', 'error') : alert('Failed to delete trip. Please try again.'));
  }
}


// Array to store recently deleted items for recovery
let recentlyDeletedItems = [];

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* escapeHtml goes through textContent -> innerHTML, which escapes &, < and >
   but leaves quotes alone — safe in a text node, not inside an attribute.
   Anything interpolated into an attribute value goes through this instead. */
function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// Expose functions to global scope for inline onclick handlers
window.viewChecklist = viewChecklist;
window.deleteTrip = deleteTrip;
