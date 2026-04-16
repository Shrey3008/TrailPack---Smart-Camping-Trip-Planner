const dynamoDBService = require('./dynamoDBService');

class DashboardService {
  // Get comprehensive dashboard stats for a user
  async getUserDashboard(userId) {
    const trips = await dynamoDBService.getTripsByUser(userId);
    
    // Get all checklist items for user's trips
    const allItemsPromises = trips.map(trip => dynamoDBService.getItemsByTrip(trip.tripId));
    const allItemsArrays = await Promise.all(allItemsPromises);
    const allItems = allItemsArrays.flat();
    
    // Calculate statistics
    const stats = {
      totalTrips: trips.length,
      activeTrips: trips.filter(t => t.status === 'active').length,
      completedTrips: trips.filter(t => t.status === 'completed').length,
      planningTrips: trips.filter(t => t.status === 'planning').length,
      totalItems: allItems.length,
      packedItems: allItems.filter(i => i.isChecked || i.packed).length,
      overallProgress: allItems.length > 0 
        ? Math.round((allItems.filter(i => i.isChecked || i.packed).length / allItems.length) * 100)
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

    // Sort trips by createdAt (descending)
    const sortedTrips = trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get recent trips (last 5)
    const recentTrips = sortedTrips.slice(0, 5).map(trip => ({
      id: trip.tripId,
      name: trip.name,
      terrain: trip.terrain,
      season: trip.season,
      duration: trip.duration,
      status: trip.status,
      progress: this.calculateTripProgress(trip.tripId, allItems),
      createdAt: trip.createdAt
    }));

    // Get upcoming trips (trips with startDate in future)
    const now = new Date();
    const upcomingTrips = trips
      .filter(t => t.startDate && new Date(t.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 3)
      .map(trip => ({
        id: trip.tripId,
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
    const tripItems = allItems.filter(item => item.tripId === tripId);
    if (tripItems.length === 0) return 0;
    return Math.round((tripItems.filter(i => i.isChecked || i.packed).length / tripItems.length) * 100);
  }

  // Get admin dashboard stats
  async getAdminDashboard() {
    const totalUsers = await dynamoDBService.countUsers({ isActive: true });
    const totalTrips = await dynamoDBService.countTrips();
    const totalItems = await dynamoDBService.countItems();
    
    // User role distribution
    const roleStats = await dynamoDBService.getUsersByRole();

    // Trips by status
    const tripStatusStats = await dynamoDBService.getTripsByStatus();

    // Recent activity (last 30 days)
    const newUsers = (await dynamoDBService.getRecentUsers(30)).length;
    const newTrips = (await dynamoDBService.getRecentTrips(30)).length;

    // Top active users
    const topUsers = await dynamoDBService.getTopUsers(5);

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

  // Get shared trips for a user (trips where user is a participant)
  async getSharedTrips(userId) {
    const allTrips = await dynamoDBService.getAllTrips();
    
    // Find trips where user is a participant (not the owner)
    const sharedTrips = allTrips.filter(trip => {
      const isOwner = trip.userId === userId;
      const isParticipant = trip.participants?.some(p => p.userId === userId);
      return !isOwner && isParticipant;
    });

    // Enrich with owner details and user role
    const enrichedTrips = await Promise.all(
      sharedTrips.map(async (trip) => {
        const owner = await dynamoDBService.getUserById(trip.userId);
        const myRole = trip.participants?.find(p => p.userId === userId)?.role || 'participant';
        
        return {
          ...trip,
          ownerName: owner?.name || 'Unknown',
          ownerEmail: owner?.email || '',
          myRole
        };
      })
    );

    return enrichedTrips;
  }

  // Get organizer dashboard (for users with organizer role)
  async getOrganizerDashboard(userId) {
    const allTrips = await dynamoDBService.getAllTrips();
    
    // Get trips where user is owner or organizer
    const organizedTrips = allTrips.filter(trip => {
      const isOwner = trip.userId === userId;
      const isOrganizer = trip.participants?.some(
        p => p.userId === userId && p.role === 'organizer'
      );
      return isOwner || isOrganizer;
    });

    // Calculate stats
    const stats = {
      totalOrganized: organizedTrips.length,
      activeTrips: organizedTrips.filter(t => t.status === 'active').length,
      completedTrips: organizedTrips.filter(t => t.status === 'completed').length,
      totalParticipants: organizedTrips.reduce((sum, trip) => 
        sum + (trip.participants?.length || 0), 0
      )
    };

    // Get trips with participant details
    const tripsWithParticipants = await Promise.all(
      organizedTrips.map(async (trip) => {
        const participants = await Promise.all(
          (trip.participants || []).map(async (p) => {
            const user = await dynamoDBService.getUserById(p.userId);
            return {
              userId: p.userId,
              name: user?.name || 'Unknown',
              email: user?.email || '',
              role: p.role,
              joinedAt: p.joinedAt
            };
          })
        );

        return {
          ...trip,
          participants
        };
      })
    );

    return {
      stats,
      trips: tripsWithParticipants
    };
  }
}

module.exports = new DashboardService();
