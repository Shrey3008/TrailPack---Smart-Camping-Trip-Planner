const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const ChecklistItem = require('../models/ChecklistItem');
const checklistService = require('../services/checklistService');
const dashboardService = require('../services/dashboardService');
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
    
    // Create trip with user association
    const trip = new Trip({
      userId: req.user._id,
      name,
      terrain,
      season,
      duration: parseInt(duration),
      startDate: startDate || null,
      endDate: endDate || null,
      settings: settings || {},
      participants: [{ userId: req.user._id, role: 'organizer' }]
    });
    
    const savedTrip = await trip.save();
    
    // Generate checklist items using business logic service
    if (trip.settings.autoGenerateChecklist !== false) {
      const checklistItems = await checklistService.generateChecklist(terrain, season, duration);
      
      // Save checklist items
      const itemPromises = checklistItems.map(item => {
        const checklistItem = new ChecklistItem({
          tripId: savedTrip._id,
          name: item.name,
          category: item.category,
          priority: item.priority || 'medium'
        });
        return checklistItem.save();
      });
      
      await Promise.all(itemPromises);
    }
    
    // Update user stats
    await req.user.updateStats();
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip: savedTrip
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ message: 'Error creating trip' });
  }
});

// GET /trips - Get all trips for current user
router.get('/', async (req, res) => {
  try {
    const { status, terrain, season, page = 1, limit = 20 } = req.query;
    
    // Build filter
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    if (terrain) filter.terrain = terrain;
    if (season) filter.season = season;
    
    const trips = await Trip.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Trip.countDocuments(filter);
    
    res.json({
      trips,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Error fetching trips' });
  }
});

// GET /trips/dashboard - Get dashboard data for current user
router.get('/dashboard/stats', async (req, res) => {
  try {
    const dashboardData = await dashboardService.getUserDashboard(req.user._id);
    res.json(dashboardData);
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
    const trip = await Trip.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id },
        { 'settings.isPublic': true }
      ]
    });
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
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
    
    // Find trip and check ownership
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
    
    // Update fields
    if (name) trip.name = name;
    if (terrain) trip.terrain = terrain;
    if (season) trip.season = season;
    if (duration) trip.duration = parseInt(duration);
    if (startDate !== undefined) trip.startDate = startDate;
    if (endDate !== undefined) trip.endDate = endDate;
    if (status) trip.status = status;
    if (settings) trip.settings = { ...trip.settings, ...settings };
    
    const updatedTrip = await trip.save();
    
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
