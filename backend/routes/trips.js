const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const ChecklistItem = require('../models/ChecklistItem');

// Rule-based checklist generator
const generateChecklist = (terrain, season, duration) => {
  const items = [];
  
  // Base items for all trips
  const baseItems = [
    { name: 'Backpack', category: 'Tools' },
    { name: 'Water bottle', category: 'Food & Water' },
    { name: 'First aid kit', category: 'Safety' }
  ];
  items.push(...baseItems);
  
  // Terrain-specific items
  const terrainRules = {
    'Mountain': [
      { name: 'Hiking boots', category: 'Clothing' },
      { name: 'Warm layers', category: 'Clothing' },
      { name: 'Trekking poles', category: 'Tools' }
    ],
    'Forest': [
      { name: 'Bug spray', category: 'Safety' },
      { name: 'Tarp', category: 'Shelter' },
      { name: 'Long pants', category: 'Clothing' }
    ],
    'Desert': [
      { name: 'Extra water containers', category: 'Food & Water' },
      { name: 'Sun hat', category: 'Clothing' },
      { name: 'Sunscreen', category: 'Safety' },
      { name: 'Sunglasses', category: 'Clothing' }
    ]
  };
  
  if (terrainRules[terrain]) {
    items.push(...terrainRules[terrain]);
  }
  
  // Season-specific items
  const seasonRules = {
    'Winter': [
      { name: 'Winter jacket', category: 'Clothing' },
      { name: 'Gloves', category: 'Clothing' },
      { name: 'Warm hat', category: 'Clothing' },
      { name: 'Insulated sleeping bag', category: 'Shelter' }
    ],
    'Summer': [
      { name: 'Lightweight clothing', category: 'Clothing' },
      { name: 'Cooling towel', category: 'Clothing' },
      { name: 'Lightweight tent', category: 'Shelter' }
    ],
    'Fall': [
      { name: 'Layered clothing', category: 'Clothing' },
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Warm sleeping bag', category: 'Shelter' }
    ],
    'Spring': [
      { name: 'Layered clothing', category: 'Clothing' },
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Waterproof boots', category: 'Clothing' }
    ]
  };
  
  if (seasonRules[season]) {
    items.push(...seasonRules[season]);
  }
  
  // Duration-based items
  if (duration > 1) {
    items.push(
      { name: 'Tent', category: 'Shelter' },
      { name: 'Sleeping pad', category: 'Shelter' },
      { name: 'Camping stove', category: 'Food & Water' },
      { name: 'Food supplies', category: 'Food & Water' }
    );
  }
  
  if (duration > 3) {
    items.push(
      { name: 'Extra batteries', category: 'Tools' },
      { name: 'Water purification tablets', category: 'Food & Water' },
      { name: 'Multi-tool', category: 'Tools' }
    );
  }
  
  // Common safety items
  items.push(
    { name: 'Flashlight/Headlamp', category: 'Safety' },
    { name: 'Whistle', category: 'Safety' },
    { name: 'Map and compass', category: 'Tools' }
  );
  
  return items;
};

// POST /trips - Create a new trip
router.post('/', async (req, res) => {
  try {
    const { name, terrain, season, duration } = req.body;
    
    // Validation
    if (!name || !terrain || !season || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Create trip
    const trip = new Trip({
      name,
      terrain,
      season,
      duration: parseInt(duration)
    });
    
    const savedTrip = await trip.save();
    
    // Generate checklist items
    const checklistItems = generateChecklist(terrain, season, duration);
    
    // Save checklist items
    const itemPromises = checklistItems.map(item => {
      const checklistItem = new ChecklistItem({
        tripId: savedTrip._id,
        name: item.name,
        category: item.category
      });
      return checklistItem.save();
    });
    
    await Promise.all(itemPromises);
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip: savedTrip
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ message: 'Error creating trip' });
  }
});

// GET /trips - Get all trips
router.get('/', async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1 });
    res.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Error fetching trips' });
  }
});

// GET /trips/:id - Get a single trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.json(trip);
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ message: 'Error fetching trip' });
  }
});

// DELETE /trips/:id - Delete a trip and its checklist items
router.delete('/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Delete checklist items associated with this trip
    await ChecklistItem.deleteMany({ tripId: req.params.id });
    
    // Delete the trip
    await Trip.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

module.exports = router;
