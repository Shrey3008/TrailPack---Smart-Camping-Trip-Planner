const express = require('express');
const router = express.Router();
const dynamoDBService = require('../services/dynamoDBService');
const checklistService = require('../services/checklistService');
const { authenticate, authorize } = require('../middleware/auth');

// All trip routes require authentication
router.use(authenticate);

// POST /trips - Create a new trip
router.post('/', async (req, res) => {
  try {
    const { name, terrain, season, duration, startDate, endDate, settings } = req.body;
    
    // Validation
    if (!name || !terrain || !season || !duration) {
      return res.status(400).json({ message: 'Name, terrain, season, and duration are required' });
    }
    
    // Create trip in DynamoDB - ensure userId is a string
    const userId = String(req.user.userId || req.user.id);
    
    // Prepare trip data - avoid nested objects for DynamoDB compatibility
    const tripData = {
      name: String(name),
      terrain: String(terrain),
      season: String(season),
      duration: parseInt(duration),
      startDate: startDate ? String(startDate) : null,
      endDate: endDate ? String(endDate) : null,
      status: 'planning',
      settings: { autoGenerateChecklist: true },
      participantCount: 1
    };
    
    const savedTrip = await dynamoDBService.createTrip(userId, tripData);
    
    // Generate checklist items using business logic service
    if (!savedTrip.settings || savedTrip.settings.autoGenerateChecklist !== false) {
      const checklistItems = await checklistService.generateChecklist(terrain, season, duration);
      
      // Save checklist items
      const itemPromises = checklistItems.map(item => {
        return dynamoDBService.createItem(savedTrip.tripId, {
          name: item.name,
          category: item.category,
          priority: item.priority || 'medium'
        });
      });
      
      await Promise.all(itemPromises);
    }
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip: savedTrip
    });
  } catch (error) {
    console.error('Error creating trip:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ message: 'Error creating trip: ' + error.message });
  }
});

// GET /trips - Get all trips for current user
router.get('/', async (req, res) => {
  try {
    const { status, terrain, season } = req.query;
    
    // Get trips from DynamoDB
    const trips = await dynamoDBService.getTripsByUser(req.user.userId);
    
    // Filter trips if needed
    let filteredTrips = trips;
    if (status) filteredTrips = filteredTrips.filter(t => t.status === status);
    if (terrain) filteredTrips = filteredTrips.filter(t => t.terrain === terrain);
    if (season) filteredTrips = filteredTrips.filter(t => t.season === season);
    
    res.json({
      trips: filteredTrips,
      total: filteredTrips.length
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Error fetching trips' });
  }
});

// GET /trips/dashboard - Get dashboard data for current user
router.get('/dashboard/stats', async (req, res) => {
  try {
    const trips = await dynamoDBService.getTripsByUser(req.user.userId);
    const totalTrips = trips.length;
    const activeTrips = trips.filter(t => t.status === 'active').length;
    const completedTrips = trips.filter(t => t.status === 'completed').length;
    
    res.json({
      totalTrips,
      activeTrips,
      completedTrips
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
});

// GET /trips/admin-dashboard - Get admin dashboard (admin only)
router.get('/admin/dashboard', authorize('admin'), async (req, res) => {
  try {
    const adminData = await dashboardService.getAdminDashboard();
    res.json(adminData);
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ message: 'Error fetching admin dashboard' });
  }
});

// GET /trips/:id - Get a single trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await dynamoDBService.getTripById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check access (owner, participant, or public)
    const isOwner = trip.userId === req.user.userId;
    const isParticipant = trip.participants && trip.participants.some(p => p.userId === req.user.userId);
    const isPublic = trip.settings && trip.settings.isPublic;
    
    if (!isOwner && !isParticipant && !isPublic) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(trip);
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ message: 'Error fetching trip' });
  }
});

