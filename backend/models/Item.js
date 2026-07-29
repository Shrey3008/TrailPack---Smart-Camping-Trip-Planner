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
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
