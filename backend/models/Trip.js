const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  terrain: {
    type: String,
    required: true,
    enum: ['Mountain', 'Forest', 'Desert']
  },
  season: {
    type: String,
    required: true,
    enum: ['Spring', 'Summer', 'Fall', 'Winter']
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
});

tripSchema.set('timestamps', true);

module.exports = mongoose.model('Trip', tripSchema);
