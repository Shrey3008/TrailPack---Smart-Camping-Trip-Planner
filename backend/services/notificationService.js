const { v4: uuidv4 } = require('uuid');

class NotificationService {
  constructor() {
    this.notifications = new Map(); // In-memory storage for demo
    this.userNotifications = new Map(); // userId -> notificationIds[]
  }

  // Create a new notification
  async createNotification(userId, type, title, message, data = {}, priority = 'medium') {
    const notification = {
      id: uuidv4(),
      userId,
      type, // 'info', 'success', 'warning', 'error', 'trip_reminder', 'weather_alert', 'checklist_progress'
      title,
      message,
      data,
      priority, // 'low', 'medium', 'high'
      read: false,
      createdAt: new Date().toISOString(),
      expiresAt: this.calculateExpiryDate(type)
    };

    // Store notification
    this.notifications.set(notification.id, notification);

    // Add to user's notification list
    if (!this.userNotifications.has(userId)) {
      this.userNotifications.set(userId, []);
    }
    this.userNotifications.get(userId).push(notification.id);

    // Clean up old notifications periodically
    this.cleanupOldNotifications(userId);

    return notification;
  }

  // Calculate expiry date based on notification type
  calculateExpiryDate(type) {
    const now = new Date();
    const expiryDays = {
      'trip_reminder': 7,
      'weather_alert': 3,
      'checklist_progress': 14,
      'info': 30,
      'success': 7,
      'warning': 14,
      'error': 30
    };

    const days = expiryDays[type] || 30;
    const expiryDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    return expiryDate.toISOString();
  }

