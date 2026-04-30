// Organizer Dashboard JavaScript

// Check if user has organizer or admin access
function checkOrganizerAccess() {
  const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  if (user.role !== 'organizer' && user.role !== 'admin') {
    (window.showToast
      ? window.showToast('Organizer privileges required.', 'error')
      : alert('Access denied. Organizer privileges required.'));
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
    return false;
  }
  return true;
}

// Load organizer dashboard data
async function loadOrganizerDashboard() {
  try {
    const data = await apiCallWithAuth('/trips/organizer/dashboard');
    updateOverviewStats(data.stats || {});
    updateTripsList(data.trips || []);
  } catch (error) {
    console.error('Error loading organizer dashboard:', error);
    showError('Failed to load organizer dashboard data');
  }
}

// Update overview statistics
function updateOverviewStats(stats) {
  const totalOrganizedEl = document.getElementById('total-organized');
  const activeTripsEl = document.getElementById('active-trips');
  const completedTripsEl = document.getElementById('completed-trips');
  const totalParticipantsEl = document.getElementById('total-participants');
  
  if (totalOrganizedEl) totalOrganizedEl.textContent = stats.totalOrganized || 0;
  if (activeTripsEl) activeTripsEl.textContent = stats.activeTrips || 0;
  if (completedTripsEl) completedTripsEl.textContent = stats.completedTrips || 0;
  if (totalParticipantsEl) totalParticipantsEl.textContent = stats.totalParticipants || 0;
}

