const express = require('express');
const router = express.Router();
const dynamoDBService = require('../services/dynamoDBService');
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
    
    // Check access (owner, participant, or public)
    const isOwner = trip.userId === userId;
    const isParticipant = trip.participants?.some(p => p.userId === userId);
    const isPublic = trip.settings?.isPublic === true;
    if (!isOwner && !isParticipant && !isPublic) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const items = await dynamoDBService.getItemsByTrip(tripId);
    
    // Enhance items with packedBy user names
    const itemsWithUserNames = await Promise.all(items.map(async (item) => {
      if (item.packedBy) {
        const user = await dynamoDBService.getUserById(item.packedBy);
        return {
          ...item,
          packedByName: user?.name || 'Unknown'
        };
      }
      return item;
    }));
    
    res.json({ items: itemsWithUserNames });
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

// PUT /items/:id - Update packed status (collaborative)
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
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check access: owner, organizer, or participant
    const isOwner = trip.userId === userId;
    const isOrganizer = trip.participants?.some(p => p.userId === userId && p.role === 'organizer');
    const isParticipant = trip.participants?.some(p => p.userId === userId);
    
    if (!isOwner && !isOrganizer && !isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const updates = {};
    if (packed !== undefined) {
      updates.isChecked = packed;
      // Track who packed/unpacked the item
      if (packed) {
        updates.packedBy = userId;
        updates.packedAt = new Date().toISOString();
      } else {
        updates.packedBy = null;
        updates.packedAt = null;
      }
    }
    if (notes !== undefined) updates.notes = notes;
    
    const updatedItem = await dynamoDBService.updateItem(itemId, updates);
    
    // Add packedByName for response
    if (updatedItem.packedBy) {
      const user = await dynamoDBService.getUserById(updatedItem.packedBy);
      updatedItem.packedByName = user?.name || 'Unknown';
    }
    
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
    const itemId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    const item = await dynamoDBService.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const trip = await dynamoDBService.getTripById(item.tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Toggle packed status
    const newStatus = !item.isChecked;
    const updatedItem = await dynamoDBService.updateItem(itemId, { isChecked: newStatus });
    
    res.json({
      message: `Item ${newStatus ? 'packed' : 'unpacked'}`,
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
    const userId = req.user.userId || req.user.id;
    
    if (!tripId || !name || !category) {
      return res.status(400).json({ message: 'Trip ID, name, and category are required' });
    }
    
    // Verify trip ownership
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const savedItem = await dynamoDBService.createItem(tripId, {
      name,
      category,
      priority
    });
    
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
    const userId = req.user.userId || req.user.id;
    
    if (!tripId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Trip ID and items array are required' });
    }
    
    // Verify trip ownership
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Create all items
    const savedItems = [];
    for (const item of items) {
      const savedItem = await dynamoDBService.createItem(tripId, {
        name: item.name,
        category: item.category,
        priority: item.priority || 'medium'
      });
      savedItems.push(savedItem);
    }
    
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
router.delete('/:id/items/clear-packed', async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user.userId || req.user.id;
    
    // Verify trip ownership
    const trip = await dynamoDBService.getTripById(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get all packed items and delete them
    const items = await dynamoDBService.getItemsByTrip(tripId);
    const packedItems = items.filter(item => item.isChecked);
    
    for (const item of packedItems) {
      await dynamoDBService.deleteItem(item.itemId);
    }
    
    res.json({
      message: `${packedItems.length} packed items removed`,
      deletedCount: packedItems.length
    });
  } catch (error) {
    console.error('Error clearing packed items:', error);
    res.status(500).json({ message: 'Error clearing packed items' });
  }
});

module.exports = router;