// PUT /trips/:id - Update a trip
router.put('/:id', async (req, res) => {
  try {
    const { name, terrain, season, duration, startDate, endDate, status, settings } = req.body;
    
    // Get trip and check ownership
    const trip = await dynamoDBService.getTripById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user is owner or organizer
    const isOwner = trip.userId === req.user.userId;
    const isOrganizer = trip.participants && trip.participants.some(
      p => p.userId === req.user.userId && p.role === 'organizer'
    );
    
    if (!isOwner && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Build update object
    const updates = {};
    if (name) updates.name = name;
    if (terrain) updates.terrain = terrain;
    if (season) updates.season = season;
    if (duration) updates.duration = parseInt(duration);
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (status) updates.status = status;
    if (settings) updates.settings = { ...trip.settings, ...settings };
    
    const updatedTrip = await dynamoDBService.updateTrip(req.params.id, updates);
    
    res.json({
      message: 'Trip updated successfully',
      trip: updatedTrip
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ message: 'Error updating trip' });
  }
});

// PUT /trips/:id/status - Update trip status
router.put('/:id/status', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    const { status } = req.body;
    
    if (!['planning', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    // Get trip and verify access
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const isOwner = trip.userId === userId;
    const isOrganizer = trip.participants && trip.participants.some(
      p => p.userId === userId && p.role === 'organizer'
    );
    
    if (!isOwner && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const updatedTrip = await dynamoDBService.updateTrip(tripId, { status });
    
    res.json({
      message: 'Trip status updated',
      trip: updatedTrip
    });
  } catch (error) {
    console.error('Error updating status:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ message: 'Error updating trip status: ' + error.message });
  }
});

// POST /trips/:id/participants - Add participant to trip
router.post('/:id/participants', async (req, res) => {
  try {
    const tripId = req.params.id;
    const currentUserId = req.user.userId || req.user.id;
    const { userId, role = 'participant' } = req.body;
    
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const isOwner = trip.userId === currentUserId;
    const isOrganizer = trip.participants && trip.participants.some(
      p => p.userId === currentUserId && p.role === 'organizer'
    );
    
    if (!isOwner && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if already a participant
    const participants = trip.participants || [];
    const isParticipant = participants.some(p => p.userId === userId);
    if (isParticipant) {
      return res.status(409).json({ message: 'User is already a participant' });
    }
    
    // Add new participant
    participants.push({ userId, role, joinedAt: new Date().toISOString() });
    
    const updatedTrip = await dynamoDBService.updateTrip(tripId, { participants });
    
    res.json({
      message: 'Participant added successfully',
      trip: updatedTrip
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ message: 'Error adding participant' });
  }
});

// GET /trips/:id/recommendations - Get smart recommendations
router.get('/:id/recommendations', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const isOwner = trip.userId === userId;
    const isPublic = trip.settings?.isPublic === true;
    if (!isOwner && !isPublic) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Generate recommendations based on trip data
    const recommendations = [
      {
        type: 'gear',
        title: `Consider bringing extra layers for ${trip.terrain} terrain`,
        description: 'Proper clothing is essential for comfort and safety'
      },
      {
        type: 'weather',
        title: `Check weather forecast for ${trip.season} conditions`,
        description: 'Stay prepared for changing weather conditions'
      },
      {
        type: 'food',
        title: `Pack ${parseInt(trip.duration) > 3 ? 'extra' : 'lightweight'} food supplies for ${trip.duration} days`,
        description: 'Ensure adequate nutrition for your trip duration'
      }
    ];
    
    res.json({ recommendations });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Error getting recommendations' });
  }
});

// DELETE /trips/:id - Delete a trip
router.delete('/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const isOwner = trip.userId === userId;
    const isOrganizer = trip.participants && trip.participants.some(
      p => p.userId === userId && p.role === 'organizer'
    );
    
    if (!isOwner && !isOrganizer) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Delete all checklist items for this trip
    const items = await dynamoDBService.getItemsByTrip(tripId);
    for (const item of items) {
      await dynamoDBService.deleteItem(item.itemId);
    }
    
    // Delete the trip
    await dynamoDBService.deleteTrip(tripId);
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

module.exports = router;
