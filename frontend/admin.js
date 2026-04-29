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
    
    // Backend doesn't track "new this month" yet — show an em-dash so the
    // card reads as intentionally absent rather than failed.
    document.getElementById('new-users').textContent = '—';
    document.getElementById('new-trips').textContent = '—';
    
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
        <td>—</td>
        <td>
          <span class="role-dd" data-role-dd>
            <button type="button"
                    class="btn btn-small btn-edit role-dd-trigger"
                    aria-haspopup="menu"
                    aria-expanded="false"
                    onclick="toggleRolePopover(this, '${user.userId}', '${user.role}')">
              Change Role <span class="role-dd-caret" aria-hidden="true">▾</span>
            </button>
            <div class="role-dd-menu" role="menu" hidden>
              <button type="button" class="role-dd-item${user.role === 'user' ? ' is-current' : ''}" role="menuitem" data-role="user">
                <span class="role-badge role-user">user</span>
                ${user.role === 'user' ? '<span class="role-dd-check" aria-hidden="true">✓</span>' : ''}
              </button>
              <button type="button" class="role-dd-item${user.role === 'organizer' ? ' is-current' : ''}" role="menuitem" data-role="organizer">
                <span class="role-badge role-organizer">organizer</span>
                ${user.role === 'organizer' ? '<span class="role-dd-check" aria-hidden="true">✓</span>' : ''}
              </button>
              <button type="button" class="role-dd-item${user.role === 'admin' ? ' is-current' : ''}" role="menuitem" data-role="admin">
                <span class="role-badge role-admin">admin</span>
                ${user.role === 'admin' ? '<span class="role-dd-check" aria-hidden="true">✓</span>' : ''}
              </button>
            </div>
          </span>
          <button class="btn btn-small btn-danger" onclick="deleteUserAccount('${user.userId}', '${escapeHtml(user.name).replace(/'/g, "\\'")}')">
            Deactivate
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

/* ============================================================
   Inline Change-Role popover
   Replaces the old centered modal with a dropdown anchored to
   each row's "Change Role" pill. Single popover open at a time.
   Click-outside or Escape closes it. Selecting a role calls the
   PUT /admin/users/:id/role endpoint and reloads the table.
   ============================================================ */

// Close any currently-open role popover.
function closeAllRolePopovers() {
  document.querySelectorAll('[data-role-dd] .role-dd-menu:not([hidden])').forEach(menu => {
    menu.hidden = true;
    const dd = menu.closest('[data-role-dd]');
    dd?.classList.remove('is-open');
    const trigger = dd?.querySelector('.role-dd-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

// Open or close the popover anchored to `triggerBtn`.
function toggleRolePopover(triggerBtn, userId, currentRole) {
  const dd = triggerBtn.closest('[data-role-dd]');
  if (!dd) return;
  const menu = dd.querySelector('.role-dd-menu');
  if (!menu) return;

  const isOpen = !menu.hidden;

  // Close every other open popover first so only one is visible.
  closeAllRolePopovers();

  if (isOpen) return; // toggle off if it was already open

  // Stash context on the menu so the delegated item handler knows what to PUT.
  menu.dataset.userId = userId;
  menu.dataset.currentRole = currentRole;

  menu.hidden = false;
  dd.classList.add('is-open');
  triggerBtn.setAttribute('aria-expanded', 'true');

  // Focus the current role for keyboard users.
  const focusEl = menu.querySelector('.role-dd-item.is-current') || menu.querySelector('.role-dd-item');
  setTimeout(() => focusEl?.focus(), 0);
}

// Apply the chosen role: PUT to backend, toast, reload.
async function applyRoleChange(userId, newRole, currentRole) {
  closeAllRolePopovers();
  if (!userId || !newRole || newRole === currentRole) return;

  try {
    await apiCallWithAuth(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    loadUsers();
    (window.showToast ? window.showToast(`Role updated to ${newRole}.`, 'success', 2000) : alert('User role updated successfully'));
  } catch (error) {
    console.error('Error updating role:', error);
    const msg = (error && error.message) ? error.message : 'Failed to update user role.';
    (window.showToast ? window.showToast(msg, 'error') : alert(msg));
  }
}

// Delegated handlers: one set for the whole document so we don't re-bind
// every time the users table re-renders.
document.addEventListener('click', (e) => {
  const item = e.target.closest('.role-dd-item');
  if (item) {
    const menu = item.closest('.role-dd-menu');
    if (menu) {
      applyRoleChange(menu.dataset.userId, item.dataset.role, menu.dataset.currentRole);
    }
    return;
  }
  // Click outside any open popover closes it.
  if (!e.target.closest('[data-role-dd]')) {
    closeAllRolePopovers();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllRolePopovers();
});

// Permanently delete a user account.
// Per product spec: "Deactivate" prompts for confirmation, then permanently
// removes the account from DynamoDB so the user can no longer log in. The
// user must sign up again to regain access.
async function deleteUserAccount(userId, userName) {
  const label = userName ? `"${userName}"` : 'this user';
  const confirmed = window.showConfirm
    ? await window.showConfirm(
        `This permanently deletes ${label}'s account. They will no longer be able to log in and must sign up again to regain access.`,
        { title: 'Deactivate user?', confirmText: 'Yes, deactivate', cancelText: 'No, cancel', danger: true }
      )
    : confirm(`Permanently delete ${label}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await apiCallWithAuth(`/admin/users/${userId}`, {
      method: 'DELETE'
    });

    loadUsers();
    (window.showToast ? window.showToast('User account deactivated and deleted.', 'success', 2500) : alert('User account deactivated and deleted'));
  } catch (error) {
    console.error('Error deleting user:', error);
    const msg = (error && error.message) ? error.message : 'Failed to deactivate user.';
    (window.showToast ? window.showToast(msg, 'error') : alert(msg));
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
