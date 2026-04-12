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
    
    // Create trip in DynamoDB
    const savedTrip = await dynamoDBService.createTrip({
      userId: req.user.userId,
      name,
      terrain,
      season,
      duration: parseInt(duration),
      startDate: startDate || null,
      endDate: endDate || null,
      settings: settings || {},
      participants: [{ userId: req.user.userId, role: 'organizer' }]
    });
    
    // Generate checklist items using business logic service
    if (savedTrip.settings.autoGenerateChecklist !== false) {
      const checklistItems = await checklistService.generateChecklist(terrain, season, duration);
      
      // Save checklist items
      const itemPromises = checklistItems.map(item => {
        return dynamoDBService.createItem({
          tripId: savedTrip.tripId,
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
    const { status } = req.body;
    
    if (!['planning', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const trip = await Trip.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { userId: req.user._id },
          { 'participants': { $elemMatch: { userId: req.user._id, role: 'organizer' } } }
        ]
      },
      { status },
      { new: true }
    );
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or access denied' });
    }
    
    res.json({
      message: 'Trip status updated',
      trip
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ message: 'Error updating trip status' });
  }
});

// POST /trips/:id/participants - Add participant to trip
router.post('/:id/participants', async (req, res) => {
  try {
    const { userId, role = 'participant' } = req.body;
    
    const trip = await Trip.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { 'participants': { $elemMatch: { userId: req.user._id, role: 'organizer' } } }
      ]
    });
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or access denied' });
    }
    
    // Check if already a participant
    const isParticipant = trip.participants.some(p => p.userId.toString() === userId);
    if (isParticipant) {
      return res.status(409).json({ message: 'User is already a participant' });
    }
    
    trip.participants.push({ userId, role, joinedAt: new Date() });
    await trip.save();
    
    res.json({
      message: 'Participant added successfully',
      trip
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ message: 'Error adding participant' });
  }
});

// GET /trips/:id/recommendations - Get smart recommendations
router.get('/:id/recommendations', async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    });
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const recommendations = await checklistService.getRecommendations(req.params.id);
    res.json({ recommendations });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Error getting recommendations' });
  }
});

// DELETE /trips/:id - Delete a trip
router.delete('/:id', async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { 'participants': { $elemMatch: { userId: req.user._id, role: 'organizer' } } }
      ]
    });
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or access denied' });
    }
    
    // Delete checklist items
    await ChecklistItem.deleteMany({ tripId: req.params.id });
    
    // Delete the trip
    await Trip.findByIdAndDelete(req.params.id);
    
    // Update user stats
    await req.user.updateStats();
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

module.exports = router;
