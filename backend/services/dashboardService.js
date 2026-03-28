const Trip = require('../models/Trip');
const ChecklistItem = require('../models/ChecklistItem');
const User = require('../models/User');

class DashboardService {
  // Get comprehensive dashboard stats for a user
  async getUserDashboard(userId) {
    const trips = await Trip.find({ userId }).sort({ createdAt: -1 });
    const tripIds = trips.map(t => t._id);
    
    // Get all checklist items for user's trips
    const allItems = await ChecklistItem.find({ tripId: { $in: tripIds } });
    
    // Calculate statistics
    const stats = {
      totalTrips: trips.length,
      activeTrips: trips.filter(t => t.status === 'active').length,
      completedTrips: trips.filter(t => t.status === 'completed').length,
      planningTrips: trips.filter(t => t.status === 'planning').length,
      totalItems: allItems.length,
      packedItems: allItems.filter(i => i.packed).length,
      overallProgress: allItems.length > 0 
        ? Math.round((allItems.filter(i => i.packed).length / allItems.length) * 100)
        : 0
    };

    // Calculate terrain distribution
    const terrainStats = {};
    trips.forEach(trip => {
      terrainStats[trip.terrain] = (terrainStats[trip.terrain] || 0) + 1;
    });

    // Calculate season distribution
    const seasonStats = {};
    trips.forEach(trip => {
      seasonStats[trip.season] = (seasonStats[trip.season] || 0) + 1;
    });

    // Get recent trips (last 5)
    const recentTrips = trips.slice(0, 5).map(trip => ({
      id: trip._id,
      name: trip.name,
      terrain: trip.terrain,
      season: trip.season,
      duration: trip.duration,
      status: trip.status,
      progress: this.calculateTripProgress(trip._id, allItems),
      createdAt: trip.createdAt
    }));

    // Get upcoming trips (trips with startDate in future)
    const now = new Date();
    const upcomingTrips = trips
      .filter(t => t.startDate && new Date(t.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 3)
      .map(trip => ({
        id: trip._id,
        name: trip.name,
        startDate: trip.startDate,
        daysUntil: Math.ceil((new Date(trip.startDate) - now) / (1000 * 60 * 60 * 24))
      }));

    return {
      stats,
      terrainStats,
      seasonStats,
      recentTrips,
      upcomingTrips
    };
  }

  // Calculate progress for a specific trip
  calculateTripProgress(tripId, allItems) {
    const tripItems = allItems.filter(item => item.tripId.toString() === tripId.toString());
    if (tripItems.length === 0) return 0;
    return Math.round((tripItems.filter(i => i.packed).length / tripItems.length) * 100);
  }

  // Get admin dashboard stats
  async getAdminDashboard() {
    const totalUsers = await User.countDocuments({ isActive: true });
    const totalTrips = await Trip.countDocuments();
    const totalItems = await ChecklistItem.countDocuments();
    
    // User role distribution
    const roleStats = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Trips by status
    const tripStatusStats = await Trip.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    
    const newTrips = await Trip.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Top active users
    const topUsers = await User.find({ isActive: true })
      .sort({ 'stats.totalTrips': -1 })
      .limit(5)
      .select('name email stats role');

    return {
      overview: {
        totalUsers,
        totalTrips,
        totalItems,
        newUsers,
        newTrips
      },
      roleDistribution: roleStats,
      tripStatusDistribution: tripStatusStats,
      topUsers
    };
  }
}

module.exports = new DashboardService();
