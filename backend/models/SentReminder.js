const mongoose = require('mongoose');

// Dedup ledger for the daily email scheduler (was TrailPack-Notifications
// in DynamoDB). The TTL index auto-deletes docs once expiresAt passes —
// same effect as DynamoDB's TTL attribute.
const sentReminderSchema = new mongoose.Schema({
  notificationId: { type: String, required: true, unique: true, index: true }, // `${userId}#${tripId}#${type}`
  userId: { type: String, required: true },
  tripId: { type: String, required: true },
  type: { type: String, required: true },
  sentAt: { type: String, default: () => new Date().toISOString() },
  expiresAt: { type: Date, required: true },
});

sentReminderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SentReminder', sentReminderSchema);
