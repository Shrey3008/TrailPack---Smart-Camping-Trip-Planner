// Admin Dashboard JavaScript

let currentEditUserId = null;

// Check if user has admin access
function checkAdminAccess() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role !== 'admin') {
    alert('Access denied. Admin privileges required.');
    window.location.href = 'dashboard.html';
    return false;
  }
  return true;
}

// Load admin dashboard data
async function loadAdminDashboard() {
  try {
    const data = await apiCallWithAuth('/trips/admin/dashboard');
    
    // Update overview stats
    updateOverviewStats(data.overview);
    
    // Update role distribution
    updateRoleStats(data.roleDistribution);
    
    // Update trip status distribution
    updateStatusStats(data.tripStatusDistribution);
    
    // Update top users
    updateTopUsers(data.topUsers);
    
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    showError('Failed to load admin dashboard data');
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
    
    let url = `/auth/users?page=${page}`;
    if (roleFilter) url += `&role=${roleFilter}`;
    if (statusFilter) url += `&isActive=${statusFilter}`;
    
    const data = await apiCallWithAuth(url);
    
    const tbody = document.querySelector('#users-table tbody');
    const pagination = document.getElementById('users-pagination');
    
    if (!tbody) return;
    
    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No users found</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }
    
    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="role-badge role-${user.role}">${user.role}</span></td>
        <td><span class="status-${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(user.createdAt).toLocaleDateString()}</td>
        <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
        <td>
          <button class="btn btn-small btn-edit" onclick="openRoleModal('${user._id}', '${escapeHtml(user.name)}', '${user.role}')">Change Role</button>
          <button class="btn btn-small ${user.isActive ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserStatus('${user._id}', ${!user.isActive})">
            ${user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');
    
    // Update pagination
    if (pagination) {
      pagination.innerHTML = generatePagination(data.currentPage, data.totalPages, 'loadUsers');
    }
    
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
    await apiCallWithAuth(`/auth/users/${currentEditUserId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    
    closeRoleModal();
    loadUsers();
    loadAdminDashboard();
    alert('User role updated successfully');
  } catch (error) {
    console.error('Error updating role:', error);
    alert('Failed to update user role');
  }
}

// Toggle user active status
async function toggleUserStatus(userId, isActive) {
  if (!confirm(`Are you sure you want to ${isActive ? 'activate' : 'deactivate'} this user?`)) {
    return;
  }
  
  try {
    await apiCallWithAuth(`/auth/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });
    
    loadUsers();
    alert(`User ${isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    console.error('Error updating user status:', error);
    alert('Failed to update user status');
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
