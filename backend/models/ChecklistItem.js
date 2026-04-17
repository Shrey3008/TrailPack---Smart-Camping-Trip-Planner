const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Clothing', 'Shelter', 'Food & Water', 'Safety', 'Tools']
  },
  packed: {
    type: Boolean,
    default: false
  }
});

checklistItemSchema.set('timestamps', true);

module.exports = mongoose.model('ChecklistItem', checklistItemSchema);