  // Get all notifications for a user
  async getUserNotifications(userId, options = {}) {
    const {
      unreadOnly = false,
      type = null,
      limit = 50,
      offset = 0
    } = options;

    const userNotificationIds = this.userNotifications.get(userId) || [];
    let notifications = userNotificationIds
      .map(id => this.notifications.get(id))
      .filter(Boolean) // Remove undefined notifications
      .filter(notification => {
        // Filter by read status
        if (unreadOnly && notification.read) return false;
        
        // Filter by type
        if (type && notification.type !== type) return false;
        
        // Filter expired notifications
        if (new Date(notification.expiresAt) < new Date()) return false;
        
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by newest first

    // Apply pagination
    const paginatedNotifications = notifications.slice(offset, offset + limit);

    return {
      notifications: paginatedNotifications,
      total: notifications.length,
      unreadCount: notifications.filter(n => !n.read).length
    };
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    const notification = this.notifications.get(notificationId);
    
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    notification.read = true;
    notification.readAt = new Date().toISOString();

    return notification;
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    const userNotificationIds = this.userNotifications.get(userId) || [];
    
    userNotificationIds.forEach(id => {
      const notification = this.notifications.get(id);
      if (notification && notification.userId === userId) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
      }
    });

    return { success: true, markedCount: userNotificationIds.length };
  }

  // Delete a notification
  async deleteNotification(notificationId, userId) {
    const notification = this.notifications.get(notificationId);
    
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove from notifications map
    this.notifications.delete(notificationId);

    // Remove from user's notification list
    const userNotificationIds = this.userNotifications.get(userId) || [];
    const index = userNotificationIds.indexOf(notificationId);
    if (index > -1) {
      userNotificationIds.splice(index, 1);
    }

    return { success: true };
  }

  // Create trip reminder notification
  async createTripReminder(userId, tripDetails, daysUntil) {
    const title = daysUntil <= 1 ? 
      `Trip Tomorrow: ${tripDetails.name}` : 
      `Trip in ${daysUntil} days: ${tripDetails.name}`;
    
    const message = `Your camping trip "${tripDetails.name}" is coming up! Make sure you're fully packed and ready to go.`;

    return await this.createNotification(
      userId,
      'trip_reminder',
      title,
      message,
      {
        tripId: tripDetails.id,
        tripName: tripDetails.name,
        daysUntil,
        location: tripDetails.location,
        terrain: tripDetails.terrain
      },
      daysUntil <= 3 ? 'high' : 'medium'
    );
  }

  // Create weather alert notification
  async createWeatherAlert(userId, tripDetails, weatherData) {
    const hasWarnings = weatherData.alerts && weatherData.alerts.length > 0;
    const title = hasWarnings ? 
      `⚠️ Weather Alert: ${tripDetails.name}` : 
      `🌤️ Weather Update: ${tripDetails.name}`;
    
    const message = hasWarnings ?
      `Weather warnings issued for your trip location. Check conditions before departure.` :
      `Weather forecast updated for your upcoming trip.`;

    return await this.createNotification(
      userId,
      'weather_alert',
      title,
      message,
      {
        tripId: tripDetails.id,
        tripName: tripDetails.name,
        weatherData: weatherData.predictions?.slice(0, 3),
        alerts: weatherData.alerts
      },
      hasWarnings ? 'high' : 'medium'
    );
  }

  // Create checklist progress notification
  async createChecklistProgress(userId, tripDetails, progress) {
    const percentage = Math.round((progress.packed / progress.total) * 100);
    const isComplete = percentage === 100;

    const title = isComplete ?
      `✅ All Packed: ${tripDetails.name}` :
      `📋 Checklist Progress: ${tripDetails.name}`;
    
    const message = isComplete ?
      `Congratulations! You've packed all ${progress.total} items for your trip.` :
      `You've packed ${progress.packed} out of ${progress.total} items (${percentage}% complete).`;

    return await this.createNotification(
      userId,
      'checklist_progress',
      title,
      message,
      {
        tripId: tripDetails.id,
        tripName: tripDetails.name,
        progress: progress,
        percentage
      },
      isComplete ? 'success' : 'info'
    );
  }

  // Create trip invitation notification
  async createTripInvitation(userId, tripDetails, inviterName, inviterId) {
    const title = `🎉 Trip Invitation: ${tripDetails.name}`;
    const message = `${inviterName} has invited you to join their camping trip "${tripDetails.name}".`;

    return await this.createNotification(
      userId,
      'trip_invitation',
      title,
      message,
      {
        tripId: tripDetails.id,
        tripName: tripDetails.name,
        inviterName,
        inviterId,
        location: tripDetails.location,
        terrain: tripDetails.terrain,
        duration: tripDetails.duration
      },
      'medium'
    );
  }

  // Create success notification
  async createSuccessNotification(userId, title, message, data = {}) {
    return await this.createNotification(userId, 'success', title, message, data, 'low');
  }

  // Create error notification
  async createErrorNotification(userId, title, message, data = {}) {
    return await this.createNotification(userId, 'error', title, message, data, 'high');
  }

  // Create info notification
  async createInfoNotification(userId, title, message, data = {}) {
    return await this.createNotification(userId, 'info', title, message, data, 'low');
  }

  // Create warning notification
  async createWarningNotification(userId, title, message, data = {}) {
    return await this.createNotification(userId, 'warning', title, message, data, 'medium');
  }

  // Clean up old notifications
  cleanupOldNotifications(userId) {
    const userNotificationIds = this.userNotifications.get(userId) || [];
    const now = new Date();
    
    const validNotifications = userNotificationIds.filter(id => {
      const notification = this.notifications.get(id);
      if (!notification) return false;
      
      // Remove expired notifications
      if (new Date(notification.expiresAt) < now) {
        this.notifications.delete(id);
        return false;
      }
      
      return true;
    });

    this.userNotifications.set(userId, validNotifications);
  }

  // Get notification statistics for a user
  async getNotificationStats(userId) {
    const userNotificationIds = this.userNotifications.get(userId) || [];
    const notifications = userNotificationIds
      .map(id => this.notifications.get(id))
      .filter(Boolean)
      .filter(notification => new Date(notification.expiresAt) >= new Date());

    const stats = {
      total: notifications.length,
      unread: notifications.filter(n => !n.read).length,
      byType: {},
      byPriority: {
        low: 0,
        medium: 0,
        high: 0
      }
    };

    notifications.forEach(notification => {
      // Count by type
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      
      // Count by priority
      stats.byPriority[notification.priority]++;
    });

    return stats;
  }

  // Get real-time notification count (for badge updates)
  async getUnreadCount(userId) {
    const userNotificationIds = this.userNotifications.get(userId) || [];
    const now = new Date();
    
    return userNotificationIds
      .map(id => this.notifications.get(id))
      .filter(Boolean)
      .filter(notification => 
        !notification.read && 
        new Date(notification.expiresAt) >= now
      ).length;
  }
}

module.exports = new NotificationService();
