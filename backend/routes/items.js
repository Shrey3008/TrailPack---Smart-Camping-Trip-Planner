const express = require('express');
const router = express.Router();
const { Trip, Item } = require('../models');
const { authenticate } = require('../middleware/auth');
const aiService = require('../services/aiService');

const EXCLUDE = '-_id -__v';

// GET /trips/:id/items - Get all checklist items for a trip
router.get('/:id/items', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const items = await Item.find({ tripId }).select(EXCLUDE).lean();
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

    const updated = await Item.findOneAndUpdate(
      { itemId, tripId },
      { $set: { packed } },
      { new: true }
    ).select(EXCLUDE).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(updated);
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

    const updated = await Item.findOneAndUpdate(
      { itemId, tripId },
      { $set: { packed } },
      { new: true }
    ).select(EXCLUDE).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(updated);
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

    const itemDoc = await Item.create({
      tripId,
      name,
      category,
      packed: false,
    });
    const item = itemDoc.toObject();
    delete item._id;
    delete item.__v;

    res.status(201).json(item);
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
    const trip = await Trip.findOne({ tripId, userId }).select(EXCLUDE).lean();
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // Existing items on the trip — used for case-insensitive dedup.
    const existingItems = await Item.find({ tripId }).select('name').lean();
    const existingNames = new Set(
      existingItems
        .map(i => String(i && i.name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // Ask the model for structured gear suggestions. A hard failure here
    // (no key, auth error, upstream outage) must surface as 503 — reporting
    // it as a successful run with zero results made a dead API key look
    // identical to "the AI had nothing to suggest".
    let suggestions;
    try {
      suggestions = await aiService.generateGearSuggestions(trip);
    } catch (aiErr) {
      const code = (aiErr && aiErr.code) || 'AI_UNAVAILABLE';
      return res.status(503).json({
        message: aiErr && aiErr.message ? aiErr.message : 'The AI service is temporarily unavailable.',
        code,
      });
    }

    const inserted = [];
    const skipped = [];
    for (const item of suggestions) {
      const key = String(item.name || '').trim().toLowerCase();
      if (!key) continue;
      // Dedup rule: skip if the trip already has an item with this name
      // (case-insensitive). Also protects against duplicates *within* the
      // same AI batch by adding each inserted name to the set.
      if (existingNames.has(key)) { skipped.push(item.name); continue; }

      const doc = await Item.create({
        tripId,
        name: item.name,
        category: item.category,
        priority: item.priority,
        source: 'ai',
        packed: false,
      });
      const record = doc.toObject();
      delete record._id;
      delete record.__v;
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
    // tripId scopes the delete so an item can only be removed via the trip it
    // belongs to. It was previously read from the request body only, which is
    // unusual for DELETE — plenty of HTTP clients, proxies and fetch wrappers
    // drop DELETE bodies, and the caller just got an opaque 400. Accept it as a
    // query parameter too; the body is still honoured for existing callers.
    const tripId = (req.body && req.body.tripId) || req.query.tripId;

    if (!tripId) {
      return res.status(400).json({ message: 'Trip ID is required (body or ?tripId=)' });
    }

    const result = await Item.deleteOne({ itemId, tripId });

    // Previously this answered 200 "Item deleted successfully" even when
    // nothing matched — so a wrong tripId, or an already-deleted item, looked
    // like a success. Report the truth instead.
    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
});

module.exports = router;
