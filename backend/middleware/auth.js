const jwt = require('jsonwebtoken');
const dataService = require('../services/dataService');

// In production a missing JWT_SECRET is a hard error. Locally / in tests we
// fall back to a well-known dev string so the app still boots.
//
// Production additionally requires the secret to be long enough to be worth
// something. The deployed value used to be `trailpack2026secret` — guessable
// from the project name, and anyone who guesses it can mint a token for any
// user. 32 characters is the floor; generate one with:
//
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const MIN_PRODUCTION_SECRET_LENGTH = 32;

const JWT_SECRET = (() => {
  const configured = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!configured) {
      throw new Error('JWT_SECRET must be set in production');
    }
    if (configured.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production ` +
        `(got ${configured.length}). Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    return configured;
  }
  return configured || 'trailpack-dev-secret';
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
      const user = await dataService.getUserById(decoded.userId);

      if (!user || user.isActive === false) {
        return res.status(401).json({ message: 'User not found or inactive' });
      }

      // Remove password from user object before attaching to request
      delete user.password;
      // The role is whatever the database says right now. This line used to be
      // `user.role = decoded.role || user.role`, which let a stale token keep
      // asserting a role the user no longer has — demoting an administrator did
      // nothing until their token expired up to 7 days later. Tokens no longer
      // carry a role at all; if an old one does, it is ignored.
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
        const user = await dataService.getUserById(decoded.userId);
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

// JWT_SECRET is exported so routes that *sign* tokens use the same resolved
// value this middleware *verifies* with. routes/auth.js previously read
// process.env.JWT_SECRET directly, so in any environment without the variable
// set, verification used the dev fallback while signing threw.
module.exports = { ...authMiddleware, JWT_SECRET };
