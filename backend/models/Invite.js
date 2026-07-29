const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const inviteSchema = new mongoose.Schema({
  inviteId: { type: String, default: uuidv4, unique: true, index: true },
  tripId: { type: String, required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  token: { type: String, required: true, unique: true, index: true },
  invitedBy: { type: String, default: null },
  invitedByName: { type: String, default: null },
  status: { type: String, default: 'pending' }, // 'pending' | 'accepted'
  expiresAt: { type: String, required: true }, // ISO string, checked in code
  acceptedBy: { type: String, default: null },
  acceptedAt: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);
