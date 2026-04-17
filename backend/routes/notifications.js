const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate } = require('../middleware/auth');
const { QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// All notification routes require authentication
router.use(authenticate);

// GET /notifications - Get user notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIF#'
      }
    }));
    
    const notifications = result.Items || [];
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to get notifications' });
  }
});

// GET /notifications/unread-count - Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'read = :read',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIF#',
        ':read': false
      }
    }));
    
    const count = (result.Items || []).length;
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
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIF#'
      }
    }));
    
    const notifications = result.Items || [];
    const total = notifications.length;
    const unread = notifications.filter(n => !n.read).length;
    const read = total - unread;
    
    res.json({ total, unread, read });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ message: 'Failed to get notification stats' });
  }
});

// PUT /notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const notifId = req.params.id;
    const userId = req.user.userId;
    
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`
      },
      UpdateExpression: 'SET read = :read',
      ExpressionAttributeValues: {
        ':read': true
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json(result.Attributes);
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// PUT /notifications/read-all - Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Query all unread notifications
    const queryResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'read = :read',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIF#',
        ':read': false
      }
    }));
    
    const unreadNotifications = queryResult.Items || [];
    
    // Update all to read
    const updatePromises = unreadNotifications.map(notif => {
      return docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: notif.SK
        },
        UpdateExpression: 'SET read = :read',
        ExpressionAttributeValues: {
          ':read': true
        }
      }));
    });
    
    await Promise.all(updatePromises);
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
});

// DELETE /notifications/:id - Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const notifId = req.params.id;
    const userId = req.user.userId;
    
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`
      }
    }));
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// POST /notifications/trip-reminder - Create trip reminder
router.post('/trip-reminder', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tripDetails, daysUntil } = req.body;
    
    if (!tripDetails || !daysUntil) {
      return res.status(400).json({ message: 'Trip details and days until are required' });
    }
    
    const notifId = uuidv4();
    const message = `Trip reminder: ${tripDetails.name || 'Your trip'} is in ${daysUntil} days`;
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`,
        notifId,
        userId,
        message,
        type: 'trip-reminder',
        read: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({ message: 'Trip reminder created' });
  } catch (error) {
    console.error('Create trip reminder error:', error);
    res.status(500).json({ message: 'Failed to create trip reminder' });
  }
});

// POST /notifications/weather-alert - Create weather alert
router.post('/weather-alert', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tripDetails, weatherData } = req.body;
    
    if (!tripDetails || !weatherData) {
      return res.status(400).json({ message: 'Trip details and weather data are required' });
    }
    
    const notifId = uuidv4();
    const message = `Weather alert for ${tripDetails.name || 'your trip'}: ${weatherData.condition || 'Check weather conditions'}`;
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`,
        notifId,
        userId,
        message,
        type: 'weather-alert',
        read: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({ message: 'Weather alert created' });
  } catch (error) {
    console.error('Create weather alert error:', error);
    res.status(500).json({ message: 'Failed to create weather alert' });
  }
});

// POST /notifications/checklist-progress - Create checklist progress notification
router.post('/checklist-progress', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tripDetails, progress } = req.body;
    
    if (!tripDetails || !progress) {
      return res.status(400).json({ message: 'Trip details and progress are required' });
    }
    
    const notifId = uuidv4();
    const message = `Checklist progress for ${tripDetails.name || 'your trip'}: ${progress.packed}/${progress.total} items packed`;
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`,
        notifId,
        userId,
        message,
        type: 'checklist-progress',
        read: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({ message: 'Checklist progress notification created' });
  } catch (error) {
    console.error('Create checklist progress error:', error);
    res.status(500).json({ message: 'Failed to create checklist progress notification' });
  }
});

// POST /notifications/trip-invitation - Create trip invitation
router.post('/trip-invitation', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { recipientEmail, tripDetails, inviterName, joinLink } = req.body;
    
    if (!recipientEmail || !tripDetails || !inviterName || !joinLink) {
      return res.status(400).json({ message: 'Recipient email, trip details, inviter name, and join link are required' });
    }
    
    const notifId = uuidv4();
    const message = `${inviterName} invited you to join trip: ${tripDetails.name || 'a trip'}`;
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`,
        notifId,
        userId,
        message,
        type: 'trip-invitation',
        read: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({ message: 'Trip invitation notification created' });
  } catch (error) {
    console.error('Create trip invitation error:', error);
    res.status(500).json({ message: 'Failed to create trip invitation' });
  }
});

// POST /notifications/welcome - Send welcome notification
router.post('/welcome', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userName } = req.body;
    
    if (!userName) {
      return res.status(400).json({ message: 'User name is required' });
    }
    
    const notifId = uuidv4();
    const message = `Welcome to TrailPack! 🏕️ Your smart camping adventure starts here, ${userName}!`;
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notifId}`,
        notifId,
        userId,
        message,
        type: 'welcome',
        read: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({ message: 'Welcome notification created' });
  } catch (error) {
    console.error('Send welcome notification error:', error);
    res.status(500).json({ message: 'Failed to send welcome notification' });
  }
});

module.exports = router;
