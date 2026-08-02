const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');

const EXCLUDE = '-_id -__v';

// All notification routes require authentication
router.use(authenticate);

// Small helper — create an in-app notification for the current user.
async function createNotification(userId, type, message) {
  const doc = await Notification.create({ userId, type, message, read: false });
  const obj = doc.toObject();
  delete obj._id;
  delete obj.__v;
  return obj;
}

// GET /notifications - Get user notifications
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .select(EXCLUDE)
      .lean();
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to get notifications' });
  }
});

// GET /notifications/unread-count - Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.userId, read: false });
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

// GET /notifications/stats - Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const total = await Notification.countDocuments({ userId });
    const unread = await Notification.countDocuments({ userId, read: false });
    res.json({ total, unread, read: total - unread });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ message: 'Failed to get notification stats' });
  }
});

// PUT /notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      { notifId: req.params.id, userId: req.user.userId },
      { $set: { read: true } },
      { new: true }
    ).select(EXCLUDE).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// PUT /notifications/read-all - Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, read: false },
      { $set: { read: true } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
});

// DELETE /notifications/:id - Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const result = await Notification.deleteOne({ notifId: req.params.id, userId: req.user.userId });

    // This used to answer 200 "Notification deleted" unconditionally, so a
    // nonexistent id — or another user's notification, which the userId filter
    // correctly refuses to touch — came back looking like a successful delete.
    // The data was never at risk; the response was simply untrue.
    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// POST /notifications/trip-reminder - Create trip reminder
router.post('/trip-reminder', async (req, res) => {
  try {
    const { tripDetails, daysUntil } = req.body;
    if (!tripDetails || !daysUntil) {
      return res.status(400).json({ message: 'Trip details and days until are required' });
    }
    const message = `Trip reminder: ${tripDetails.name || 'Your trip'} is in ${daysUntil} days`;
    await createNotification(req.user.userId, 'trip-reminder', message);
    res.status(201).json({ message: 'Trip reminder created' });
  } catch (error) {
    console.error('Create trip reminder error:', error);
    res.status(500).json({ message: 'Failed to create trip reminder' });
  }
});

// POST /notifications/weather-alert - Create weather alert
router.post('/weather-alert', async (req, res) => {
  try {
    const { tripDetails, weatherData } = req.body;
    if (!tripDetails || !weatherData) {
      return res.status(400).json({ message: 'Trip details and weather data are required' });
    }
    const message = `Weather alert for ${tripDetails.name || 'your trip'}: ${weatherData.condition || 'Check weather conditions'}`;
    await createNotification(req.user.userId, 'weather-alert', message);
    res.status(201).json({ message: 'Weather alert created' });
  } catch (error) {
    console.error('Create weather alert error:', error);
    res.status(500).json({ message: 'Failed to create weather alert' });
  }
});

// POST /notifications/checklist-progress - Create checklist progress notification
router.post('/checklist-progress', async (req, res) => {
  try {
    const { tripDetails, progress } = req.body;
    if (!tripDetails || !progress) {
      return res.status(400).json({ message: 'Trip details and progress are required' });
    }
    const message = `Checklist progress for ${tripDetails.name || 'your trip'}: ${progress.packed}/${progress.total} items packed`;
    await createNotification(req.user.userId, 'checklist-progress', message);
    res.status(201).json({ message: 'Checklist progress notification created' });
  } catch (error) {
    console.error('Create checklist progress error:', error);
    res.status(500).json({ message: 'Failed to create checklist progress notification' });
  }
});

// POST /notifications/trip-invitation - Create trip invitation
router.post('/trip-invitation', async (req, res) => {
  try {
    const { recipientEmail, tripDetails, inviterName, joinLink } = req.body;
    if (!recipientEmail || !tripDetails || !inviterName || !joinLink) {
      return res.status(400).json({ message: 'Recipient email, trip details, inviter name, and join link are required' });
    }
    const message = `${inviterName} invited you to join trip: ${tripDetails.name || 'a trip'}`;
    await createNotification(req.user.userId, 'trip-invitation', message);
    res.status(201).json({ message: 'Trip invitation notification created' });
  } catch (error) {
    console.error('Create trip invitation error:', error);
    res.status(500).json({ message: 'Failed to create trip invitation' });
  }
});

// POST /notifications/welcome - Send welcome notification
router.post('/welcome', async (req, res) => {
  try {
    const { userName } = req.body;
    if (!userName) {
      return res.status(400).json({ message: 'User name is required' });
    }
    const message = `Welcome to TrailPack! 🏕️ Your smart camping adventure starts here, ${userName}!`;
    await createNotification(req.user.userId, 'welcome', message);
    res.status(201).json({ message: 'Welcome notification created' });
  } catch (error) {
    console.error('Send welcome notification error:', error);
    res.status(500).json({ message: 'Failed to send welcome notification' });
  }
});

module.exports = router;
