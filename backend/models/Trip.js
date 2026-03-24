const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Trip', tripSchema);
