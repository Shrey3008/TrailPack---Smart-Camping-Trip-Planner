// Dashboard JavaScript

// Show enhanced loading skeleton
function showLoading(elementId = 'trips-grid') {
  const container = document.getElementById(elementId);
  if (container) {
    container.innerHTML = `
      <div class="skeleton-grid">
        ${Array(3).fill(0).map(() => `
          <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line text"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line text"></div>
            <div class="skeleton-line short"></div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// Hide loading spinner
function hideLoading(elementId = 'trips-grid') {
  // Content will be replaced by actual data
}

// Load dashboard data with AI enhancements
async function loadDashboard() {
  showLoading('trips-grid');
  try {
    const data = await apiCallWithAuth('/trips');
    const trips = data.trips || [];
    
    // Calculate progress and add AI insights for each trip
    const tripsWithProgress = await Promise.all(trips.map(async (trip, index) => {
      try {
        const items = await apiCallWithAuth(`/trips/${trip.tripId}/items`);
        const packed = items.filter(item => item.isChecked).length;
        const progress = items.length > 0 ? Math.round((packed / items.length) * 100) : 0;
        
        // Add AI insights for upcoming trips
        let aiInsights = null;
        if (trip.startDate && new Date(trip.startDate) > new Date()) {
          try {
            const daysUntil = Math.ceil((new Date(trip.startDate) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 7) {
              aiInsights = await loadAIInsights(trip);
            }
          } catch (error) {
            console.log('AI insights not available for this trip');
          }
        }
        
        return { 
          ...trip, 
          progress, 
          packed, 
          totalItems: items.length,
          aiInsights,
          animationDelay: index * 0.1 // Stagger animations
        };
      } catch (error) {
        console.error(`Error loading items for trip ${trip.tripId}:`, error);
        return { 
          ...trip, 
          progress: 0, 
          packed: 0, 
          totalItems: 0,
          animationDelay: index * 0.1
        };
      }
    }));
    
    // Update trips grid with animations
    updateTripsGrid(tripsWithProgress);
    
    // Load shared trips
    await loadSharedTrips();
    
    // Show AI insights for upcoming trips
    showAIInsights(tripsWithProgress);
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load dashboard data');
  } finally {
    hideLoading('trips-grid');
  }
}

// Load AI insights for a trip
async function loadAIInsights(trip) {
  try {
    // Get weather insights
    const weatherResponse = await apiCallWithAuth(`/ai/insights/weather/${trip.tripId}?location=${trip.location || 'Unknown'}&startDate=${trip.startDate}&endDate=${trip.endDate}`);
    
    // Get trip summary
    const summaryResponse = await apiCallWithAuth('/ai/trip/summary', {
      method: 'POST',
      body: JSON.stringify({
        tripData: trip,
        checklistItems: { packed: trip.packed || 0, total: trip.totalItems || 0 },
        activities: trip.activities || []
      })
    });
    
    return {
      weather: weatherResponse.success ? weatherResponse.data : null,
      summary: summaryResponse.success ? summaryResponse.data : null
    };
  } catch (error) {
    console.error('Error loading AI insights:', error);
    return null;
  }
}

// Show AI insights widget
function showAIInsights(trips) {
  const upcomingTrips = trips.filter(trip => 
    trip.aiInsights && 
    trip.startDate && 
    new Date(trip.startDate) > new Date()
  );
  
  if (upcomingTrips.length === 0) return;
  
  const container = document.querySelector('.dashboard-container');
  const insightsHTML = upcomingTrips.map(trip => `
    <div class="ai-insights-card" style="animation-delay: ${trip.animationDelay}s">
      <h3>AI Insights for ${escapeHtml(trip.name)}</h3>
      ${trip.aiInsights.weather ? `
        <div class="ai-insight-item">
          <strong>🌤️ Weather Forecast:</strong>
          <div class="weather-forecast">
            ${trip.aiInsights.weather.predictions?.slice(0, 5).map(day => `
              <div class="weather-day">
                <div class="weather-day-date">${new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}</div>
                <div class="weather-day-temp">${Math.round(day.temperature)}°C</div>
                <div class="weather-day-condition">${day.description}</div>
              </div>
            `).join('') || '<p>Weather data unavailable</p>'}
          </div>
        </div>
      ` : ''}
      ${trip.aiInsights.summary ? `
        <div class="ai-insight-item">
          <strong>📋 Trip Summary:</strong>
          <p>${trip.aiInsights.summary.summary}</p>
        </div>
      ` : ''}
    </div>
  `).join('');
  
  // Insert after the header
  const header = document.querySelector('.dashboard-header');
  if (header && insightsHTML) {
    header.insertAdjacentHTML('afterend', insightsHTML);
  }
}

// Load shared trips
async function loadSharedTrips() {
  try {
    const response = await apiCallWithAuth('/trips/shared');
    const sharedTrips = response.trips || [];
    
    const container = document.getElementById('shared-trips-grid');
    const section = document.getElementById('shared-trips-section');
    
    if (!container || !section) return;
    
    if (sharedTrips.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    // Calculate progress for shared trips
    const tripsWithProgress = await Promise.all(sharedTrips.map(async (trip) => {
      // Fetch items for this trip
      const itemsResponse = await apiCallWithAuth(`/trips/${trip.tripId}/items`);
      const items = itemsResponse.items || [];
      const totalItems = items.length;
      const packedItems = items.filter(item => item.isPacked).length;
      const progress = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
      
      return {
        ...trip,
        totalItems,
        packed: packedItems,
        progress
      };
    }));
    
    container.innerHTML = tripsWithProgress.map(trip => `
      <div class="trip-card shared-trip">
        <div class="trip-card-header">
          <h3>${escapeHtml(trip.name)}</h3>
          <span class="trip-status-badge status-${trip.status || 'planning'}">${trip.status || 'planning'}</span>
        </div>
        <div class="trip-meta">
          ${escapeHtml(trip.terrain)} • ${escapeHtml(trip.season)} • ${trip.duration} days
        </div>
        <div class="trip-owner">
          <small>👤 Shared by: ${escapeHtml(trip.ownerName)} (${escapeHtml(trip.myRole)})</small>
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
        <div class="trip-actions">
          <button class="btn btn-secondary" onclick="window.location.href='checklist.html?id=${trip.tripId}'">
            View Checklist
          </button>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading shared trips:', error);
  }
}

// Update trips grid with enhanced animations and UX
function updateTripsGrid(trips) {
  const container = document.getElementById('trips-grid');
  const emptyState = document.getElementById('empty-state');
  
  if (!container) return;
  
  if (trips.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.classList.add('dashboard-item');
    return;
  }
  
  container.style.display = 'grid';
  emptyState.style.display = 'none';
  
  container.innerHTML = trips.map((trip, index) => `
    <div class="trip-card dashboard-item" style="animation-delay: ${trip.animationDelay || index * 0.1}s">
      <div class="trip-card-header">
        <h3>${escapeHtml(trip.name)}</h3>
        <span class="trip-status-badge status-${trip.status || 'planning'}">${trip.status || 'planning'}</span>
      </div>
      <div class="trip-meta">
        <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
        <span class="trip-badge">${escapeHtml(trip.season)}</span>
        <span class="trip-badge">${trip.duration} days</span>
      </div>
      ${trip.startDate ? `
        <div class="trip-dates">
          <small>📅 ${new Date(trip.startDate).toLocaleDateString()} - ${trip.endDate ? new Date(trip.endDate).toLocaleDateString() : 'Ongoing'}</small>
        </div>
      ` : ''}
      <div class="trip-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${trip.progress || 0}%; --progress-width: ${trip.progress || 0}%"></div>
        </div>
        <div class="trip-progress-info">
          <span>${trip.packed || 0}/${trip.totalItems || 0} items packed</span>
          <span class="trip-progress-percentage">${trip.progress || 0}%</span>
        </div>
      </div>
      ${trip.aiInsights?.weather?.alerts && trip.aiInsights.weather.alerts.length > 0 ? `
        <div class="weather-alert">
          <span class="alert-icon">⚠️</span>
          <span>Weather alerts for this trip</span>
        </div>
      ` : ''}
      <div class="trip-actions">
        <button class="btn btn-primary" onclick="viewChecklist('${trip.tripId}')">
          View Checklist
        </button>
        <button class="btn btn-secondary" onclick="shareTrip('${trip.tripId}')">
          Share
        </button>
      </div>
    </div>
  `).join('');
  
  // Add staggered animation to cards
  const cards = container.querySelectorAll('.trip-card');
  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * 0.1}s`;
  });
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
    
    // Show success notification
    if (window.notificationManager) {
      notificationManager.showNotification('success', 'Trip deleted successfully');
    }
    
    // Reload dashboard
    loadDashboard();
  } catch (error) {
    if (window.notificationManager) {
      notificationManager.showNotification('error', 'Failed to delete trip. Please try again.');
    } else {
      alert('Failed to delete trip. Please try again.');
    }
  }
}

// Share a trip
async function shareTrip(tripId) {
  try {
    const response = await apiCallWithAuth(`/trips/${tripId}/share`, {
      method: 'POST',
      body: JSON.stringify({
        message: 'Join my camping adventure!'
      })
    });
    
    if (response.success) {
      // Copy share link to clipboard
      await navigator.clipboard.writeText(response.shareLink);
      
      if (window.notificationManager) {
        notificationManager.showNotification('success', 'Share link copied to clipboard!');
      } else {
        alert('Share link copied to clipboard!');
      }
    }
  } catch (error) {
    if (window.notificationManager) {
      notificationManager.showNotification('error', 'Failed to generate share link');
    } else {
      alert('Failed to generate share link');
    }
  }
}

// Enhanced error handling
function showError(message) {
  if (window.notificationManager) {
    notificationManager.showNotification('error', message);
  } else {
    alert(message);
  }
}

// Escape HTML utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get status buttons for trip
function getStatusButtons(trip) {
  const status = trip.status || 'planning';
  const buttons = [];
  
  switch (status) {
    case 'planning':
      buttons.push(`
        <button class="btn btn-success" onclick="updateTripStatus('${trip.tripId}', 'active')">
          Start Trip
        </button>
      `);
      break;
    case 'active':
      buttons.push(`
        <button class="btn btn-warning" onclick="updateTripStatus('${trip.tripId}', 'completed')">
          Complete Trip
        </button>
      `);
      break;
    case 'completed':
      buttons.push(`
        <span class="badge badge-success">Completed</span>
      `);
      break;
  }
  
  return buttons.join('');
}

// Update trip status
async function updateTripStatus(tripId, newStatus) {
  try {
    await apiCallWithAuth(`/trips/${tripId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    
    if (window.notificationManager) {
      notificationManager.showNotification('success', `Trip status updated to ${newStatus}`);
    }
    
    // Reload dashboard
    loadDashboard();
  } catch (error) {
    if (window.notificationManager) {
      notificationManager.showNotification('error', 'Failed to update trip status');
    } else {
      alert('Failed to update trip status');
    }
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
