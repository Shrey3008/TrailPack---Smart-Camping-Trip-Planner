const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Keeps the uuid-string `userId` from the DynamoDB era so JWTs and the
// frontend keep working unchanged (Mongo's _id is internal only).
const userSchema = new mongoose.Schema({
  userId: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash
  role: { type: String, enum: ['user', 'organizer', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  securityQuestion: { type: String, default: null },
  // Stored lowercase + trimmed (normalized at write time in routes/auth.js).
  securityAnswer: { type: String, default: null },
  passwordUpdatedAt: { type: String, default: null }, // ISO string, parity with old rows
  lastLogin: { type: String, default: null },
  // Password-reset grant issued by POST /auth/forgot/verify-answer and consumed
  // by POST /auth/forgot/reset-password. Only the SHA-256 hash of the token is
  // stored, so a database leak doesn't hand out working reset grants. Both
  // fields are cleared the moment the token is used, which is what makes the
  // grant single-use.
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
  profile: {
    phone: { type: String, default: '' },
    notificationSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
}, { timestamps: true }); // createdAt / updatedAt managed by Mongoose

module.exports = mongoose.model('User', userSchema);
