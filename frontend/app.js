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

// Load dashboard stats
async function loadStats() {
  try {
    const stats = await apiCall('/trips/stats');
    document.getElementById('stat-trips').textContent = stats.totalTrips;
    document.getElementById('stat-items').textContent = stats.totalItems;
    document.getElementById('stat-packed').textContent = stats.packedItems;
    document.getElementById('stat-percentage').textContent = `${stats.packedPercentage}%`;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
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

  try {
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading trips...</div>';

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

    const limit = parseInt(container.dataset.limit, 10) || 0;
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
          <button class="btn btn-danger" onclick="event.stopPropagation(); deleteTrip('${trip.tripId}')">
            Delete Trip
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          Failed to load trips. Please make sure the server is running.
        </div>
      `;
    }
  }
}

// Load trips shared with the current user (dashboard "Shared With Me")
async function loadSharedTrips() {
  const section = document.getElementById('shared-trips-section');
  const container = document.getElementById('shared-trips-container');
  if (!section || !container) return;

  try {
    // Real endpoint lives on the sharedTrips router: GET /shared-trips/mine
    // (see backend/routes/sharedTrips.js). Response shape: { trips: [...] }.
    const response = await apiCallWithAuth('/shared-trips/mine');
    const trips = Array.isArray(response)
      ? response
      : (response && Array.isArray(response.trips) ? response.trips : []);
    if (trips.length === 0) {
      section.style.display = 'none';
      return;
    }
    container.innerHTML = trips.map(trip => `
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


// Expose functions to global scope for inline onclick handlers
window.viewChecklist = viewChecklist;
window.deleteTrip = deleteTrip;
