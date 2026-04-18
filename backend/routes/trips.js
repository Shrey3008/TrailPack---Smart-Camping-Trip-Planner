const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate, authorize } = require('../middleware/auth');
const { QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

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
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, terrain, season, duration } = req.body;
    
    // Validation
    if (!name || !terrain || !season || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const userId = req.user.userId;
    const tripId = uuidv4();
    const parsedDuration = parseInt(duration);
    
    // Save trip with PutCommand
    const tripItem = {
      PK: `USER#${userId}`,
      SK: `TRIP#${tripId}`,
      tripId,
      userId,
      name,
      terrain,
      season,
      duration: parsedDuration,
      createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: tripItem
    }));
    
    // Generate and save checklist items
    const checklistItems = generateChecklist(terrain, season, parsedDuration);
    
    const itemPromises = checklistItems.map(item => {
      const itemId = uuidv4();
      return docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `TRIP#${tripId}`,
          SK: `ITEM#${itemId}`,
          itemId,
          tripId,
          name: item.name,
          category: item.category,
          packed: false,
          createdAt: new Date().toISOString()
        }
      }));
    });
    
    await Promise.all(itemPromises);
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip: tripItem
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ message: 'Error creating trip' });
  }
});

// GET /trips - Get all trips for authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'TRIP#'
      }
    }));
    
    const trips = result.Items || [];
    
    // Sort by createdAt descending
    trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ trips: trips });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Error fetching trips' });
  }
});

// GET /trips/stats - Get dashboard stats for authenticated user
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Query all trips for the user
    const tripsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'TRIP#'
      }
    }));
    
    const trips = tripsResult.Items || [];
    const totalTrips = trips.length;
    
    // Query items for each trip
    let totalItems = 0;
    let packedItems = 0;
    
    for (const trip of trips) {
      const itemsResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `TRIP#${trip.tripId}`,
          ':sk': 'ITEM#'
        }
      }));
      
      const items = itemsResult.Items || [];
      totalItems += items.length;
      packedItems += items.filter(item => item.packed).length;
    }
    
    const packedPercentage = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
    
    res.json({
      totalTrips,
      totalItems,
      packedItems,
      packedPercentage
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// GET /trips/:id - Get a single trip
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;
    
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TRIP#${tripId}`
      }
    }));
    
    if (!result.Item) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    res.json(result.Item);
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ message: 'Error fetching trip' });
  }
});

// PUT /trips/:id - Update a trip
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;
    const { name, terrain, season, duration } = req.body;
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    if (name) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = name;
    }
    if (terrain) {
      updateExpressions.push('terrain = :terrain');
      expressionAttributeValues[':terrain'] = terrain;
    }
    if (season) {
      updateExpressions.push('season = :season');
      expressionAttributeValues[':season'] = season;
    }
    if (duration) {
      updateExpressions.push('duration = :duration');
      expressionAttributeValues[':duration'] = parseInt(duration);
    }
    
    if (updateExpressions.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TRIP#${tripId}`
      },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json(result.Attributes);
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ message: 'Error updating trip' });
  }
});

// DELETE /trips/:id - Delete a trip and its checklist items
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;
    
    // Delete the trip
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TRIP#${tripId}`
      }
    }));
    
    // Query all items for the trip
    const itemsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':sk': 'ITEM#'
      }
    }));
    
    const items = itemsResult.Items || [];
    
    // Delete each item
    const deletePromises = items.map(item => {
      return docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TRIP#${tripId}`,
          SK: `ITEM#${item.itemId}`
        }
      }));
    });
    
    await Promise.all(deletePromises);
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

// GET /trips/shared - Get trips shared with current user
router.get('/shared', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Scan for all participants where user is a participant
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK begins_with :sk AND userId = :userId',
      ExpressionAttributeValues: {
        ':sk': 'PARTICIPANT#',
        ':userId': userId
      }
    }));
    
    const participants = scanResult.Items || [];
    
    // Get unique trip IDs
    const tripIds = [...new Set(participants.map(p => p.tripId))];
    
    // Fetch trip details for each trip by scanning and filtering
    const trips = [];
    for (const tripId of tripIds) {
      // Scan all items with SK beginning with TRIP# and filter by tripId
      const tripScanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(SK, :sk) AND tripId = :tripId',
        ExpressionAttributeValues: {
          ':sk': 'TRIP#',
          ':tripId': tripId
        }
      }));
      
      if (tripScanResult.Items && tripScanResult.Items.length > 0) {
        trips.push(tripScanResult.Items[0]);
      }
    }
    
    res.json(trips);
  } catch (error) {
    console.error('Error fetching shared trips:', error);
    res.status(500).json({ message: 'Error fetching shared trips' });
  }
});

// GET /trips/:id/participants - Get trip participants
router.get('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':sk': 'PARTICIPANT#'
      }
    }));
    
    const participants = result.Items || [];
    res.json({ participants });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ message: 'Error fetching participants' });
  }
});

// POST /trips/:id/participants - Add participant to trip
router.post('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const { userId, role = 'member' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TRIP#${tripId}`,
        SK: `PARTICIPANT#${userId}`,
        userId,
        tripId,
        role,
        joinedAt: new Date().toISOString()
      }
    }));
    
    res.json({ message: 'Participant added successfully' });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ message: 'Error adding participant' });
  }
});

// DELETE /trips/:id/participants/:userId - Remove participant
router.delete('/:id/participants/:userId', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.params.userId;
    
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRIP#${tripId}`,
        SK: `PARTICIPANT#${userId}`
      }
    }));
    
    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ message: 'Error removing participant' });
  }
});

// GET /trips/organizer/dashboard - Get organizer dashboard
router.get('/organizer/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get all trips created by this user
    const tripsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'TRIP#'
      }
    }));
    
    const trips = tripsResult.Items || [];
    
    // Get participant count for each trip
    const tripsWithCounts = await Promise.all(trips.map(async (trip) => {
      const participantsResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `TRIP#${trip.tripId}`,
          ':sk': 'PARTICIPANT#'
        }
      }));
      
      const participants = participantsResult.Items || [];
      
      return {
        ...trip,
        participantCount: participants.length
      };
    }));
    
    res.json(tripsWithCounts);
  } catch (error) {
    console.error('Error fetching organizer dashboard:', error);
    res.status(500).json({ message: 'Error fetching organizer dashboard' });
  }
});

// GET /trips/admin/dashboard - Get admin dashboard (admin only)
router.get('/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Scan all trips
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':sk': 'TRIP#'
      }
    }));
    
    const trips = scanResult.Items || [];
    res.json(trips);
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ message: 'Error fetching admin dashboard' });
  }
});

module.exports = router;
