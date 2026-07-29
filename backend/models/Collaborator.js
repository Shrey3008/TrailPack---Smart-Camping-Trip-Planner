const mongoose = require('mongoose');

// Replaces both the PARTICIPANT# rows and the SHARED_TRIP# reverse-lookup
// rows from the DynamoDB single-table design — Mongo can query either
// direction ({ tripId } or { userId }) with the indexes below.
const collaboratorSchema = new mongoose.Schema({
  tripId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  email: { type: String, default: null, lowercase: true, trim: true },
  name: { type: String, default: null },
  invitedBy: { type: String, default: null },
  joinedAt: { type: String, default: () => new Date().toISOString() },
});

collaboratorSchema.index({ tripId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Collaborator', collaboratorSchema);