// Update trips list
function updateTripsList(trips) {
  const container = document.getElementById('organized-trips-list');
  
  if (!container) return;
  
  if (trips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <h3>No trips to organize</h3>
        <p>Create a trip or be added as an organizer to see it here.</p>
        <button class="btn btn-primary" onclick="window.location.href='create-trip.html'">
          Create New Trip
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = trips.map(trip => `
    <div class="trip-card organizer-trip-card">
      <div class="trip-card-header">
        <h3>${escapeHtml(trip.name)}</h3>
        <span class="trip-status-badge status-${trip.status || 'planning'}">${trip.status || 'planning'}</span>
      </div>
      <div class="trip-meta">
        <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
        <span class="trip-badge">${escapeHtml(trip.season)}</span>
        <span class="trip-badge">${trip.duration} days</span>
        <span class="trip-badge">${trip.participants?.length || 0} participants</span>
      </div>
      ${trip.startDate ? `
        <div class="trip-dates">
          <small>📅 ${new Date(trip.startDate).toLocaleDateString()} - ${trip.endDate ? new Date(trip.endDate).toLocaleDateString() : 'Ongoing'}</small>
        </div>
      ` : ''}
      <div class="trip-actions organizer-actions">
        <button class="btn btn-primary" onclick="viewTripChecklist('${trip.tripId}')">
          View Checklist
        </button>
        <button class="btn btn-secondary" onclick="viewParticipants('${trip.tripId}')">
          Manage Participants
        </button>
        ${getStatusButton(trip)}
      </div>
    </div>
  `).join('');
}

// Get status button based on trip status
function getStatusButton(trip) {
  const status = trip.status || 'planning';
  
  if (status === 'planning') {
    return `<button class="btn btn-success" onclick="updateTripStatus('${trip.tripId}', 'active')">▶ Start Trip</button>`;
  } else if (status === 'active') {
    return `
      <button class="btn btn-primary" onclick="updateTripStatus('${trip.tripId}', 'completed')">✓ Complete</button>
      <button class="btn btn-warning" onclick="updateTripStatus('${trip.tripId}', 'cancelled')">✕ Cancel</button>
    `;
  } else if (status === 'completed') {
    return `<span class="badge badge-success">✓ Completed</span>`;
  } else if (status === 'cancelled') {
    return `<button class="btn btn-success" onclick="updateTripStatus('${trip.tripId}', 'active')">▶ Reactivate</button>`;
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
    
    showNotification(`Trip status updated to ${status}`, 'success');
    loadOrganizerDashboard();
  } catch (error) {
    console.error('Error updating trip status:', error);
    showNotification('Failed to update trip status', 'error');
  }
}

// View trip checklist
function viewTripChecklist(tripId) {
  window.location.href = `checklist.html?id=${tripId}`;
}

// View and manage participants
async function viewParticipants(tripId) {
  try {
    const response = await apiCallWithAuth(`/trips/${tripId}/participants`);
    const participants = response.participants || [];
    
    const participantsSection = document.getElementById('participants-section');
    const participantsList = document.getElementById('participants-list');
    
    if (!participantsSection || !participantsList) return;
    
    participantsSection.style.display = 'block';
    participantsSection.scrollIntoView({ behavior: 'smooth' });
    
    if (participants.length === 0) {
      participantsList.innerHTML = `
        <div class="empty-state">
          <p>No participants yet.</p>
        </div>
        ${getAddParticipantForm(tripId)}
      `;
      return;
    }
    
    participantsList.innerHTML = `
      <div class="participants-table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${participants.map(p => `
              <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.email)}</td>
                <td>
                  <span class="role-badge role-${p.role}">${p.role}</span>
                </td>
                <td>${p.joinedAt ? new Date(p.joinedAt).toLocaleDateString() : 'Unknown'}</td>
                <td>
                  <button class="btn btn-small btn-danger" onclick="removeParticipant('${tripId}', '${p.userId}')">
                    Remove
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${getAddParticipantForm(tripId)}
    `;
  } catch (error) {
    console.error('Error loading participants:', error);
    showNotification('Failed to load participants', 'error');
  }
}

// Get add participant form (uses the invite flow under the hood).
function getAddParticipantForm(tripId) {
  return `
    <div class="add-participant-section">
      <h4>Invite a Participant</h4>
      <div class="share-form">
        <input type="email" id="add-participant-email-${tripId}" placeholder="Enter email address" class="share-input">
        <button class="btn btn-primary" onclick="addParticipant('${tripId}')">Send Invitation</button>
      </div>
      <p class="muted-help" style="font-size:0.8rem;color:#6b7280;margin-top:0.5rem;">
        A shareable link is copied to your clipboard. The recipient clicks it to join the trip.
      </p>
    </div>
  `;
}

// Close participants view
function closeParticipantsView() {
  const participantsSection = document.getElementById('participants-section');
  if (participantsSection) {
    participantsSection.style.display = 'none';
  }
}

// Invite a participant by email. Uses the invite flow so the organizer
// doesn't need to know the target user's userId ahead of time.
async function addParticipant(tripId) {
  const emailInput = document.getElementById(`add-participant-email-${tripId}`);
  const email = emailInput?.value.trim();

  if (!email || !email.includes('@')) {
    (window.showToast
      ? window.showToast('Enter a valid email address.', 'warning')
      : alert('Please enter an email address'));
    return;
  }

  try {
    const data = await apiCallWithAuth(`/trips/${tripId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    emailInput.value = '';

    const link = data.acceptUrl || (window.location.origin + '/accept-invite.html?token=' + encodeURIComponent(data.token || ''));
    try { await navigator.clipboard.writeText(link); } catch (_) {}
    (window.showToast
      ? window.showToast(`Invitation sent to ${email}. Link copied to clipboard.`, 'success', 3000)
      : showNotification('Invitation sent. Link: ' + link, 'success'));

    viewParticipants(tripId);
    loadOrganizerDashboard();
  } catch (error) {
    console.error('Error sending invite:', error);
    (window.showToast
      ? window.showToast(error.message || 'Failed to send invitation', 'error')
      : alert(error.message || 'Failed to send invitation'));
  }
}

// Remove participant from trip
async function removeParticipant(tripId, userId) {
  const ok = window.showConfirm
    ? await window.showConfirm('Remove this participant from the trip?', { title: 'Remove participant', confirmText: 'Remove', danger: true })
    : confirm('Are you sure you want to remove this participant?');
  if (!ok) return;

  try {
    await apiCallWithAuth(`/trips/${tripId}/participants/${userId}`, {
      method: 'DELETE'
    });
    (window.showToast ? window.showToast('Participant removed.', 'success', 2000) : null);
    viewParticipants(tripId);
    loadOrganizerDashboard();
  } catch (error) {
    console.error('Error removing participant:', error);
    (window.showToast ? window.showToast('Failed to remove participant.', 'error') : null);
  }
}

// Escape HTML utility
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show error message
function showError(message) {
  const container = document.querySelector('.organizer-dashboard');
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
