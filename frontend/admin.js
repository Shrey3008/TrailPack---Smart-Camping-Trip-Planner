// Admin Dashboard JavaScript

let currentEditUserId = null;

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Logout function
function logout() {
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// Promote current user to admin
async function promoteToAdmin() {
  const confirmed = window.showConfirm
    ? await window.showConfirm('You will be logged out so a fresh admin token can be issued.', { title: 'Promote to admin?', confirmText: 'Promote' })
    : confirm('Are you sure you want to promote yourself to admin?');
  if (!confirmed) return;

  try {
    await apiCallWithAuth('/admin/setup', {
      method: 'POST'
    });

    if (window.showToast) window.showToast('Promoted to admin. Please log in again.', 'success', 2200);
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
    setTimeout(() => { window.location.href = 'login.html'; }, 700);
  } catch (error) {
    console.error('Error promoting to admin:', error);
    (window.showToast ? window.showToast('Failed to promote to admin.', 'error') : alert('Failed to promote to admin'));
  }
}

// Check if user has admin access
function checkAdminAccess() {
  const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  
  if (user.role === 'admin') {
    // Hide promote button for admins
    const promoteBtn = document.getElementById('promote-admin-btn');
    if (promoteBtn) promoteBtn.style.display = 'none';
    return true;
  } else {
    // Show promote button for non-admins
    const promoteBtn = document.getElementById('promote-admin-btn');
    if (promoteBtn) {
      promoteBtn.style.display = 'inline-block';
      promoteBtn.textContent = 'You are not an admin. Click to promote yourself to admin.';
    }
    
    // Hide admin features
    const adminFeatures = document.querySelector('.admin-grid');
    const userManagement = document.querySelector('.trips-section');
    const analytics = document.querySelector('.analytics-section');
    
    if (adminFeatures) adminFeatures.style.display = 'none';
    if (userManagement) userManagement.style.display = 'none';
    if (analytics) analytics.style.display = 'none';
    
    return false;
  }
}

// API call helper with authentication
async function apiCallWithAuth(endpoint, options = {}) {
  const token = sessionStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'login.html';
    throw new Error('No authentication token');
  }

  const defaultOptions = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers }
  };

  const baseUrl = window.API_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}${endpoint}`, finalOptions);

  if (response.status === 401) {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
    if (window.showToast) window.showToast('Session expired — please log in again.', 'warning', 2400);
    setTimeout(() => { window.location.href = 'login.html'; }, 600);
    throw new Error('Unauthenticated');
  }

  if (!response.ok) {
    let error = {};
    try { error = await response.json(); } catch (_) {}
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

// Load admin dashboard data
async function loadAdminDashboard() {
  try {
    const data = await apiCallWithAuth('/admin/stats');
    
    // Update overview stats
    document.getElementById('total-users').textContent = data.users.total;
    document.getElementById('total-trips').textContent = data.trips.total;
    document.getElementById('total-items').textContent = data.items.total;
    
    // Hide new users/trips for now (not implemented in backend yet)
    document.getElementById('new-users').textContent = 'N/A';
    document.getElementById('new-trips').textContent = 'N/A';
    
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
  }
}

// Update overview statistics
function updateOverviewStats(overview) {
  const totalUsersEl = document.getElementById('total-users');
  const totalTripsEl = document.getElementById('total-trips');
  const totalItemsEl = document.getElementById('total-items');
  const newUsersEl = document.getElementById('new-users');
  const newTripsEl = document.getElementById('new-trips');
  
  if (totalUsersEl) totalUsersEl.textContent = overview.totalUsers || 0;
  if (totalTripsEl) totalTripsEl.textContent = overview.totalTrips || 0;
  if (totalItemsEl) totalItemsEl.textContent = overview.totalItems || 0;
  if (newUsersEl) newUsersEl.textContent = overview.newUsers || 0;
  if (newTripsEl) newTripsEl.textContent = overview.newTrips || 0;
}

// Update role distribution stats
function updateRoleStats(roleDistribution) {
  const container = document.getElementById('role-stats');
  if (!container || !roleDistribution) return;
  
  const total = roleDistribution.reduce((sum, r) => sum + r.count, 0);
  
  if (total === 0) {
    container.innerHTML = '<p class="no-data">No role data available</p>';
    return;
  }
  
  const roleColors = {
    'admin': '#c62828',
    'organizer': '#7b1fa2',
    'user': '#1565c0'
  };
  
  container.innerHTML = roleDistribution
    .sort((a, b) => b.count - a.count)
    .map(({ _id: role, count }) => {
      const percentage = Math.round((count / total) * 100);
      return `
        <div class="stat-bar">
          <span class="stat-bar-label">${escapeHtml(role)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width: ${percentage}%; background: ${roleColors[role] || 'var(--primary-color)'}"></div>
          </div>
          <span class="stat-bar-value">${count}</span>
        </div>
      `;
    }).join('');
}

// Update trip status distribution
function updateStatusStats(statusDistribution) {
  const container = document.getElementById('status-stats');
  if (!container || !statusDistribution) return;
  
  const total = statusDistribution.reduce((sum, s) => sum + s.count, 0);
  
  if (total === 0) {
    container.innerHTML = '<p class="no-data">No status data available</p>';
    return;
  }
  
  const statusColors = {
    'planning': '#ff9800',
    'active': '#4caf50',
    'completed': '#2196f3',
    'cancelled': '#f44336'
  };
  
  const statusLabels = {
    'planning': '📋 Planning',
    'active': '🏕️ Active',
    'completed': '✅ Completed',
    'cancelled': '❌ Cancelled'
  };
  
  container.innerHTML = statusDistribution
    .sort((a, b) => b.count - a.count)
    .map(({ _id: status, count }) => {
      const percentage = Math.round((count / total) * 100);
      return `
        <div class="stat-bar">
          <span class="stat-bar-label">${statusLabels[status] || escapeHtml(status)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width: ${percentage}%; background: ${statusColors[status] || 'var(--primary-color)'}"></div>
          </div>
          <span class="stat-bar-value">${count}</span>
        </div>
      `;
    }).join('');
}

// Update top users table
function updateTopUsers(topUsers) {
  const tbody = document.querySelector('#top-users-table tbody');
  if (!tbody || !topUsers) return;
  
  if (topUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No users yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = topUsers.map(user => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="role-badge role-${user.role}">${user.role}</span></td>
      <td>${user.stats?.totalTrips || 0}</td>
      <td>${user.stats?.totalItemsPacked || 0}</td>
    </tr>
  `).join('');
}

