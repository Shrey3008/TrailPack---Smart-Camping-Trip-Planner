const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const itemSchema = new mongoose.Schema({
  itemId: { type: String, default: uuidv4, unique: true, index: true },
  tripId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, default: '' },
  priority: { type: String, default: 'medium' },
  source: { type: String, default: 'manual' }, // 'manual' | 'ai' | rule sources
  packed: { type: Boolean, default: false },
  // Who is carrying this, on a shared trip. A userId (matching User.userId and
  // Collaborator.userId), or null for unassigned — which is the state every
  // item starts in, including on solo trips where nobody ever assigns anything.
  // Indexed because the "Mine" filter and the per-person progress breakdown
  // both query by it.
  assignedTo: { type: String, default: null, index: true },
  // Weight in GRAMS. Integer, and null rather than 0 when unknown — the two are
  // genuinely different and the distinction has to survive to the UI. 0 means
  // "weighed, negligible"; null means "nobody has said", and a total that
  // silently treats the second as the first understates the pack.
  weight: { type: Number, default: null, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
