const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_USERS_TABLE || 'TrailPack-Users';

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
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    }));

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
    console.log('[Login] Attempting login for:', email);
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }));

    console.log('[Login] Scan result:', scanResult);
    console.log('[Login] Items found:', scanResult.Items?.length || 0);

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('[Login] No user found with email:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = scanResult.Items[0];
    console.log('[Login] User found:', user.email);
    console.log('[Login] Full user object keys:', Object.keys(user));
    console.log('[Login] Hashed password from DB:', user.password);
    console.log('[Login] Password field exists:', !!user.password);
    console.log('[Login] Password type:', typeof user.password);
    
    // Compare password
    console.log('[Login] Attempting bcrypt compare...');
    console.log('[Login] Plain text password length:', password.length);
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('[Login] Password valid:', isValidPassword);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Sign JWT
    const token = jwt.sign(
      { userId: user.userId, email: user.email, role: user.role },
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

// GET /auth/debug-users - List all users (for debugging only)
router.get('/debug-users', async (req, res) => {
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));
    
    const users = scanResult.Items?.map(u => ({
      email: u.email,
      name: u.name,
      hasPassword: !!u.password,
      userId: u.userId
    })) || [];
    
    res.json({
      tableName: TABLE_NAME,
      userCount: users.length,
      users: users
    });
  } catch (error) {
    console.error('[Debug] Error listing users:', error);
    res.status(500).json({ message: 'Error listing users', error: error.message });
  }
});

module.exports = router;
