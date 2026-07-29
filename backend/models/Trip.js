const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const tripSchema = new mongoose.Schema({
  tripId: { type: String, default: uuidv4, unique: true, index: true },
  userId: { type: String, required: true, index: true }, // owner's userId
  name: { type: String, required: true, trim: true },
  terrain: { type: String, required: true },
  season: { type: String, required: true },
  duration: { type: Number, required: true },
  groupSize: { type: Number, default: 1, min: 1, max: 50 },
  location: { type: String, default: null },
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
  // Kept as strings (YYYY-MM-DD / ISO) — matches what the frontend sends and
  // what the notification scheduler parses.
  startDate: { type: String, default: null },
  endDate: { type: String, default: null },
  // Free string: existing code uses 'planned', 'planning', 'active',
  // 'in_progress', 'completed', 'cancelled' — no enum to avoid breaking rows.
  status: { type: String, default: 'planned' },
  photoIndex: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Trip', tripSchema);
