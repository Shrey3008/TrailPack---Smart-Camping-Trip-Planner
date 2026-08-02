const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, Trip, Item } = require('../models');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { ipLimiter, credentialLimiter } = require('../middleware/rateLimit');

// Return the public-safe shape of a user row.
function publicUser(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  const { password, securityAnswer, _id, __v, ...rest } = obj;
  return rest;
}

// Allowed security questions — kept in sync with the dropdown in
// register.html. Backend validates the value to prevent arbitrary
// strings from being persisted as a "question".
const ALLOWED_SECURITY_QUESTIONS = new Set([
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother's maiden name?",
  'What was your elementary school name?',
  'What was the make of your first car?',
]);

// Normalize a security answer the same way on register, verify, and
// any future migrations so comparisons are deterministic.
function normalizeAnswer(answer) {
  return String(answer == null ? '' : answer).toLowerCase().trim();
}

// Look up a single user row by email. Centralised so register, login
// and the forgot-password flow all behave identically.
async function findUserByEmail(email) {
  if (!email) return null;
  return User.findOne({ email: String(email).toLowerCase().trim() }).lean();
}

// Password-reset grants. Only the hash goes to the database — see User.js.
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// POST /auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, securityQuestion, securityAnswer } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }
    if (!securityQuestion || !securityAnswer) {
      return res.status(400).json({ message: 'Security question and answer are required' });
    }
    if (!ALLOWED_SECURITY_QUESTIONS.has(securityQuestion)) {
      return res.status(400).json({ message: 'Invalid security question' });
    }
    const normalizedAnswer = normalizeAnswer(securityAnswer);
    if (!normalizedAnswer) {
      return res.status(400).json({ message: 'Security answer cannot be empty' });
    }

    // Check if email already exists
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'user',
      isActive: true,
      // Security question is stored verbatim; the answer is stored as
      // lowercase + trimmed so comparisons in /auth/forgot/verify-answer
      // are deterministic regardless of casing/whitespace at recovery time.
      securityQuestion,
      securityAnswer: normalizedAnswer,
    });

    // Fire-and-forget welcome email. No-ops safely when email isn't configured.
    try {
      const emailService = require('../services/emailService');
      emailService.sendWelcomeEmail(email, name).catch(err =>
        console.warn('[auth] welcome email failed:', err.message)
      );
    } catch (_) { /* service unavailable — ignore */ }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    // Duplicate-key safety net (unique index on email).
    if (error && error.code === 11000) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// POST /auth/login - Login user
router.post('/login', ipLimiter, credentialLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Sign JWT.
    //
    // The role is deliberately NOT in the payload. It used to be, and
    // middleware/auth.js preferred the token's copy over the database's, so
    // changing someone's role had no effect until their 7-day token expired —
    // a demoted administrator kept full administrative access. The role now
    // lives in exactly one place: the user row, read fresh on every request.
    //
    // JWT_SECRET comes from the middleware so signing and verification can
    // never disagree about which secret is in force.
    const token = jwt.sign(
      { userId: user.userId },
      JWT_SECRET,
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
    const userDoc = await User.findOne({ userId }).lean();
    const user = publicUser(userDoc) || publicUser(req.user);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Build stats from the user's owned trips + their checklist items.
    let totalTrips = 0;
    let completedTrips = 0;
    let totalItemsPacked = 0;
    try {
      const trips = await Trip.find({ userId }).select('tripId status').lean();
      totalTrips = trips.length;
      completedTrips = trips.filter(t => t.status === 'completed').length;

      const tripIds = trips.map(t => t.tripId);
      if (tripIds.length > 0) {
        totalItemsPacked = await Item.countDocuments({ tripId: { $in: tripIds }, packed: true });
      }
    } catch (e) {
      console.warn('[/auth/me] stats aggregation failed:', e.message);
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

    const updates = {};

    if (typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      updates['profile.phone'] = String(phone || '');
    }
    if (notificationSettings && typeof notificationSettings === 'object') {
      updates['profile.notificationSettings'] = notificationSettings;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: updates },
      { new: true }
    ).lean();

    res.json({ user: publicUser(updated) });
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

    const user = await User.findOne({ userId: req.user.userId }).lean();
    if (!user || !user.password) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.updateOne(
      { userId: req.user.userId },
      { $set: { password: hashed, passwordUpdatedAt: new Date().toISOString() } }
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

/* ============================================================
   Forgot-password flow (security-question based, no email).

   SECURITY: this flow used to be three independent, stateless
   endpoints, and /forgot/reset-password accepted { email,
   newPassword } on its own — it never checked that the caller had
   answered the security question. "Verified" lived only in the
   SPA's memory, so anyone who knew an email address could reset
   that account's password with a single request and log in as the
   victim. Verified exploitable against production before the fix.

   The step that proves knowledge of the secret now issues the
   grant that authorises the step that uses it:

     get-question   -> which question to answer (no secrets out)
     verify-answer  -> on success, a 10-minute single-use resetToken
     reset-password -> requires that resetToken; consumes it

   Only the SHA-256 hash of the token is stored (see User.js), and
   both token fields are cleared as part of the same update that
   writes the new password, so a grant cannot be replayed.
   ============================================================ */

// POST /auth/forgot/get-question
// Look up a user by email and return their security question.
// Never returns the answer.
router.post('/forgot/get-question', ipLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email' });
    }
    if (!user.securityQuestion) {
      // Pre-existing accounts created before this feature shipped
      // won't have a question stored. Surface that explicitly.
      return res.status(409).json({
        message: 'This account has no security question on file. Please contact support.',
      });
    }
    res.json({ securityQuestion: user.securityQuestion });
  } catch (error) {
    console.error('forgot/get-question error:', error);
    res.status(500).json({ message: 'Error looking up account' });
  }
});

