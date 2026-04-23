const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate, authorize } = require('../middleware/auth');
const { QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { estimateProvisions } = require('../services/provisionsService');
const sharedTrips = require('../services/sharedTripsService');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// Smart Rule-Based Checklist Generator
// Generates items based on terrain, season, and duration rules (no AI or external API)
const generateChecklist = (terrain, season, duration) => {
  const items = [];
  
  // BASE ITEMS (every trip) - category: "Essentials"
  const baseItems = [
    { name: 'Backpack', category: 'Essentials' },
    { name: 'Water bottle', category: 'Essentials' },
    { name: 'First aid kit', category: 'Essentials' },
    { name: 'Map and compass', category: 'Essentials' },
    { name: 'Lighter or matches', category: 'Essentials' },
    { name: 'Headlamp', category: 'Essentials' }
  ];
  items.push(...baseItems);
  
  // TERRAIN RULES
  if (terrain === 'Mountain') {
    items.push(
      { name: 'Hiking boots', category: 'Clothing' },
      { name: 'Warm layers', category: 'Clothing' },
      { name: 'Trekking poles', category: 'Clothing' },
      { name: 'Tent', category: 'Shelter' },
      { name: 'Cold-rated sleeping bag', category: 'Shelter' }
    );
  } else if (terrain === 'Forest') {
    items.push(
      { name: 'Bug spray', category: 'Tools' },
      { name: 'Tarp', category: 'Tools' },
      { name: 'Rope', category: 'Tools' },
      { name: 'Tent', category: 'Shelter' },
      { name: 'Sleeping bag', category: 'Shelter' }
    );
  } else if (terrain === 'Desert') {
    items.push(
      { name: 'Extra water bottles', category: 'Food & Water' },
      { name: 'Electrolyte tablets', category: 'Food & Water' },
      { name: 'Sun hat', category: 'Clothing' },
      { name: 'UV protection shirt', category: 'Clothing' }
    );
  }
  
  // SEASON RULES
  if (season === 'Winter') {
    items.push(
      { name: 'Insulated jacket', category: 'Clothing' },
      { name: 'Gloves', category: 'Clothing' },
      { name: 'Beanie', category: 'Clothing' },
      { name: 'Thermal base layer', category: 'Clothing' }
    );
  } else if (season === 'Summer') {
    items.push(
      { name: 'Lightweight shirt', category: 'Clothing' },
      { name: 'Sunscreen SPF 50', category: 'Clothing' },
      { name: 'Sunglasses', category: 'Clothing' }
    );
  } else if (season === 'Fall') {
    items.push(
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Layered clothing', category: 'Clothing' },
      { name: 'Warm socks', category: 'Clothing' }
    );
  } else if (season === 'Spring') {
    items.push(
      { name: 'Waterproof boots', category: 'Clothing' },
      { name: 'Light rain jacket', category: 'Clothing' },
      { name: 'Layered clothing', category: 'Clothing' }
    );
  }
  
  // DURATION RULES
  if (duration > 3) {
    items.push(
      { name: 'Extra meal supplies', category: 'Food & Water' },
      { name: 'Water filter', category: 'Food & Water' }
    );
  }
  if (duration > 5) {
    items.push(
      { name: 'Emergency whistle', category: 'Safety' },
      { name: 'Satellite communicator', category: 'Safety' }
    );
  }
  
  return items;
};

// POST /trips - Create a new trip with rule-based checklist
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, terrain, season, duration, location, startDate, endDate } = req.body;

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
      location: location || null,
      startDate: startDate || null,
      endDate: endDate || null,
      status: 'planned',
      createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: tripItem
    }));

    // Write a tripId pointer so collaborators can look up the trip by id alone.
    await sharedTrips.putTripPointer(tripId, userId);

    // Generate rule-based checklist items
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

