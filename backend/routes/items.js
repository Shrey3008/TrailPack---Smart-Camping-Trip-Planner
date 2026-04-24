const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate } = require('../middleware/auth');
const { QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const aiService = require('../services/aiService');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// GET /trips/:id/items - Get all checklist items for a trip
router.get('/:id/items', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `TRIP#${tripId}`,
        ':sk': 'ITEM#'
      }
    }));
    
    const items = result.Items || [];
    res.json(items);
  } catch (error) {
    console.error('Error fetching checklist items:', error);
    res.status(500).json({ message: 'Error fetching checklist items' });
  }
});

// PUT /items/:id - Update packed status
router.put('/:id', authenticate, async (req, res) => {
  try {
    const itemId = req.params.id;
    const { tripId, packed } = req.body;
    
    if (!tripId) {
      return res.status(400).json({ message: 'Trip ID is required' });
    }
    
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRIP#${tripId}`,
        SK: `ITEM#${itemId}`
      },
      UpdateExpression: 'SET packed = :packed',
      ExpressionAttributeValues: {
        ':packed': packed
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json(result.Attributes);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
});

// PATCH /trips/:tripId/items/:itemId - Update packed status (for checklist.html)
router.patch('/:tripId/items/:itemId', authenticate, async (req, res) => {
  try {
    const { tripId, itemId } = req.params;
    const { packed } = req.body;
    
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRIP#${tripId}`,
        SK: `ITEM#${itemId}`
      },
      UpdateExpression: 'SET packed = :packed',
      ExpressionAttributeValues: {
        ':packed': packed
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    res.json(result.Attributes);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
});

// POST /items - Add custom item
router.post('/', authenticate, async (req, res) => {
  try {
    const { tripId, name, category } = req.body;
    
    if (!tripId || !name || !category) {
      return res.status(400).json({ message: 'Trip ID, name, and category are required' });
    }
    
    const itemId = uuidv4();
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `TRIP#${tripId}`,
        SK: `ITEM#${itemId}`,
        itemId,
        tripId,
        name,
        category,
        packed: false,
        createdAt: new Date().toISOString()
      }
    }));
    
    res.status(201).json({
      PK: `TRIP#${tripId}`,
      SK: `ITEM#${itemId}`,
      itemId,
      tripId,
      name,
      category,
      packed: false,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ message: 'Error adding item' });
  }
});

// POST /trips/:id/ai-items - Generate AI-suggested gear items for a trip
// and persist them with source='ai'. Items whose name (case-insensitive,
// trimmed) already exists on the trip are SKIPPED entirely — they are
// never inserted, not even in the AI section — per the dedup rule.
router.post('/:id/ai-items', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user && req.user.userId;
    if (!tripId) return res.status(400).json({ message: 'Trip id is required' });

    // Load the trip so we can feed its terrain/season/duration/etc to the model.
    const tripResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `TRIP#${tripId}` },
    }));
    const trip = tripResult && tripResult.Item;
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // Existing items on the trip — used for case-insensitive dedup.
    const existingResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `TRIP#${tripId}`, ':sk': 'ITEM#' },
    }));
    const existingNames = new Set(
      (existingResult.Items || [])
        .map(i => String(i && i.name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // Ask the model for structured gear suggestions.
    const suggestions = await aiService.generateGearSuggestions(trip);

    const inserted = [];
    const skipped  = [];
    for (const item of suggestions) {
      const key = String(item.name || '').trim().toLowerCase();
      if (!key) continue;
      // Dedup rule: skip if the trip already has an item with this name
      // (case-insensitive). Also protects against duplicates *within* the
      // same AI batch by adding each inserted name to the set.
      if (existingNames.has(key)) { skipped.push(item.name); continue; }

      const itemId = uuidv4();
      const record = {
        PK: `TRIP#${tripId}`,
        SK: `ITEM#${itemId}`,
        itemId,
        tripId,
        name: item.name,
        category: item.category,
        priority: item.priority,
        source: 'ai',
        packed: false,
        createdAt: new Date().toISOString(),
      };
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
      existingNames.add(key);
      inserted.push(record);
    }

    res.status(201).json({
      message: 'AI items generated',
      inserted,
      skipped,
      counts: { inserted: inserted.length, skipped: skipped.length, suggested: suggestions.length },
    });
  } catch (error) {
    console.error('Error generating AI items:', error);
    res.status(500).json({ message: 'Error generating AI items' });
  }
});

// DELETE /items/:id - Delete a checklist item
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const itemId = req.params.id;
    const { tripId } = req.body;
    
    if (!tripId) {
      return res.status(400).json({ message: 'Trip ID is required' });
    }
    
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRIP#${tripId}`,
        SK: `ITEM#${itemId}`
      }
    }));
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
});

module.exports = router;
