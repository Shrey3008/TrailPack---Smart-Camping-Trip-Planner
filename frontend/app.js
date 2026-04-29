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

// Load all trips for dashboard (for backwards compatibility)
async function loadTrips() {
  const container = document.getElementById('trips-container');
  const emptyState = document.getElementById('empty-state');
  
  if (!container) return;
  
  try {
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading trips...</div>';
    
    const data = await apiCallWithAuth('/trips');
    const trips = data.trips || [];
    
    if (trips.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    
    container.innerHTML = trips.map(trip => `
      <div class="trip-card" data-photo-index="${trip.photoIndex || 0}" onclick="viewChecklist('${trip.tripId}')">
        <h3>${escapeHtml(trip.name)}</h3>
        <div class="trip-meta">
          <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
          ${renderSeasonBadge(trip.season)}
          <span class="trip-badge">${trip.duration} days</span>
        </div>
        <div class="trip-date">
          Created: ${new Date(trip.createdAt).toLocaleDateString()}
        </div>
        <div class="trip-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); viewChecklist('${trip.tripId}')">
            View Checklist
          </button>
          <button class="btn btn-danger" onclick="event.stopPropagation(); deleteTrip('${trip.tripId}')">
            Delete
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
        <div class="trip-meta">
          <span class="trip-badge">${escapeHtml(trip.terrain || '')}</span>
          ${renderSeasonBadge(trip.season)}
          <span class="trip-badge">${trip.duration || 0} days</span>
          <span class="trip-badge" style="background:#E8F5E9;color:#1B4332;">Collaborator</span>
        </div>
        <div class="trip-date">
          Joined: ${trip.sharedSince ? new Date(trip.sharedSince).toLocaleDateString() : '—'}
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

// Create a new trip
async function handleCreateTrip(e) {
  console.log('[handleCreateTrip] Handler fired!');
  e.preventDefault();
  console.log('[handleCreateTrip] Prevented default form submission');
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    
    const formData = {
      name: document.getElementById('trip-name').value,
      location: document.getElementById('location').value,
      terrain: document.getElementById('terrain').value,
      season: document.getElementById('season').value,
      duration: parseInt(document.getElementById('duration').value),
      startDate: document.getElementById('start-date')?.value || null,
      endDate: document.getElementById('end-date')?.value || null
    };
    
    console.log('[handleCreateTrip] Form data:', formData);
    
    // Validate required fields
    if (!formData.location || !formData.terrain || !formData.season) {
      console.error('[handleCreateTrip] Missing location, terrain or season');
      (window.showFormError ? window.showFormError('form-error', 'Please fill in all required fields including location') : alert('Please fill in all required fields including location'));
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Trip';
      return;
    }
    
    const result = await apiCallWithAuth('/trips', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    
    console.log('[handleCreateTrip] API response:', result);
    console.log('[handleCreateTrip] result.trip:', result.trip);
    console.log('[handleCreateTrip] result.trip.tripId:', result.trip?.tripId);
    
    // Redirect to checklist page
    if (result.trip && result.trip.tripId) {
      const tripId = result.trip.tripId;
      const checklistUrl = `checklist.html?tripId=${tripId}`;
      console.log('[handleCreateTrip] Redirecting to:', checklistUrl);
      // Store in sessionStorage as backup
      sessionStorage.setItem('pendingTripId', tripId);
      // Flag so the checklist page can greet the user with a success toast.
      sessionStorage.setItem('tripJustCreated', '1');
      window.location.href = checklistUrl;
    } else {
      console.error('[handleCreateTrip] Missing tripId in response:', result);
      (window.showToast ? window.showToast('Trip created but failed to redirect.', 'warning') : alert('Trip created but failed to redirect.'));
    }
  } catch (error) {
    console.error('Failed to create trip:', error);
    (window.showToast ? window.showToast('Failed to create trip: ' + error.message, 'error') : alert('Failed to create trip: ' + error.message));
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Trip';
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

// Load checklist for a trip
async function loadChecklist(tripId) {
  try {
    console.log('[loadChecklist] Loading trip:', tripId);
    
    // Load trip details
    const trip = await apiCallWithAuth(`/trips/${tripId}`);
    console.log('[loadChecklist] Trip loaded:', trip);
    displayTripDetails(trip);
    
    // Load checklist items
    const response = await apiCallWithAuth(`/trips/${tripId}/items`);
    console.log('[loadChecklist] Items response:', response);
    // Handle both array and object with items property
    const items = Array.isArray(response) ? response : (response.items || []);
    console.log('[loadChecklist] Parsed items:', items);
    displayChecklist(items, tripId);
    updateProgress(items);
    checkCompletion(items);
    
    // Update status controls
    updateTripStatusControls(trip);
  } catch (error) {
    console.error('[loadChecklist] Error:', error);
    document.querySelector('.checklist-container').innerHTML = `
      <div class="error-message">
        Failed to load checklist. Please try again.
      </div>
    `;
  }
}

// Load recommendations for a trip
async function loadRecommendations(tripId) {
  try {
    const data = await apiCallWithAuth(`/trips/${tripId}/recommendations`);
    const recommendations = data.recommendations || [];
    
    const section = document.getElementById('recommendations-section');
    const container = document.getElementById('recommendations-list');
    
    if (!section || !container) return;
    
    if (recommendations.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    const typeColors = {
      'warning': '#ff9800',
      'success': '#4caf50',
      'info': '#2196f3',
      'suggestion': '#9c27b0'
    };
    
    const typeIcons = {
      'warning': '⚠️',
      'success': '✅',
      'info': 'ℹ️',
      'suggestion': '💡'
    };
    
    container.innerHTML = recommendations.map(rec => `
      <div class="recommendation" style="border-left: 4px solid ${typeColors[rec.type] || '#666'}; padding: 15px; margin-bottom: 10px; background: #f8f9fa; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
          <span style="font-size: 1.2rem;">${typeIcons[rec.type] || '💡'}</span>
          <strong style="color: ${typeColors[rec.type] || '#666'}; text-transform: capitalize;">${rec.type}</strong>
        </div>
        <p style="margin: 0; color: #555;">${escapeHtml(rec.message)}</p>
        ${rec.items ? `<p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #888;">Items: ${rec.items.map(escapeHtml).join(', ')}</p>` : ''}
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading recommendations:', error);
  }
}

// Display trip details
function displayTripDetails(trip) {
  const container = document.getElementById('trip-details');
  if (!container) return;
  
  const statusColors = {
    'planning': '#ff9800',
    'active': '#4caf50',
    'completed': '#2196f3',
    'cancelled': '#f44336'
  };
  
  container.innerHTML = `
    <h2>${escapeHtml(trip.name)}</h2>
    <div class="trip-info">
      <span class="trip-badge">${escapeHtml(trip.terrain)} Terrain</span>
      ${renderSeasonBadge(trip.season, { suffix: ' Trip' })}
      <span class="trip-badge">${trip.duration} Days</span>
      ${trip.status ? `<span class="trip-badge" style="background: ${statusColors[trip.status] || '#666'}; color: white;">${trip.status}</span>` : ''}
    </div>
    ${trip.startDate ? `<p style="margin-top: 10px; color: #666;">📅 ${new Date(trip.startDate).toLocaleDateString()} ${trip.endDate ? ' - ' + new Date(trip.endDate).toLocaleDateString() : ''}</p>` : ''}
  `;
}

// Display checklist organized by category
function displayChecklist(items, tripId) {
  const container = document.getElementById('checklist-categories');
  
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = '<p>No items in checklist yet.</p>';
    return;
  }
  
  // Group items by category
  const categories = {};
  items.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });
  
  // Display each category
  const categoryOrder = ['Clothing', 'Shelter', 'Food & Water', 'Safety', 'Tools'];
  
  container.innerHTML = categoryOrder
    .filter(category => categories[category])
    .map(category => `
      <div class="category-section">
        <h3 class="category-title">${escapeHtml(category)}</h3>
        ${categories[category].map(item => `
          <div class="checklist-item ${item.packed ? 'packed' : ''}" data-item-id="${item.itemId}">
            <div class="item-left">
              <input type="checkbox" 
                     class="item-checkbox" 
                     ${item.packed ? 'checked' : ''} 
                     onchange="togglePacked('${item.itemId}', this.checked)">
              <span class="item-name">${escapeHtml(item.name)}</span>
              ${item.packedBy ? `<span class="packed-by" title="Packed by ${escapeHtml(item.packedByName || item.packedBy)}">👤 ${escapeHtml(item.packedByName || item.packedBy)}</span>` : ''}
            </div>
            <div class="item-actions">
              <button class="btn btn-danger" onclick="deleteItem('${item.itemId}', '${tripId}', '${escapeHtml(item.name)}', '${escapeHtml(item.category)}')">
                Remove
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
}

