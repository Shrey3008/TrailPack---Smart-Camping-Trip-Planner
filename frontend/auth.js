// Authentication utilities

// Detect environment and set API URL
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocalhost
  ? 'http://localhost:3000'  // Local development
  : 'http://trailpack-prod-env-v2.eba-4zfgqhmh.us-east-1.elasticbeanstalk.com';  // AWS Elastic Beanstalk


// Check if user is authenticated
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  
  // Update UI with user info
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.name) {
    const userGreeting = document.getElementById('user-name');
    if (userGreeting) {
      userGreeting.textContent = `Hello, ${escapeHtml(user.name)}`;
    }
  }
  
  // Show admin link if user is admin
  if (user.role === 'admin') {
    const adminLink = document.getElementById('admin-link');
    if (adminLink) {
      adminLink.style.display = 'inline';
      adminLink.href = 'admin.html';
    }
  }
  
  // Show organizer link if user is organizer or admin
  if (user.role === 'organizer' || user.role === 'admin') {
    const organizerLink = document.getElementById('organizer-link');
    if (organizerLink) {
      organizerLink.style.display = 'inline';
      organizerLink.href = 'organizer.html';
    }
  }
  
  return true;
}

// Get auth headers for API calls
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// API call with auth
async function apiCallWithAuth(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers
      }
    });
    
    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Handle logout
function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// Setup logout button
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
});

// Escape HTML helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
