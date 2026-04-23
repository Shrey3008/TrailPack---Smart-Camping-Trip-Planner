const jwt = require('jsonwebtoken');
const dynamoDBService = require('../services/dynamoDBService');

// In production a missing JWT_SECRET is a hard error. Locally / in tests we
// fall back to a well-known dev string so the app still boots.
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'trailpack-dev-secret';
})();

const authMiddleware = {
  // Verify JWT token and attach user to request
  authenticate: async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await dynamoDBService.getUserById(decoded.userId);

      if (!user || user.isActive === false) {
        return res.status(401).json({ message: 'User not found or inactive' });
      }

      // Remove password from user object before attaching to request
      delete user.password;
      // Attach role from token to user object
      user.role = decoded.role || user.role;
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
