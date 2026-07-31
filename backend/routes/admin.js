const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { User, Trip, Item } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

// Constant-time compare so the bootstrap token can't be guessed byte-by-byte
// from response timing. Length is compared first because timingSafeEqual
// throws on mismatched buffer lengths.
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Public-safe user shape for admin responses.
function adminUser(u) {
  if (!u) return null;
  const { password, securityAnswer, _id, __v, ...rest } = u;
  return rest;
}

// GET /admin/users - Get all users (admin only)
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const allUsers = await User.find({}).lean();
    const users = allUsers.map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt
    }));

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

    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: { role } },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user: adminUser(updated)
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

    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: { isActive } },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User status updated successfully',
      user: adminUser(updated)
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// GET /admin/stats - Get system statistics (admin only)
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalTrips = await Trip.countDocuments();
    const totalItems = await Item.countDocuments();

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers
      },
      trips: {
        total: totalTrips
      },
      items: {
        total: totalItems
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

    await User.deleteOne({ userId });

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

    // SECURITY: this route previously required nothing but a valid login and
    // unconditionally set role='admin' on the caller, so any registered user
    // could promote themselves and then list, re-role, deactivate or delete
    // every account. It is now a genuine one-time bootstrap:
    //
    //   1. disabled entirely unless ADMIN_SETUP_TOKEN is configured,
    //   2. the caller must present that exact token, and
    //   3. it only works while no administrator exists yet.
    const configured = process.env.ADMIN_SETUP_TOKEN;
    if (!configured) {
      // 404 rather than 403 so a disabled bootstrap isn't advertised.
      console.warn('[Admin Setup] Blocked: ADMIN_SETUP_TOKEN is not configured');
      return res.status(404).json({ message: 'Not found' });
    }

    const provided = (req.body && req.body.setupToken) || req.get('x-admin-setup-token') || '';
    if (!safeEquals(String(provided), String(configured))) {
      console.warn('[Admin Setup] Blocked: invalid setup token from user', userId);
      return res.status(403).json({ message: 'Invalid setup token' });
    }

    const existingAdmins = await User.countDocuments({ role: 'admin' });
    if (existingAdmins > 0) {
      console.warn('[Admin Setup] Blocked: an administrator already exists');
      return res.status(403).json({ message: 'An administrator already exists' });
    }

    console.log('[Admin Setup] Bootstrapping first administrator:', userId);

    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: { role: 'admin' } },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('[Admin Setup] Update successful');

    res.json({
      message: 'User promoted to admin successfully',
      user: adminUser(updated)
    });
  } catch (error) {
    console.error('[Admin Setup] Error promoting user to admin:', error);
    res.status(500).json({ message: 'Error promoting user to admin: ' + error.message });
  }
});

module.exports = router;
