// API Configuration (uses API_URL from auth.js)
// Helper function for API calls (legacy, without auth)
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
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
      container.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    
    container.innerHTML = trips.map(trip => `
      <div class="trip-card" onclick="viewChecklist('${trip._id}')">
        <h3>${escapeHtml(trip.name)}</h3>
        <div class="trip-meta">
          <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
          <span class="trip-badge">${escapeHtml(trip.season)}</span>
          <span class="trip-badge">${trip.duration} days</span>
        </div>
        <div class="trip-date">
          Created: ${new Date(trip.createdAt).toLocaleDateString()}
        </div>
        <div class="trip-actions">
          <button class="btn btn-primary" onclick="event.stopPropagation(); viewChecklist('${trip._id}')">
            View Checklist
          </button>
          <button class="btn btn-danger" onclick="event.stopPropagation(); deleteTrip('${trip._id}')">
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

// Create a new trip
async function handleCreateTrip(e) {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    
    const formData = {
      name: document.getElementById('trip-name').value,
      terrain: document.getElementById('terrain').value,
      season: document.getElementById('season').value,
      duration: parseInt(document.getElementById('duration').value),
      startDate: document.getElementById('start-date')?.value || null,
      endDate: document.getElementById('end-date')?.value || null
    };
    
    console.log('Creating trip with data:', formData);
    
    const result = await apiCallWithAuth('/trips', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    
    console.log('Trip created successfully:', result);
    
    // Redirect to checklist page
    window.location.href = `checklist.html?id=${result.trip.tripId}`;
  } catch (error) {
    console.error('Failed to create trip:', error);
    alert('Failed to create trip: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Trip';
  }
}

// View checklist for a trip
function viewChecklist(tripId) {
  window.location.href = `checklist.html?id=${tripId}`;
}

// Delete a trip
async function deleteTrip(tripId) {
  if (!confirm('Are you sure you want to delete this trip?')) {
    return;
  }
  
  try {
    await apiCallWithAuth(`/trips/${tripId}`, {
      method: 'DELETE'
    });
    
    // Reload trips
    loadTrips();
  } catch (error) {
    alert('Failed to delete trip. Please try again.');
  }
}

// Load checklist for a trip
async function loadChecklist(tripId) {
  try {
    // Load trip details
    const trip = await apiCallWithAuth(`/trips/${tripId}`);
    displayTripDetails(trip);
    
    // Load checklist items
    console.log('Fetching items for tripId:', tripId);
    const response = await apiCallWithAuth(`/trips/${tripId}/items`);
    console.log('Raw response:', response, 'Type:', typeof response);
    // Handle both array and object with items property
    const items = Array.isArray(response) ? response : (response.items || []);
    console.log('Processed items:', items, 'Count:', items.length);
    displayChecklist(items, tripId);
    updateProgress(items);
    checkCompletion(items);
    
    // Update status controls
    updateTripStatusControls(trip);
  } catch (error) {
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
      <span class="trip-badge">${escapeHtml(trip.season)} Trip</span>
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
          <div class="checklist-item ${item.isChecked ? 'packed' : ''}" data-item-id="${item.itemId}">
            <div class="item-left">
              <input type="checkbox" 
                     class="item-checkbox" 
                     ${item.isChecked ? 'checked' : ''} 
                     onchange="togglePacked('${item.itemId}', this.checked)">
              <span class="item-name">${escapeHtml(item.name)}</span>
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
    alert('Failed to update item. Please try again.');
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
    alert('Please enter both item name and category');
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
  } catch (error) {
    alert('Failed to add item. Please try again.');
  }
}

// Delete checklist item
async function deleteItem(itemId, tripId, itemName, itemCategory) {
  if (!confirm(`Are you sure you want to remove "${itemName}"?`)) {
    return;
  }
  
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
      method: 'DELETE'
    });
    
    // Add to recently deleted
    recentlyDeletedItems.push(itemToRestore);
    
    // Show recently deleted section
    displayRecentlyDeleted();
    
    // Reload checklist
    loadChecklist(tripId);
    loadRecommendations(tripId);
  } catch (error) {
    alert('Failed to delete item. Please try again.');
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
    
    alert(`"${item.name}" restored successfully!`);
  } catch (error) {
    console.error('Error restoring item:', error);
    alert('Failed to restore item');
  }
}

// Update progress bar
function updateProgress(items) {
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  
  if (!progressText || !progressFill) return;
  
  const total = items.length;
  const packed = items.filter(item => item.isChecked).length;
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
    
    alert(`Trip status updated to: ${newStatus}`);
    
    // Reload trip details
    const trip = await apiCallWithAuth(`/trips/${tripId}`);
    displayTripDetails(trip);
    updateTripStatusControls(trip);
  } catch (error) {
    console.error('Error updating trip status:', error);
    alert('Failed to update trip status');
  }
}

// Uncheck all items (mark all as unpacked)
async function uncheckAllItems(tripId) {
  if (!confirm('Uncheck all items? This will mark everything as unpacked.')) {
    return;
  }
  
  try {
    // Get all items and uncheck them
    const items = await apiCallWithAuth(`/trips/${tripId}/items`);
    const packedItems = items.filter(item => item.isChecked);
    
    // Uncheck each packed item
    for (const item of packedItems) {
      await apiCallWithAuth(`/items/${item.itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ packed: false })
      });
    }
    
    alert(`${packedItems.length} items unchecked`);
    loadChecklist(tripId);
  } catch (error) {
    console.error('Error unchecking items:', error);
    alert('Failed to uncheck items');
  }
}

// Show completion message when all items packed
function checkCompletion(items) {
  const completionMessage = document.getElementById('completion-message');
  if (!completionMessage || items.length === 0) return;
  
  const allPacked = items.every(item => item.isChecked);
  completionMessage.style.display = allPacked ? 'block' : 'none';
}
