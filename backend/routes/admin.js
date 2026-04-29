const express = require('express');
const router = express.Router();
const docClient = require('../db.js');
const { authenticate, authorize } = require('../middleware/auth');
const { ScanCommand, UpdateCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE_NAME = process.env.DYNAMODB_USERS_TABLE || 'TrailPack-Users';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// GET /admin/users - Get all users (admin only)
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE_NAME
    }));
    
    const users = scanResult.Items?.map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt
    })) || [];
    
    res.json({
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// PUT /admin/users/:userId/role - Update user role (admin only)
router.put('/users/:userId/role', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['user', 'organizer', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "user", "organizer", or "admin"' });
    }

    // Prevent admins from demoting themselves and locking out admin access.
    if (userId === req.user.userId && role !== 'admin') {
      return res.status(400).json({ message: 'You cannot change your own admin role.' });
    }
    
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET #role = :role',
      ExpressionAttributeNames: {
        '#role': 'role'
      },
      ExpressionAttributeValues: {
        ':role': role
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json({
      message: 'User role updated successfully',
      user: result.Attributes
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Error updating user role' });
  }
});

// PUT /admin/users/:userId/status - Update user active status (admin only)
router.put('/users/:userId/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': isActive
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json({
      message: 'User status updated successfully',
      user: result.Attributes
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// GET /admin/stats - Get system statistics (admin only)
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Get user count
    const usersResult = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE_NAME
    }));
    
    // Get trip count
    const tripsResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':sk': 'TRIP#'
      }
    }));
    
    // Get item count
    const itemsResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':sk': 'ITEM#'
      }
    }));
    
    const users = usersResult.Items || [];
    const activeUsers = users.filter(u => u.isActive).length;
    
    res.json({
      users: {
        total: users.length,
        active: activeUsers,
        inactive: users.length - activeUsers
      },
      trips: {
        total: tripsResult.Items?.length || 0
      },
      items: {
        total: itemsResult.Items?.length || 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching statistics' });
  }
});

// DELETE /admin/users/:userId - Delete user (admin only)
router.delete('/users/:userId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent deleting yourself
    if (userId === req.user.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    await docClient.send(new DeleteCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId }
    }));
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// POST /admin/setup - Promote current user to admin (for initial setup)
router.post('/setup', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[Admin Setup] Attempting to promote user:', userId);
    console.log('[Admin Setup] Using table:', USERS_TABLE_NAME);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET #role = :role',
      ExpressionAttributeNames: {
        '#role': 'role'
      },
      ExpressionAttributeValues: {
        ':role': 'admin'
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    console.log('[Admin Setup] Update successful');
    
    res.json({
      message: 'User promoted to admin successfully',
      user: result.Attributes
    });
  } catch (error) {
    console.error('[Admin Setup] Error promoting user to admin:', error);
    console.error('[Admin Setup] Error details:', JSON.stringify(error, null, 2));
    res.status(500).json({ message: 'Error promoting user to admin: ' + error.message });
  }
});

module.exports = router;