// POST /auth/forgot/verify-answer
// Compare the lowercase+trimmed answer against the stored value. Always returns
// 200 with { success: boolean } so the frontend can surface a clean message
// without dealing with HTTP status branching. On success it also returns the
// short-lived resetToken that /forgot/reset-password requires.
router.post('/forgot/verify-answer', ipLimiter, credentialLimiter, async (req, res) => {
  try {
    const { email, answer } = req.body || {};
    if (!email || answer == null) {
      return res.status(400).json({ message: 'Email and answer are required' });
    }
    const user = await findUserByEmail(email);
    if (!user || !user.securityAnswer) {
      // A rejected attempt, even though the status is 200 — tell the rate
      // limiter so it counts against the quota. See middleware/rateLimit.js.
      res.locals.authAttemptFailed = true;
      return res.json({ success: false });
    }
    // Constant-time compare: both sides are already normalised to lowercase +
    // trimmed, so a length-guarded timingSafeEqual is a straight swap for ===.
    const provided = Buffer.from(normalizeAnswer(answer));
    const stored = Buffer.from(user.securityAnswer);
    const success = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);

    if (!success) {
      res.locals.authAttemptFailed = true;
      return res.json({ success: false });
    }

    // Issue the grant. Any previously issued token for this account is
    // overwritten, so only the most recent verification is live.
    const resetToken = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { userId: user.userId },
      {
        $set: {
          passwordResetTokenHash: hashResetToken(resetToken),
          passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }
    );

    res.json({ success: true, resetToken, expiresInSeconds: RESET_TOKEN_TTL_MS / 1000 });
  } catch (error) {
    console.error('forgot/verify-answer error:', error);
    res.status(500).json({ message: 'Error verifying answer' });
  }
});

// POST /auth/forgot/reset-password
// Consumes the single-use grant from /forgot/verify-answer and writes the new
// password. Mirrors the authenticated /auth/password endpoint otherwise.
router.post('/forgot/reset-password', ipLimiter, credentialLimiter, async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and newPassword are required' });
    }
    if (!resetToken) {
      return res.status(400).json({ message: 'resetToken is required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    // Look the user up *by the grant*, not by email alone. A wrong, expired,
    // already-used or someone else's token finds nothing and is refused —
    // deliberately with one generic 401 so this can't be used to probe which
    // of those it was, or which emails exist.
    const user = await User.findOne({
      email: String(email).toLowerCase().trim(),
      passwordResetTokenHash: hashResetToken(resetToken),
      passwordResetExpiresAt: { $gt: new Date() },
    }).lean();

    if (!user) {
      return res.status(401).json({
        message: 'This password reset link is invalid or has expired. Please start again.',
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    // Clearing the grant in the same update is what makes it single-use.
    await User.updateOne(
      { userId: user.userId },
      {
        $set: {
          password: hashed,
          passwordUpdatedAt: new Date().toISOString(),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      }
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('forgot/reset-password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

module.exports = router;
