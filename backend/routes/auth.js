const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dynamoDBService = require('../services/dynamoDBService');
const { authenticate, authorize, generateToken } = require('../middleware/auth');

// POST /auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ 
        message: 'Email, password, and name are required' 
      });
    }

    // Check if user exists
    const existingUser = await dynamoDBService.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in DynamoDB
    const user = await dynamoDBService.createUser({
      email,
      password: hashedPassword,
      name,
      role: 'user'
    });

    // Generate token
    const token = generateToken(user.userId);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
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

    // Find user by email
    const user = await dynamoDBService.getUserByEmail(email);
    console.log('DEBUG login - email:', email);
    console.log('DEBUG login - user found:', !!user);
    console.log('DEBUG login - input password length:', password?.length);
    console.log('DEBUG login - stored password length:', user?.password?.length);
    
    if (!user || user.isActive === false) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    console.log('DEBUG login - comparing passwords...');
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('DEBUG login - password valid:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    await dynamoDBService.updateUser(user.userId, { 
      lastLogin: new Date().toISOString() 
    });

    // Generate token
    const token = generateToken(user.userId);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        profile: user.profile || {},
        stats: user.stats || {}
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// GET /auth/me - Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        profile: req.user.profile,
        stats: req.user.stats,
        isActive: req.user.isActive,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user data' });
  }
});

// PUT /auth/profile - Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, preferredTerrain, notificationSettings } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (phone !== undefined) updates['profile.phone'] = phone;
    if (preferredTerrain) updates['profile.preferredTerrain'] = preferredTerrain;
    if (notificationSettings) updates['profile.notificationSettings'] = notificationSettings;

    await dynamoDBService.updateUser(req.user.userId, updates);
    
    const updatedUser = await dynamoDBService.getUserById(req.user.userId);
    delete updatedUser.password;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// PUT /auth/password - Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }

    // Get user with password
    const user = await dynamoDBService.getUserByIdFull(req.user.userId);

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password and update
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await dynamoDBService.updateUser(user.userId, { password: hashedNewPassword });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// ADMIN ROUTES

// GET /auth/users - Get all users (admin only)
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 20 } = req.query;
    
    const filters = {};
    if (role) filters.role = role;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const allUsers = await dynamoDBService.getAllUsers(filters);
    
    // Remove passwords from all users
    const usersWithoutPasswords = allUsers.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    // Sort by createdAt descending
    const sortedUsers = usersWithoutPasswords.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    const count = allUsers.length;

    res.json({
      users: paginatedUsers,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// PUT /auth/users/:id/role - Update user role (admin only)
router.put('/users/:userId/role', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;
    
    if (!['admin', 'user', 'organizer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Check if user exists
    const user = await dynamoDBService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await dynamoDBService.updateUser(userId, { role });
    
    const updatedUser = await dynamoDBService.getUserById(userId);
    delete updatedUser.password;

    res.json({
      message: 'User role updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ message: 'Error updating user role' });
  }
});

// PUT /auth/users/:id/status - Activate/deactivate user (admin only)
router.put('/users/:userId/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const { userId } = req.params;

    // Check if user exists
    const user = await dynamoDBService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await dynamoDBService.updateUser(userId, { isActive });
    
    const updatedUser = await dynamoDBService.getUserById(userId);
    delete updatedUser.password;

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
});

module.exports = router;
