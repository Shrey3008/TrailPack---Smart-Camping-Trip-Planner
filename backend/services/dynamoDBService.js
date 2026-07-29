// Data service — now backed by MongoDB/Mongoose.
// Filename kept as dynamoDBService.js so existing requires
// (middleware/auth.js, services/dashboardService.js) don't change;
// the exported API is identical to the old DynamoDB version.
const { User, Trip, Item } = require('../models');

const EXCLUDE = '-_id -__v';

// Convert a freshly created Mongoose doc to a plain object like the old
// service returned.
function clean(doc) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  delete obj.__v;
  return obj;
}

const dbService = {
  // ---------- User operations ----------
  createUser: async (userData) => {
    const user = await User.create(userData);
    return clean(user);
  },

  getUserById: async (userId) => {
    return User.findOne({ userId }).select(EXCLUDE).lean();
  },

  getUserByEmail: async (email) => {
    if (!email) return null;
    return User.findOne({ email: String(email).toLowerCase().trim() }).select(EXCLUDE).lean();
  },

  updateUser: async (userId, updates) => {
    await User.updateOne({ userId }, { $set: updates });
  },

  // ---------- Trip operations ----------
  createTrip: async (userId, tripData) => {
    const trip = await Trip.create({
      userId: String(userId),
      name: String(tripData.name),
      terrain: String(tripData.terrain),
      season: String(tripData.season),
      duration: parseInt(tripData.duration),
      status: 'planning',
      ...(tripData.startDate ? { startDate: String(tripData.startDate) } : {}),
      ...(tripData.endDate ? { endDate: String(tripData.endDate) } : {}),
    });
    return clean(trip);
  },

  getTripById: async (tripId) => {
    return Trip.findOne({ tripId }).select(EXCLUDE).lean();
  },

  getTripsByUser: async (userId) => {
    return Trip.find({ userId }).select(EXCLUDE).lean();
  },

  updateTrip: async (tripId, updates) => {
    return Trip.findOneAndUpdate(
      { tripId },
      { $set: updates },
      { new: true }
    ).select(EXCLUDE).lean();
  },

  deleteTrip: async (tripId) => {
    await Trip.deleteOne({ tripId });
  },

  // ---------- Checklist item operations ----------
  createItem: async (tripId, itemData) => {
    const item = await Item.create({
      tripId: String(tripId),
      name: String(itemData.name || ''),
      category: String(itemData.category || ''),
      priority: String(itemData.priority || 'medium'),
      packed: false,
    });
    return clean(item);
  },

  getItemById: async (itemId) => {
    return Item.findOne({ itemId }).select(EXCLUDE).lean();
  },

  getItemsByTrip: async (tripId) => {
    return Item.find({ tripId }).select(EXCLUDE).lean();
  },

  updateItem: async (itemId, updates) => {
    return Item.findOneAndUpdate(
      { itemId },
      { $set: updates },
      { new: true }
    ).select(EXCLUDE).lean();
  },

  deleteItem: async (itemId) => {
    await Item.deleteOne({ itemId });
  },

  // ---------- Admin: users ----------
  getAllUsers: async (filters = {}) => {
    const query = {};
    if (filters.role) query.role = filters.role;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    return User.find(query).select(EXCLUDE).lean();
  },

  countUsers: async (filters = {}) => {
    const query = {};
    if (filters.role) query.role = filters.role;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    return User.countDocuments(query);
  },

  countTrips: async () => Trip.countDocuments(),

  countItems: async () => Item.countDocuments(),

  getUsersByRole: async () => {
    const stats = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: { $ifNull: ['$role', 'user'] }, count: { $sum: 1 } } },
    ]);
    return stats;
  },

  // ---------- Admin: trips ----------
  getAllTrips: async () => Trip.find({}).select(EXCLUDE).lean(),

  getTripsByStatus: async () => {
    const stats = await Trip.aggregate([
      { $group: { _id: { $ifNull: ['$status', 'planning'] }, count: { $sum: 1 } } },
    ]);
    return stats;
  },

  getRecentUsers: async (days = 30) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return User.find({ createdAt: { $gte: cutoff } }).select(EXCLUDE).lean();
  },

  getRecentTrips: async (days = 30) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return Trip.find({ createdAt: { $gte: cutoff } }).select(EXCLUDE).lean();
  },

  getTopUsers: async (limit = 5) => {
    const users = await User.find({ isActive: true }).select(EXCLUDE).lean();
    return users
      .sort((a, b) => (b.stats?.totalTrips || 0) - (a.stats?.totalTrips || 0))
      .slice(0, limit)
      .map(user => ({
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        stats: user.stats || { totalTrips: 0, totalItemsPacked: 0 },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      }));
  },

  getUserByIdFull: async (userId) => {
    return User.findOne({ userId }).select(EXCLUDE).lean();
  },
};

module.exports = dbService;
