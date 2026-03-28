// Dashboard JavaScript

// Load dashboard data
async function loadDashboard() {
  try {
    const data = await apiCallWithAuth('/trips/dashboard/stats');
    
    // Update stats cards
    updateStatsCards(data.stats);
    
    // Update terrain stats
    updateTerrainStats(data.terrainStats);
    
    // Update season stats
    updateSeasonStats(data.seasonStats);
    
    // Update recent trips
    updateRecentTrips(data.recentTrips);
    
    // Update upcoming trips
    updateUpcomingTrips(data.upcomingTrips);
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load dashboard data');
  }
}

// Update stats cards
function updateStatsCards(stats) {
  const totalTripsEl = document.getElementById('total-trips');
  const activeTripsEl = document.getElementById('active-trips');
  const completedTripsEl = document.getElementById('completed-trips');
  const packingProgressEl = document.getElementById('packing-progress');
  
  if (totalTripsEl) totalTripsEl.textContent = stats.totalTrips || 0;
  if (activeTripsEl) activeTripsEl.textContent = stats.activeTrips || 0;
  if (completedTripsEl) completedTripsEl.textContent = stats.completedTrips || 0;
  if (packingProgressEl) packingProgressEl.textContent = `${stats.overallProgress || 0}%`;
}

// Update terrain stats with progress bars
function updateTerrainStats(terrainStats) {
  const container = document.getElementById('terrain-stats');
  if (!container || !terrainStats) return;
  
  const total = Object.values(terrainStats).reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    container.innerHTML = '<p class="no-data">No terrain data available</p>';
    return;
  }
  
  container.innerHTML = Object.entries(terrainStats)
    .sort((a, b) => b[1] - a[1])
    .map(([terrain, count]) => {
      const percentage = Math.round((count / total) * 100);
      return `
        <div class="stat-bar">
          <span class="stat-bar-label">${escapeHtml(terrain)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="stat-bar-value">${count}</span>
        </div>
      `;
    }).join('');
}

// Update season stats with progress bars
function updateSeasonStats(seasonStats) {
  const container = document.getElementById('season-stats');
  if (!container || !seasonStats) return;
  
  const total = Object.values(seasonStats).reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    container.innerHTML = '<p class="no-data">No season data available</p>';
    return;
  }
  
  const seasonEmojis = {
    'Spring': '🌸',
    'Summer': '☀️',
    'Fall': '🍂',
    'Winter': '❄️'
  };
  
  container.innerHTML = Object.entries(seasonStats)
    .sort((a, b) => b[1] - a[1])
    .map(([season, count]) => {
      const percentage = Math.round((count / total) * 100);
      return `
        <div class="stat-bar">
          <span class="stat-bar-label">${seasonEmojis[season] || ''} ${escapeHtml(season)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="stat-bar-value">${count}</span>
        </div>
      `;
    }).join('');
}

// Update recent trips
function updateRecentTrips(recentTrips) {
  const container = document.getElementById('recent-trips');
  const emptyState = document.getElementById('empty-state');
  
  if (!container) return;
  
  if (!recentTrips || recentTrips.length === 0) {
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'grid';
  if (emptyState) emptyState.style.display = 'none';
  
  container.innerHTML = recentTrips.map(trip => `
    <div class="trip-card" onclick="viewChecklist('${trip.id}')">
      <div class="trip-progress">
        <div class="trip-progress-fill" style="width: ${trip.progress}%"></div>
      </div>
      <h3>${escapeHtml(trip.name)}</h3>
      <div class="trip-meta">
        <span class="trip-badge">${escapeHtml(trip.terrain)}</span>
        <span class="trip-badge">${escapeHtml(trip.season)}</span>
        <span class="trip-badge">${trip.duration} days</span>
      </div>
      <div class="trip-status">
        <span class="status-badge status-${trip.status}">${trip.status}</span>
        <span class="progress-text">${trip.progress}% packed</span>
      </div>
      <div class="trip-date">
        Created: ${new Date(trip.createdAt).toLocaleDateString()}
      </div>
    </div>
  `).join('');
}

// Update upcoming trips section
function updateUpcomingTrips(upcomingTrips) {
  const section = document.getElementById('upcoming-section');
  const container = document.getElementById('upcoming-trips');
  
  if (!section || !container) return;
  
  if (!upcomingTrips || upcomingTrips.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  container.innerHTML = upcomingTrips.map(trip => `
    <div class="upcoming-item" onclick="viewChecklist('${trip.id}')">
      <h4>${escapeHtml(trip.name)}</h4>
      <p class="days-until">${trip.daysUntil} days until departure</p>
      <p class="start-date">${new Date(trip.startDate).toLocaleDateString()}</p>
    </div>
  `).join('');
}

// View checklist for a trip
function viewChecklist(tripId) {
  window.location.href = `checklist.html?id=${tripId}`;
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
