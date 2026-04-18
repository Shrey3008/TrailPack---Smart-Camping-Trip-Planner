const jwt = require('jsonwebtoken');
const dynamoDBService = require('../services/dynamoDBService');

const JWT_SECRET = process.env.JWT_SECRET || 'trailpack-dev-secret';

const authMiddleware = {
  // Verify JWT token and attach user to request
  authenticate: async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        console.log('[Auth] No token provided');
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }

      console.log('[Auth] Verifying token...');
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('[Auth] Token decoded, userId:', decoded.userId);
      
      const user = await dynamoDBService.getUserById(decoded.userId);
      console.log('[Auth] User lookup result:', user ? 'found' : 'not found');
      
      if (!user || user.isActive === false) {
        console.log('[Auth] User invalid - exists:', !!user, 'isActive:', user?.isActive);
        return res.status(401).json({ message: 'User not found or inactive' });
      }

      // Remove password from user object before attaching to request
      delete user.password;
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Check if user has required role
  authorize: (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ 
          message: 'Access denied. Insufficient permissions.' 
        });
      }

      next();
    };
  },

  // Optional authentication - doesn't fail if no token
  optionalAuth: async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await dynamoDBService.getUserById(decoded.userId);
        if (user && user.isActive !== false) {
          delete user.password;
          req.user = user;
        }
      }
      
      next();
    } catch (error) {
      next();
    }
  },

  // Generate JWT token
  generateToken: (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
  }
};

module.exports = authMiddleware;
