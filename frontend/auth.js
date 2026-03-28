// Authentication utilities

const API_URL = 'http://localhost:3000';

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
