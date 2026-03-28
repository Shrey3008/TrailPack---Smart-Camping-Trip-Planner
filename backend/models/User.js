const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'organizer'],
    default: 'user'
  },
  profile: {
    avatar: String,
    phone: String,
    preferredTerrain: [String],
    notificationSettings: {
      email: { type: Boolean, default: true },
      checklistReminders: { type: Boolean, default: true }
    }
  },
  stats: {
    totalTrips: { type: Number, default: 0 },
    totalItemsPacked: { type: Number, default: 0 },
    completedTrips: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update user stats
userSchema.methods.updateStats = async function() {
  const Trip = mongoose.model('Trip');
  const ChecklistItem = mongoose.model('ChecklistItem');
  
  const trips = await Trip.find({ userId: this._id });
  const tripIds = trips.map(t => t._id);
  
  const items = await ChecklistItem.find({ tripId: { $in: tripIds } });
  const packedItems = items.filter(item => item.packed);
  
  this.stats.totalTrips = trips.length;
  this.stats.totalItemsPacked = packedItems.length;
  
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