// Load all users for management
async function loadUsers(page = 1) {
  try {
    const roleFilter = document.getElementById('role-filter')?.value || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';
    
    let url = `/admin/users`;
    const data = await apiCallWithAuth(url);
    
    // Filter users locally (simplified approach)
    let filteredUsers = data.users || [];
    if (roleFilter) {
      filteredUsers = filteredUsers.filter(u => u.role === roleFilter);
    }
    if (statusFilter) {
      filteredUsers = filteredUsers.filter(u => u.isActive === (statusFilter === 'true'));
    }
    
    const tbody = document.querySelector('#users-table tbody');
    const pagination = document.getElementById('users-pagination');
    
    if (!tbody) return;
    
    if (filteredUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No users found</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }
    
    tbody.innerHTML = filteredUsers.map(user => `
      <tr>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="role-badge role-${user.role}">${user.role}</span></td>
        <td><span class="status-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(user.createdAt).toLocaleDateString()}</td>
        <td>N/A</td>
        <td>
          <button class="btn btn-small btn-edit" onclick="openRoleModal('${user.userId}', '${escapeHtml(user.name)}', '${user.role}')">Change Role</button>
          <button class="btn btn-small ${user.isActive ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserStatus('${user.userId}', ${!user.isActive})">
            ${user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');
    
    // Hide pagination for now (not implemented)
    if (pagination) pagination.innerHTML = '';
    
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

// Generate pagination HTML
function generatePagination(currentPage, totalPages, callback) {
  if (totalPages <= 1) return '';
  
  let html = '<div class="pagination-links">';
  
  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button class="btn btn-small ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" 
              onclick="${callback}(${i})">${i}</button>
    `;
  }
  
  html += '</div>';
  return html;
}

// Open role edit modal
function openRoleModal(userId, userName, currentRole) {
  currentEditUserId = userId;
  document.getElementById('role-modal-user').textContent = `Change role for: ${userName}`;
  document.getElementById('new-role').value = currentRole;
  document.getElementById('role-modal').style.display = 'block';
}

// Close role edit modal
function closeRoleModal() {
  document.getElementById('role-modal').style.display = 'none';
  currentEditUserId = null;
}

// Save user role
async function saveUserRole() {
  if (!currentEditUserId) return;
  
  const newRole = document.getElementById('new-role').value;
  
  try {
    await apiCallWithAuth(`/admin/users/${currentEditUserId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    
    closeRoleModal();
    loadUsers();
    (window.showToast ? window.showToast('User role updated.', 'success', 2000) : alert('User role updated successfully'));
  } catch (error) {
    console.error('Error updating role:', error);
    (window.showToast ? window.showToast('Failed to update user role.', 'error') : alert('Failed to update user role'));
  }
}

// Toggle user active status
async function toggleUserStatus(userId, isActive) {
  const action = isActive ? 'activate' : 'deactivate';
  const confirmed = window.showConfirm
    ? await window.showConfirm(`This will ${action} the user's account.`, { title: `${isActive ? 'Activate' : 'Deactivate'} user?`, confirmText: isActive ? 'Activate' : 'Deactivate', danger: !isActive })
    : confirm(`Are you sure you want to ${action} this user?`);
  if (!confirmed) return;

  try {
    await apiCallWithAuth(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });

    loadUsers();
    (window.showToast ? window.showToast(`User ${isActive ? 'activated' : 'deactivated'}.`, 'success', 2000) : alert(`User ${isActive ? 'activated' : 'deactivated'} successfully`));
  } catch (error) {
    console.error('Error updating user status:', error);
    (window.showToast ? window.showToast('Failed to update user status.', 'error') : alert('Failed to update user status'));
  }
}

// Filter change handlers
document.addEventListener('DOMContentLoaded', () => {
  const roleFilter = document.getElementById('role-filter');
  const statusFilter = document.getElementById('status-filter');
  
  if (roleFilter) {
    roleFilter.addEventListener('change', () => loadUsers(1));
  }
  
  if (statusFilter) {
    statusFilter.addEventListener('change', () => loadUsers(1));
  }
});
