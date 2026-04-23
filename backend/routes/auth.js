const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const {
  ScanCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { authenticate } = require('../middleware/auth');

const TABLE_NAME = process.env.DYNAMODB_USERS_TABLE || 'TrailPack-Users';
const TRIPS_TABLE = process.env.DYNAMODB_TABLE_NAME;

// Return the public-safe shape of a user row.
function publicUser(user) {
  if (!user) return null;
  const { password, PK, SK, ...rest } = user;
  return rest;
}

// POST /auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    // Check if email already exists using ScanCommand
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }));

    if (scanResult.Items && scanResult.Items.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate userId
    const userId = uuidv4();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user with PutCommand
    const item = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      userId,
      name,
      email,
      password: hashedPassword,
      role: 'user',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    }));

    // Fire-and-forget welcome email. No-ops safely when email isn't configured.
    try {
      const emailService = require('../services/emailService');
      emailService.sendWelcomeEmail(email, name).catch(err =>
        console.warn('[auth] welcome email failed:', err.message)
      );
    } catch (_) { /* service unavailable — ignore */ }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// POST /auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email using ScanCommand
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = scanResult.Items[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Sign JWT
    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// GET /auth/me - Current user profile + lightweight stats
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch a fresh copy of the user record (authenticate already did this but
    // we want the full row including any profile sub-fields).
    const userRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId },
    }));
    const user = publicUser(userRes.Item) || publicUser(req.user);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Build stats from the user's owned trips + their checklist items.
    let totalTrips = 0;
    let completedTrips = 0;
    let totalItemsPacked = 0;
    if (TRIPS_TABLE) {
      try {
        const tripsRes = await docClient.send(new QueryCommand({
          TableName: TRIPS_TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TRIP#' },
        }));
        const trips = tripsRes.Items || [];
        totalTrips = trips.length;
        completedTrips = trips.filter(t => t.status === 'completed').length;

        for (const trip of trips) {
          const itemsRes = await docClient.send(new QueryCommand({
            TableName: TRIPS_TABLE,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `TRIP#${trip.tripId}`, ':sk': 'ITEM#' },
          }));
          totalItemsPacked += (itemsRes.Items || []).filter(i => i.packed).length;
        }
      } catch (e) {
        console.warn('[/auth/me] stats aggregation failed:', e.message);
      }
    }

    res.json({
      user: {
        ...user,
        stats: {
          totalTrips,
          completedTrips,
          totalItemsPacked,
          joinedAt: user.createdAt || null,
        },
      },
    });
  } catch (error) {
    console.error('Error loading current user:', error);
    res.status(500).json({ message: 'Error loading profile' });
  }
});

// PUT /auth/profile - Update name / profile sub-object
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone, notificationSettings } = req.body || {};

    const sets = [];
    const names = {};
    const values = {};

    if (typeof name === 'string' && name.trim().length > 0) {
      sets.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = name.trim();
    }
    if (phone !== undefined) {
      sets.push('#profile.#phone = :phone');
      names['#profile'] = 'profile';
      names['#phone'] = 'phone';
      values[':phone'] = String(phone || '');
    }
    if (notificationSettings && typeof notificationSettings === 'object') {
      sets.push('#profile.#ns = :ns');
      names['#profile'] = 'profile';
      names['#ns'] = 'notificationSettings';
      values[':ns'] = notificationSettings;
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    // `profile` needs to exist as a map before nested updates succeed.
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET #profile = if_not_exists(#profile, :empty)',
      ExpressionAttributeNames: { '#profile': 'profile' },
      ExpressionAttributeValues: { ':empty': {} },
    }));

    const updateParams = {
      TableName: TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET ' + sets.join(', '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    };
    const result = await docClient.send(new UpdateCommand(updateParams));
    res.json({ user: publicUser(result.Attributes) });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// PUT /auth/password - Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const userRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId: req.user.userId },
    }));
    const user = userRes.Item;
    if (!user || !user.password) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId: req.user.userId },
      UpdateExpression: 'SET password = :p, passwordUpdatedAt = :t',
      ExpressionAttributeValues: { ':p': hashed, ':t': new Date().toISOString() },
    }));

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

module.exports = router;
