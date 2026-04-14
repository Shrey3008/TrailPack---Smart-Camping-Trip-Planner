// Dashboard JavaScript

// Load dashboard data
async function loadDashboard() {
  try {
    const data = await apiCallWithAuth('/trips');
    const trips = data.trips || [];
    
    // Calculate progress for each trip
    const tripsWithProgress = await Promise.all(trips.map(async (trip) => {
      try {
        const items = await apiCallWithAuth(`/trips/${trip.tripId}/items`);
        const packed = items.filter(item => item.isChecked).length;
        const progress = items.length > 0 ? Math.round((packed / items.length) * 100) : 0;
        return { ...trip, progress, packed, totalItems: items.length };
      } catch (error) {
        console.error(`Error loading items for trip ${trip.tripId}:`, error);
        return { ...trip, progress: 0, packed: 0, totalItems: 0 };
      }
    }));
    
    // Update trips grid
    updateTripsGrid(tripsWithProgress);
    
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
      <div class="trip-card-header">
        <h3>${escapeHtml(trip.name)}</h3>
        <span class="trip-status-badge status-${trip.status || 'planning'}">${trip.status || 'planning'}</span>
      </div>
      <div class="trip-meta">
        ${escapeHtml(trip.terrain)} • ${escapeHtml(trip.season)} • ${trip.duration} days
      </div>
      <div class="trip-progress">
        <div class="trip-progress-bar">
          <div class="trip-progress-fill" style="width: ${trip.progress || 0}%"></div>
        </div>
        <div class="trip-progress-info">
          <span>${trip.packed || 0}/${trip.totalItems || 0} items packed</span>
          <span class="trip-progress-percentage">${trip.progress || 0}%</span>
        </div>
      </div>
      <div class="trip-status-actions">
        ${getStatusButtons(trip)}
      </div>
      <div class="trip-actions">
        <button class="btn btn-secondary" onclick="window.location.href='checklist.html?id=${trip.tripId}'">
          View Checklist
        </button>
        <button class="btn btn-info" onclick="shareTrip('${trip.tripId}')">
          👥 Share
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

// Get status action buttons based on current status
function getStatusButtons(trip) {
  const status = trip.status || 'planning';
  
  if (status === 'planning') {
    return `<button class="btn btn-success" onclick="updateTripStatus('${trip.tripId}', 'active')">▶ Start Trip</button>`;
  } else if (status === 'active') {
    return `
      <button class="btn btn-primary" onclick="updateTripStatus('${trip.tripId}', 'completed')">✓ Complete Trip</button>
      <button class="btn btn-warning" onclick="updateTripStatus('${trip.tripId}', 'cancelled')">✕ Cancel Trip</button>
    `;
  } else if (status === 'completed') {
    return `<span class="trip-completed">✓ Trip Completed</span>`;
  } else if (status === 'cancelled') {
    return `<button class="btn btn-success" onclick="updateTripStatus('${trip.tripId}', 'active')">▶ Reactivate Trip</button>`;
  }
  return '';
}

// Update trip status
async function updateTripStatus(tripId, status) {
  try {
    await apiCallWithAuth(`/trips/${tripId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    
    // Reload dashboard to show updated status
    loadDashboard();
  } catch (error) {
    console.error('Error updating trip status:', error);
    alert('Failed to update trip status. Please try again.');
  }
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

// Share trip modal
async function shareTrip(tripId) {
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.id = `share-modal-${tripId}`;
  
  modal.innerHTML = `
    <div class="share-modal-content">
      <div class="share-modal-header">
        <h3>👥 Share Trip</h3>
        <button class="close-btn" onclick="closeShareModal('${tripId}')">&times;</button>
      </div>
      <div class="share-modal-body">
        <div class="share-add-section">
          <h4>Add Participant</h4>
          <div class="share-form">
            <input type="email" id="share-email-${tripId}" placeholder="Enter email address" class="share-input">
            <select id="share-role-${tripId}" class="share-select">
              <option value="participant">Participant (View & Check Items)</option>
              <option value="organizer">Organizer (Full Access)</option>
            </select>
            <button class="btn btn-primary" onclick="addParticipant('${tripId}')">Add</button>
          </div>
        </div>
        <div class="share-participants-section">
          <h4>Current Participants</h4>
          <div id="participants-list-${tripId}" class="participants-list">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Load participants
  await loadParticipants(tripId);
}

// Close share modal
function closeShareModal(tripId) {
  const modal = document.getElementById(`share-modal-${tripId}`);
  if (modal) {
    modal.remove();
  }
}

// Load participants for a trip
async function loadParticipants(tripId) {
  try {
    const response = await apiCallWithAuth(`/trips/${tripId}/participants`);
    const participants = response.participants || [];
    
    const container = document.getElementById(`participants-list-${tripId}`);
    if (!container) return;
    
    if (participants.length === 0) {
      container.innerHTML = '<p class="no-participants">No participants yet. Add someone above!</p>';
      return;
    }
    
    container.innerHTML = participants.map(p => `
      <div class="participant-item">
        <div class="participant-info">
          <span class="participant-name">${escapeHtml(p.name)}</span>
          <span class="participant-email">${escapeHtml(p.email)}</span>
          <span class="participant-role role-${p.role}">${p.role}</span>
        </div>
        <button class="btn btn-sm btn-danger" onclick="removeParticipant('${tripId}', '${p.userId}')">Remove</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading participants:', error);
    const container = document.getElementById(`participants-list-${tripId}`);
    if (container) {
      container.innerHTML = '<p class="error">Failed to load participants</p>';
    }
  }
}

// Add participant to trip
async function addParticipant(tripId) {
  const emailInput = document.getElementById(`share-email-${tripId}`);
  const roleSelect = document.getElementById(`share-role-${tripId}`);
  
  const email = emailInput.value.trim();
  const role = roleSelect.value;
  
  if (!email) {
    alert('Please enter an email address');
    return;
  }
  
  try {
    await apiCallWithAuth(`/trips/${tripId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
    
    emailInput.value = '';
    await loadParticipants(tripId);
    showNotification('Participant added successfully!', 'success');
  } catch (error) {
    console.error('Error adding participant:', error);
    alert(error.message || 'Failed to add participant. User may not exist.');
  }
}

// Remove participant from trip
async function removeParticipant(tripId, userId) {
  if (!confirm('Are you sure you want to remove this participant?')) {
    return;
  }
  
  try {
    await apiCallWithAuth(`/trips/${tripId}/participants/${userId}`, {
      method: 'DELETE'
    });
    
    await loadParticipants(tripId);
    showNotification('Participant removed successfully!', 'success');
  } catch (error) {
    console.error('Error removing participant:', error);
    alert('Failed to remove participant');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
