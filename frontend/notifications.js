// Notification System for TrailPack
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.dropdownOpen = false;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadNotifications();
    this.startPolling();
  }

  setupEventListeners() {
    // Notification bell click
    const bell = document.getElementById('notification-bell');
    if (bell) {
      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    // Mark all as read
    const markAllRead = document.getElementById('mark-all-read');
    if (markAllRead) {
      markAllRead.addEventListener('click', (e) => {
        e.stopPropagation();
        this.markAllAsRead();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.dropdownOpen && !e.target.closest('#notification-dropdown') && !e.target.closest('#notification-bell')) {
        this.closeDropdown();
      }
    });

    // Close dropdown when pressing Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dropdownOpen) {
        this.closeDropdown();
      }
    });
  }

  async loadNotifications() {
    try {
      const response = await apiCallWithAuth('/notifications');
      if (response.success) {
        this.notifications = response.data.notifications;
        this.unreadCount = response.data.unreadCount;
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  async loadUnreadCount() {
    try {
      const response = await apiCallWithAuth('/notifications/unread-count');
      if (response.success) {
        this.unreadCount = response.data.unreadCount;
        this.updateBadge();
      }
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }

  toggleDropdown() {
    if (this.dropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
      dropdown.style.display = 'block';
      this.dropdownOpen = true;
      this.renderNotifications();
    }
  }

  closeDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      this.dropdownOpen = false;
    }
  }

  renderNotifications() {
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <p>No notifications yet</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.notifications.map(notification => `
      <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
        <div class="notification-title">${this.escapeHtml(notification.title)}</div>
        <div class="notification-message">${this.escapeHtml(notification.message)}</div>
        <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
      </div>
    `).join('');

    // Add click handlers to notification items
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const notificationId = item.dataset.id;
        this.handleNotificationClick(notificationId);
      });
    });
  }

  async handleNotificationClick(notificationId) {
    // Mark as read
    await this.markAsRead(notificationId);
    
    // Handle notification action based on type
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      this.handleNotificationAction(notification);
    }
  }

  handleNotificationAction(notification) {
    switch (notification.type) {
      case 'trip_reminder':
      case 'weather_alert':
      case 'checklist_progress':
        if (notification.data?.tripId) {
          window.location.href = `checklist.html?trip=${notification.data.tripId}`;
        }
        break;
      case 'trip_invitation':
        // Handle trip invitation
        this.handleTripInvitation(notification);
        break;
      default:
        // Default action - just close dropdown
        this.closeDropdown();
    }
  }

  handleTripInvitation(notification) {
    // Create invitation modal
    const modal = this.createInvitationModal(notification);
    document.body.appendChild(modal);
    modal.style.display = 'flex';
  }

  createInvitationModal(notification) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎉 Trip Invitation</h3>
        <p>${notification.data.inviterName} has invited you to join:</p>
        <div class="trip-preview">
          <h4>${notification.data.tripName}</h4>
          <p><strong>Location:</strong> ${notification.data.location || 'Not specified'}</p>
          <p><strong>Terrain:</strong> ${notification.data.terrain}</p>
          <p><strong>Duration:</strong> ${notification.data.duration} days</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="accept-invitation">Accept</button>
          <button class="btn btn-secondary" id="decline-invitation">Decline</button>
        </div>
      </div>
    `;

    // Add event listeners
    modal.querySelector('#accept-invitation').addEventListener('click', () => {
      this.acceptInvitation(notification.id);
      modal.remove();
    });

    modal.querySelector('#decline-invitation').addEventListener('click', () => {
      this.declineInvitation(notification.id);
      modal.remove();
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    return modal;
  }

  async acceptInvitation(notificationId) {
    try {
      // API call to accept invitation would go here
      await this.markAsRead(notificationId);
      this.showNotification('success', 'Invitation accepted! Welcome to the trip.');
    } catch (error) {
      this.showNotification('error', 'Failed to accept invitation');
    }
  }

  async declineInvitation(notificationId) {
    try {
      // API call to decline invitation would go here
      await this.markAsRead(notificationId);
      this.showNotification('info', 'Invitation declined');
    } catch (error) {
      this.showNotification('error', 'Failed to decline invitation');
    }
  }

  async markAsRead(notificationId) {
    try {
      await apiCallWithAuth(`/notifications/${notificationId}/read`, { method: 'PUT' });
      
      // Update local state
      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async markAllAsRead() {
    try {
      await apiCallWithAuth('/notifications/read-all', { method: 'PUT' });
      
      // Update local state
      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
      this.updateUI();
      this.renderNotifications();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }

  updateUI() {
    this.updateBadge();
    this.renderNotifications();
  }

  updateBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-message">${message}</div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  startPolling() {
    // Poll for new notifications every 30 seconds
    setInterval(() => {
      this.loadUnreadCount();
    }, 30000);
  }

  // Public method to create notifications from other parts of the app
  async createNotification(type, title, message, data = {}) {
    try {
      const response = await apiCallWithAuth('/notifications', {
        method: 'POST',
        body: JSON.stringify({ type, title, message, data })
      });
      
      if (response.success) {
        this.notifications.unshift(response.data);
        this.unreadCount++;
        this.updateUI();
        this.showNotification(type, message);
      }
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }
}

// Initialize notification manager when DOM is ready
let notificationManager;
document.addEventListener('DOMContentLoaded', () => {
  notificationManager = new NotificationManager();
});

// Export for use in other files
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;
