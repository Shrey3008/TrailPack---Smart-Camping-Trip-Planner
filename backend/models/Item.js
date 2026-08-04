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
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
