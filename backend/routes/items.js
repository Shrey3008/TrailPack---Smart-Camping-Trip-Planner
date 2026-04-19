const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate } = require('../middleware/auth');
const { QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

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
