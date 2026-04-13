// Dashboard JavaScript

// Load dashboard data
async function loadDashboard() {
  try {
    const data = await apiCallWithAuth('/trips');
    const trips = data.trips || [];
    
    // Update trips grid
    updateTripsGrid(trips);
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load dashboard data');
  }
}

// Update trips grid
function updateTripsGrid(trips) {
  const container = document.getElementById('trips-grid');
  const emptyState = document.getElementById('empty-state');
  
  if (!container) return;
  
  if (trips.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'grid';
  emptyState.style.display = 'none';
  
  container.innerHTML = trips.map(trip => `
    <div class="trip-card">
      <h3>${escapeHtml(trip.name)}</h3>
      <div class="trip-meta">
        ${escapeHtml(trip.terrain)} • ${escapeHtml(trip.season)} • ${trip.duration} days
      </div>
      <div class="trip-actions">
        <button class="btn btn-secondary" onclick="window.location.href='checklist.html?id=${trip.tripId}'">
          View Checklist
        </button>
        <button class="btn btn-danger" onclick="deleteTrip('${trip.tripId}')">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

// View checklist for a trip
function viewChecklist(tripId) {
  window.location.href = `checklist.html?id=${tripId}`;
}

// Delete a trip
async function deleteTrip(tripId) {
  if (!confirm('Are you sure you want to delete this trip? This cannot be undone.')) {
    return;
  }
  
  try {
    await apiCallWithAuth(`/trips/${tripId}`, {
      method: 'DELETE'
    });
    
    // Reload dashboard
    loadDashboard();
  } catch (error) {
    alert('Failed to delete trip. Please try again.');
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show error message
function showError(message) {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    container.insertBefore(errorDiv, container.firstChild);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}