// Toggle packed status
async function togglePacked(itemId, packed) {
  try {
    await apiCallWithAuth(`/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ packed })
    });
    
    // Update UI
    const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
    if (itemElement) {
      if (packed) {
        itemElement.classList.add('packed');
      } else {
        itemElement.classList.remove('packed');
      }
    }
    
    // Reload items to update progress
    const urlParams = new URLSearchParams(window.location.search);
    const tripId = urlParams.get('id');
    if (tripId) {
      const items = await apiCallWithAuth(`/trips/${tripId}/items`);
      updateProgress(items);
    }
  } catch (error) {
    (window.showToast ? window.showToast('Failed to update item.', 'error') : alert('Failed to update item. Please try again.'));
  }
}

// Add custom item
async function handleAddItem(tripId) {
  const nameInput = document.getElementById('new-item-name');
  const categoryInput = document.getElementById('new-item-category');
  
  if (!nameInput || !categoryInput) return;
  
  const name = nameInput.value.trim();
  const category = categoryInput.value;
  
  if (!name || !category) {
    (window.showToast ? window.showToast('Please enter both item name and category.', 'warning') : alert('Please enter both item name and category'));
    if (!name) nameInput.classList.add('tp-invalid');
    if (!category) categoryInput.classList.add('tp-invalid');
    setTimeout(() => { nameInput.classList.remove('tp-invalid'); categoryInput.classList.remove('tp-invalid'); }, 1200);
    return;
  }
  
  try {
    await apiCallWithAuth('/items', {
      method: 'POST',
      body: JSON.stringify({ tripId, name, category })
    });
    
    // Clear form
    nameInput.value = '';
    categoryInput.value = '';
    
    // Reload checklist
    loadChecklist(tripId);
    loadRecommendations(tripId);
    if (window.showToast) window.showToast('Item added.', 'success', 1800);
  } catch (error) {
    (window.showToast ? window.showToast('Failed to add item.', 'error') : alert('Failed to add item. Please try again.'));
  }
}

// Delete checklist item
async function deleteItem(itemId, tripId, itemName, itemCategory) {
  const confirmed = window.showConfirm
    ? await window.showConfirm(`Remove "${itemName}" from this checklist?`, { title: 'Remove item?', confirmText: 'Remove', danger: true })
    : confirm(`Are you sure you want to remove "${itemName}"?`);
  if (!confirmed) return;
  
  try {
    // Store item info before deleting (for recovery)
    const itemToRestore = {
      itemId: itemId,
      name: itemName,
      category: itemCategory,
      tripId: tripId,
      deletedAt: new Date().toISOString()
    };
    
    await apiCallWithAuth(`/items/${itemId}`, {
      method: 'DELETE',
      body: JSON.stringify({ tripId })
    });
    
    // Add to recently deleted
    recentlyDeletedItems.push(itemToRestore);
    
    // Show recently deleted section
    displayRecentlyDeleted();
    
    // Reload checklist
    loadChecklist(tripId);
    loadRecommendations(tripId);
    if (window.showToast) window.showToast(`Removed "${itemName}". You can restore it below.`, 'info');
  } catch (error) {
    (window.showToast ? window.showToast('Failed to delete item.', 'error') : alert('Failed to delete item. Please try again.'));
  }
}

// Display recently deleted items
function displayRecentlyDeleted() {
  const section = document.getElementById('recently-deleted-section');
  const list = document.getElementById('recently-deleted-list');
  
  if (!section || !list) return;
  
  if (recentlyDeletedItems.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  list.innerHTML = recentlyDeletedItems.map((item, index) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: white; border-radius: 5px; margin-bottom: 8px;">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span style="color: #666; font-size: 0.9rem;">(${escapeHtml(item.category)})</span>
      </div>
      <button class="btn btn-primary" onclick="restoreItem(${index})" style="padding: 5px 15px; font-size: 0.9rem;">
        🔄 Restore
      </button>
    </div>
  `).join('');
}

// Restore a deleted item
async function restoreItem(index) {
  const item = recentlyDeletedItems[index];
  if (!item) return;
  
  try {
    // Add the item back
    await apiCallWithAuth('/items', {
      method: 'POST',
      body: JSON.stringify({
        tripId: item.tripId,
        name: item.name,
        category: item.category
      })
    });
    
    // Remove from recently deleted
    recentlyDeletedItems.splice(index, 1);
    
    // Update display
    displayRecentlyDeleted();
    
    // Reload checklist
    loadChecklist(item.tripId);

    (window.showToast ? window.showToast(`"${item.name}" restored.`, 'success', 2000) : alert(`"${item.name}" restored successfully!`));
  } catch (error) {
    console.error('Error restoring item:', error);
    (window.showToast ? window.showToast('Failed to restore item.', 'error') : alert('Failed to restore item'));
  }
}

// Update progress bar
function updateProgress(items) {
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  
  if (!progressText || !progressFill) return;
  
  const total = items.length;
  const packed = items.filter(item => item.packed).length;
  const percentage = total > 0 ? (packed / total) * 100 : 0;
  
  progressText.textContent = `${packed}/${total} items packed`;
  progressFill.style.width = `${percentage}%`;
}

// Array to store recently deleted items for recovery
let recentlyDeletedItems = [];

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update trip status controls visibility
function updateTripStatusControls(trip) {
  const controlsSection = document.getElementById('trip-status-controls');
  const btnStart = document.getElementById('btn-start-trip');
  const btnComplete = document.getElementById('btn-complete-trip');
  const btnCancel = document.getElementById('btn-cancel-trip');
  const btnReset = document.getElementById('btn-reset-trip');
  const btnUncheckAll = document.getElementById('btn-uncheck-all');
  
  if (!controlsSection || !trip) return;
  
  controlsSection.style.display = 'block';
  
  // Show/hide buttons based on current status
  const status = trip.status || 'planning';
  
  btnStart.style.display = status === 'planning' ? 'inline-block' : 'none';
  btnComplete.style.display = status === 'active' ? 'inline-block' : 'none';
  btnCancel.style.display = (status === 'planning' || status === 'active') ? 'inline-block' : 'none';
  btnReset.style.display = (status === 'completed' || status === 'cancelled') ? 'inline-block' : 'none';
  btnUncheckAll.style.display = 'inline-block';
  
  // Attach event handlers
  if (btnStart) btnStart.onclick = () => changeTripStatus(trip.tripId, 'active');
  if (btnComplete) btnComplete.onclick = () => changeTripStatus(trip.tripId, 'completed');
  if (btnCancel) btnCancel.onclick = () => changeTripStatus(trip.tripId, 'cancelled');
  if (btnReset) btnReset.onclick = () => changeTripStatus(trip.tripId, 'planning');
  if (btnUncheckAll) btnUncheckAll.onclick = () => uncheckAllItems(trip.tripId);
}

// Change trip status
async function changeTripStatus(tripId, newStatus) {
  try {
    await apiCallWithAuth(`/trips/${tripId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    
    (window.showToast ? window.showToast(`Trip status: ${newStatus}`, 'success', 2000) : alert(`Trip status updated to: ${newStatus}`));

    // Reload trip details
    const trip = await apiCallWithAuth(`/trips/${tripId}`);
    displayTripDetails(trip);
    updateTripStatusControls(trip);
  } catch (error) {
    console.error('Error updating trip status:', error);
    (window.showToast ? window.showToast('Failed to update trip status.', 'error') : alert('Failed to update trip status'));
  }
}

// Uncheck all items (mark all as unpacked)
async function uncheckAllItems(tripId) {
  const confirmed = window.showConfirm
    ? await window.showConfirm('This will mark every item as unpacked.', { title: 'Uncheck all items?', confirmText: 'Uncheck all', danger: true })
    : confirm('Uncheck all items? This will mark everything as unpacked.');
  if (!confirmed) return;
  
  try {
    // Get all items and uncheck them
    const items = await apiCallWithAuth(`/trips/${tripId}/items`);
    const packedItems = items.filter(item => item.packed);
    
    // Uncheck each packed item
    for (const item of packedItems) {
      await apiCallWithAuth(`/items/${item.itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ packed: false })
      });
    }
    
    (window.showToast ? window.showToast(`${packedItems.length} items unchecked.`, 'success', 2000) : alert(`${packedItems.length} items unchecked`));
    loadChecklist(tripId);
  } catch (error) {
    console.error('Error unchecking items:', error);
    (window.showToast ? window.showToast('Failed to uncheck items.', 'error') : alert('Failed to uncheck items'));
  }
}

// Show completion message when all items packed
function checkCompletion(items) {
  const completionMessage = document.getElementById('completion-message');
  if (!completionMessage || items.length === 0) return;
  
  const allPacked = items.every(item => item.packed);
  completionMessage.style.display = allPacked ? 'block' : 'none';
}

// Expose functions to global scope for inline onclick handlers
window.viewChecklist = viewChecklist;
window.deleteTrip = deleteTrip;
window.loadChecklist = loadChecklist;
window.loadRecommendations = loadRecommendations;