// GET /trips/:id/provisions - Estimated water + food for a trip
router.get('/:id/provisions', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `TRIP#${tripId}` }
    }));

    if (!result.Item) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const trip = result.Item;
    const provisions = estimateProvisions({
      duration: trip.duration,
      terrain: trip.terrain,
      season: trip.season,
      participants: trip.participants || 1,
    });

    res.json(provisions);
  } catch (error) {
    console.error('Error estimating provisions:', error);
    res.status(500).json({ message: 'Error estimating provisions' });
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
    const { name, terrain, season, duration, status } = req.body;
    
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
    if (status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }
    
    if (updateExpressions.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TRIP#${tripId}`
      },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };
    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }
    const result = await docClient.send(new UpdateCommand(updateParams));
    
    res.json(result.Attributes);
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ message: 'Error updating trip: ' + error.message });
  }
});

// DELETE /trips/:id - Delete a trip and its checklist items (owner only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    // Only the owner may delete. Returns 403 for collaborators, 404 if missing.
    try {
      await sharedTrips.assertTripOwner(tripId, userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    // Delete the trip
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `TRIP#${tripId}` }
    }));

    // Delete the pointer so this tripId is fully gone.
    await sharedTrips.deleteTripPointer(tripId);

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
    const deletePromises = items.map(item => docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TRIP#${tripId}`, SK: `ITEM#${item.itemId}` }
    })));
    await Promise.all(deletePromises);

    // Best-effort: remove collaborator rows + their reverse-lookup entries.
    try {
      const collaborators = await sharedTrips.listCollaborators(tripId);
      await Promise.all(collaborators.map(c => sharedTrips.removeCollaborator(tripId, c.userId)));
    } catch (e) {
      console.warn('Could not clean up collaborators on trip delete:', e.message);
    }

    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

// GET /trips/shared - List trips that have been shared with the current user
// Uses the reverse-lookup (SHARED_TRIP#) path — O(trips) instead of a full scan.
router.get('/shared', authenticate, async (req, res) => {
  try {
    const trips = await sharedTrips.listSharedTripsForUser(req.user.userId);
    res.json(trips);
  } catch (error) {
    console.error('Error fetching shared trips:', error);
    res.status(500).json({ message: 'Error fetching shared trips' });
  }
});

// GET /trips/:id/participants - List collaborators on a trip (owner or collaborator)
router.get('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    try {
      await sharedTrips.assertTripAccess(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    const participants = await sharedTrips.listCollaborators(tripId);
    res.json({ participants });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ message: 'Error fetching participants' });
  }
});

// POST /trips/:id/participants - Directly add a participant by userId (owner only)
// Kept for backward compatibility with the existing organizer/dashboard flows;
// now also writes the reverse SHARED_TRIP# lookup via the service.
router.post('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const { userId: targetUserId, email, name } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    await sharedTrips.addCollaborator(
      tripId,
      { userId: targetUserId, email: email || null, name: name || null },
      req.user.userId
    );
    res.json({ message: 'Participant added successfully' });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ message: 'Error adding participant' });
  }
});

// DELETE /trips/:id/participants/:userId - Remove collaborator (owner only)
router.delete('/:id/participants/:userId', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const targetUserId = req.params.userId;
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    await sharedTrips.removeCollaborator(tripId, targetUserId);
    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ message: 'Error removing participant' });
  }
});

// GET /trips/organizer/dashboard - Stats + trips list for the organizer page.
// Response shape: { stats: {...}, trips: [...] }.
router.get('/organizer/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const tripsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'TRIP#'
      }
    }));

    const ownedTrips = tripsResult.Items || [];

    // Attach participant lists to each trip for the UI.
    const tripsWithParticipants = await Promise.all(ownedTrips.map(async (trip) => {
      const participants = await sharedTrips.listCollaborators(trip.tripId);
      return { ...trip, participants, participantCount: participants.length };
    }));

    const stats = {
      totalOrganized: tripsWithParticipants.length,
      activeTrips: tripsWithParticipants.filter(t => t.status === 'active' || t.status === 'in_progress').length,
      completedTrips: tripsWithParticipants.filter(t => t.status === 'completed').length,
      totalParticipants: tripsWithParticipants.reduce((sum, t) => sum + (t.participantCount || 0), 0),
    };

    res.json({ stats, trips: tripsWithParticipants });
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
