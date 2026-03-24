const express = require('express');
const router = express.Router();
const ChecklistItem = require('../models/ChecklistItem');

// GET /trips/:id/items - Get all checklist items for a trip
router.get('/trips/:id/items', async (req, res) => {
  try {
    const items = await ChecklistItem.find({ tripId: req.params.id });
    res.json(items);
  } catch (error) {
    console.error('Error fetching checklist items:', error);
    res.status(500).json({ message: 'Error fetching checklist items' });
  }
});

// PUT /items/:id - Update packed status
router.put('/:id', async (req, res) => {
  try {
    const { packed } = req.body;
    
    const item = await ChecklistItem.findByIdAndUpdate(
      req.params.id,
      { packed },
      { new: true }
    );
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
});

// POST /items - Add custom item
router.post('/', async (req, res) => {
  try {
    const { tripId, name, category } = req.body;
    
    if (!tripId || !name || !category) {
      return res.status(400).json({ message: 'Trip ID, name, and category are required' });
    }
    
    const item = new ChecklistItem({
      tripId,
      name,
      category,
      packed: false
    });
    
    const savedItem = await item.save();
    res.status(201).json(savedItem);
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ message: 'Error adding item' });
  }
});

// DELETE /items/:id - Delete a checklist item
router.delete('/:id', async (req, res) => {
  try {
    const item = await ChecklistItem.findByIdAndDelete(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
});

module.exports = router;
