const express = require('express');
const router = express.Router();
const dynamoDBService = require('../services/dynamoDBService');
const checklistService = require('../services/checklistService');
const { authenticate } = require('../middleware/auth');

// All item routes require authentication
router.use(authenticate);

// GET /:id/items - Get all checklist items for a trip
router.get('/:id/items', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    // Verify user has access to the trip
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check access (owner or public)
    const isOwner = trip.userId === userId;
    const isPublic = trip.settings?.isPublic === true;
    if (!isOwner && !isPublic) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const items = await dynamoDBService.getItemsByTrip(tripId);
    res.json(items);
  } catch (error) {
    console.error('Error fetching checklist items:', error);
    res.status(500).json({ message: 'Error fetching checklist items' });
  }
});

// GET /:id/items/category/:category - Get items by category
router.get('/:id/items/category/:category', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    const category = req.params.category;
    
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    const isOwner = trip.userId === userId;
    const isPublic = trip.settings?.isPublic === true;
    if (!isOwner && !isPublic) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const items = await dynamoDBService.getItemsByTrip(tripId);
    const filteredItems = items.filter(item => item.category === category);
    
    res.json(filteredItems);
  } catch (error) {
    console.error('Error fetching category items:', error);
    res.status(500).json({ message: 'Error fetching category items' });
  }
});

// GET /:id/progress - Get trip packing progress
router.get('/:id/progress', async (req, res) => {
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
    
    const items = await dynamoDBService.getItemsByTrip(tripId);
    const totalItems = items.length;
    const packedItems = items.filter(item => item.isChecked).length;
    const progress = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
    
    res.json({ totalItems, packedItems, progress });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ message: 'Error fetching progress' });
  }
});

// PUT /items/:id - Update packed status
router.put('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.user.userId || req.user.id;
    const { packed, notes } = req.body;
    
    const item = await dynamoDBService.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const trip = await dynamoDBService.getTripById(item.tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const updates = {};
    if (packed !== undefined) updates.isChecked = packed;
    if (notes !== undefined) updates.notes = notes;
    
    const updatedItem = await dynamoDBService.updateItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating item:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ message: 'Error updating item: ' + error.message });
  }
});

// PUT /items/:id/pack - Quick pack/unpack toggle
router.put('/:id/pack', async (req, res) => {
  try {
    const item = await ChecklistItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const trip = await Trip.findOne({
      _id: item.tripId,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    });
    
    if (!trip) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Toggle packed status
    const updatedItem = await ChecklistItem.findByIdAndUpdate(
      req.params.id,
      { packed: !item.packed },
      { new: true }
    );
    
    // Update trip progress
    await checklistService.updateTripProgress(item.tripId);
    
    // Update user stats
    await req.user.updateStats();
    
    res.json({
      message: `Item ${updatedItem.packed ? 'packed' : 'unpacked'}`,
      item: updatedItem
    });
  } catch (error) {
    console.error('Error toggling item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
});

// POST /items - Add custom item
router.post('/', async (req, res) => {
  try {
    const { tripId, name, category, priority = 'medium' } = req.body;
    
    if (!tripId || !name || !category) {
      return res.status(400).json({ message: 'Trip ID, name, and category are required' });
    }
    
    // Verify trip ownership
    const trip = await Trip.findOne({
      _id: tripId,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    });
    
    if (!trip) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const item = new ChecklistItem({
      tripId,
      name,
      category,
      priority,
      packed: false
    });
    
    const savedItem = await item.save();
    
    // Update trip progress
    await checklistService.updateTripProgress(tripId);
    
    // Update user stats
    await req.user.updateStats();
    
    res.status(201).json(savedItem);
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ message: 'Error adding item' });
  }
});

// POST /items/bulk - Add multiple items
router.post('/bulk', async (req, res) => {
  try {
    const { tripId, items } = req.body;
    
    if (!tripId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Trip ID and items array are required' });
    }
    
    // Verify trip ownership
    const trip = await Trip.findOne({
      _id: tripId,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    });
    
    if (!trip) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Create all items
    const itemPromises = items.map(item => {
      const checklistItem = new ChecklistItem({
        tripId,
        name: item.name,
        category: item.category,
        priority: item.priority || 'medium',
        packed: false
      });
      return checklistItem.save();
    });
    
    const savedItems = await Promise.all(itemPromises);
    
    // Update trip progress
    await checklistService.updateTripProgress(tripId);
    
    res.status(201).json({
      message: `${savedItems.length} items added successfully`,
      items: savedItems
    });
  } catch (error) {
    console.error('Error adding bulk items:', error);
    res.status(500).json({ message: 'Error adding items' });
  }
});

// DELETE /items/:id - Delete a checklist item
router.delete('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    const item = await dynamoDBService.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Verify trip ownership
    const trip = await dynamoDBService.getTripById(item.tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await dynamoDBService.deleteItem(itemId);
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
});

// DELETE /trips/:id/items/clear-packed - Remove all packed items
router.delete('/trips/:id/items/clear-packed', async (req, res) => {
  try {
    // Verify trip ownership
    const trip = await Trip.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    });
    
    if (!trip) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const result = await ChecklistItem.deleteMany({
      tripId: req.params.id,
      packed: true
    });
    
    // Update trip progress
    await checklistService.updateTripProgress(req.params.id);
    
    // Update user stats
    await req.user.updateStats();
    
    res.json({
      message: `${result.deletedCount} packed items removed`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing packed items:', error);
    res.status(500).json({ message: 'Error clearing packed items' });
  }
});

module.exports = router;
