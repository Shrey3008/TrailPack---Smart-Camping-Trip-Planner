const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { authenticate } = require('../middleware/auth');

// All notification routes require authentication
router.use(authenticate);

// GET /notifications - Get user notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { unreadOnly, type, limit = 50, offset = 0 } = req.query;

    const options = {
      unreadOnly: unreadOnly === 'true',
      type: type || null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const notifications = await notificationService.getUserNotifications(userId, options);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      message: 'Failed to get notifications',
      error: error.message 
    });
  }
});

// GET /notifications/unread-count - Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ 
      message: 'Failed to get unread count',
      error: error.message 
    });
  }
});

// GET /notifications/stats - Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const stats = await notificationService.getNotificationStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ 
      message: 'Failed to get notification stats',
      error: error.message 
    });
  }
});

// PUT /notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;

    const notification = await notificationService.markAsRead(id, userId);

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ 
      message: 'Failed to mark notification as read',
      error: error.message 
    });
  }
});

// PUT /notifications/read-all - Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ 
      message: 'Failed to mark all notifications as read',
      error: error.message 
    });
  }
});

// DELETE /notifications/:id - Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;

    const result = await notificationService.deleteNotification(id, userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      message: 'Failed to delete notification',
      error: error.message 
    });
  }
});

// POST /notifications/trip-reminder - Create trip reminder
router.post('/trip-reminder', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { tripDetails, daysUntil } = req.body;

    if (!tripDetails || !daysUntil) {
      return res.status(400).json({ 
        message: 'Trip details and days until are required' 
      });
    }

    const notification = await notificationService.createTripReminder(
      userId,
      tripDetails,
      daysUntil
    );

    // Also send email reminder if daysUntil <= 3
    if (daysUntil <= 3) {
      try {
        await emailService.sendTripReminder(req.user.email, tripDetails, daysUntil);
      } catch (emailError) {
        console.error('Failed to send trip reminder email:', emailError);
      }
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Create trip reminder error:', error);
    res.status(500).json({ 
      message: 'Failed to create trip reminder',
      error: error.message 
    });
  }
});

// POST /notifications/weather-alert - Create weather alert
router.post('/weather-alert', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { tripDetails, weatherData } = req.body;

    if (!tripDetails || !weatherData) {
      return res.status(400).json({ 
        message: 'Trip details and weather data are required' 
      });
    }

    const notification = await notificationService.createWeatherAlert(
      userId,
      tripDetails,
      weatherData
    );

    // Also send email weather alert
    try {
      await emailService.sendWeatherAlert(req.user.email, tripDetails, weatherData);
    } catch (emailError) {
      console.error('Failed to send weather alert email:', emailError);
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Create weather alert error:', error);
    res.status(500).json({ 
      message: 'Failed to create weather alert',
      error: error.message 
    });
  }
});

// POST /notifications/checklist-progress - Create checklist progress notification
router.post('/checklist-progress', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { tripDetails, progress } = req.body;

    if (!tripDetails || !progress) {
      return res.status(400).json({ 
        message: 'Trip details and progress are required' 
      });
    }

    const notification = await notificationService.createChecklistProgress(
      userId,
      tripDetails,
      progress
    );

    // Send email if checklist is complete
    if (progress.packed === progress.total) {
      try {
        await emailService.sendChecklistCompletion(req.user.email, tripDetails, progress);
      } catch (emailError) {
        console.error('Failed to send checklist completion email:', emailError);
      }
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Create checklist progress error:', error);
    res.status(500).json({ 
      message: 'Failed to create checklist progress notification',
      error: error.message 
    });
  }
});

// POST /notifications/trip-invitation - Create trip invitation
router.post('/trip-invitation', async (req, res) => {
  try {
    const { recipientEmail, tripDetails, inviterName, joinLink } = req.body;

    if (!recipientEmail || !tripDetails || !inviterName || !joinLink) {
      return res.status(400).json({ 
        message: 'Recipient email, trip details, inviter name, and join link are required' 
      });
    }

    // Send email invitation
    await emailService.sendTripInvitation(
      recipientEmail,
      tripDetails,
      inviterName,
      joinLink
    );

    res.json({
      success: true,
      message: 'Trip invitation sent successfully'
    });
  } catch (error) {
    console.error('Send trip invitation error:', error);
    res.status(500).json({ 
      message: 'Failed to send trip invitation',
      error: error.message 
    });
  }
});

// POST /notifications/welcome - Send welcome email
router.post('/welcome', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ 
        message: 'User name is required' 
      });
    }

    // Send welcome email
    await emailService.sendWelcomeEmail(req.user.email, userName);

    // Create in-app welcome notification
    const notification = await notificationService.createSuccessNotification(
      userId,
      'Welcome to TrailPack! 🏕️',
      'Your smart camping adventure starts here. Start planning your first trip!',
      { type: 'welcome' }
    );

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Send welcome email error:', error);
    res.status(500).json({ 
      message: 'Failed to send welcome email',
      error: error.message 
    });
  }
});

module.exports = router;
