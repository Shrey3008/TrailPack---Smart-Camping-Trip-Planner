const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const { authenticate } = require('../middleware/auth');

// All AI routes require authentication
router.use(authenticate);

// GET /ai/weather/:location - Get weather prediction and insights
router.get('/weather/:location', async (req, res) => {
  try {
    const { location } = req.params;
    const { startDate, endDate } = req.query;

    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }

    const weatherData = await aiService.getWeatherPrediction(
      location,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: weatherData
    });
  } catch (error) {
    console.error('Weather prediction error:', error);
    res.status(500).json({ 
      message: 'Failed to get weather prediction',
      error: error.message 
    });
  }
});

// POST /ai/route/optimize - Optimize hiking route
router.post('/route/optimize', async (req, res) => {
  try {
    const { startPoint, endPoint, waypoints, terrain } = req.body;

    if (!startPoint || !endPoint) {
      return res.status(400).json({ message: 'Start point and end point are required' });
    }

    const routeData = await aiService.optimizeRoute(
      startPoint,
      endPoint,
      waypoints || [],
      terrain || 'Mountain'
    );

    res.json({
      success: true,
      data: routeData
    });
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({ 
      message: 'Failed to optimize route',
      error: error.message 
    });
  }
});

// POST /ai/recommendations/personalized - Get personalized recommendations
router.post('/recommendations/personalized', async (req, res) => {
  try {
    const { userProfile, tripDetails } = req.body;

    if (!tripDetails) {
      return res.status(400).json({ message: 'Trip details are required' });
    }

    const recommendations = await aiService.generatePersonalizedRecommendations(
      userProfile || {},
      tripDetails
    );

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Personalized recommendations error:', error);
    res.status(500).json({ 
      message: 'Failed to generate personalized recommendations',
      error: error.message 
    });
  }
});

// POST /ai/trip/summary - Generate trip summary
router.post('/trip/summary', async (req, res) => {
  try {
    const { tripData, checklistItems, activities } = req.body;

    if (!tripData) {
      return res.status(400).json({ message: 'Trip data is required' });
    }

    const summary = await aiService.generateTripSummary(
      tripData,
      checklistItems || {},
      activities || []
    );

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Trip summary error:', error);
    res.status(500).json({ 
      message: 'Failed to generate trip summary',
      error: error.message 
    });
  }
});

// GET /ai/insights/weather/:tripId - Get weather insights for a specific trip
router.get('/insights/weather/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { location, startDate, endDate } = req.query;

    if (!location || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Location, start date, and end date are required' 
      });
    }

    const weatherData = await aiService.getWeatherPrediction(
      location,
      startDate,
      endDate
    );

    res.json({
      success: true,
      tripId,
      data: weatherData
    });
  } catch (error) {
    console.error('Weather insights error:', error);
    res.status(500).json({ 
      message: 'Failed to get weather insights',
      error: error.message 
    });
  }
});

// POST /ai/insights/route/:tripId - Get route insights for a specific trip
router.post('/insights/route/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { startPoint, endPoint, waypoints, terrain } = req.body;

    if (!startPoint || !endPoint) {
      return res.status(400).json({ message: 'Start point and end point are required' });
    }

    const routeData = await aiService.optimizeRoute(
      startPoint,
      endPoint,
      waypoints || [],
      terrain || 'Mountain'
    );

    res.json({
      success: true,
      tripId,
      data: routeData
    });
  } catch (error) {
    console.error('Route insights error:', error);
    res.status(500).json({ 
      message: 'Failed to get route insights',
      error: error.message 
    });
  }
});

module.exports = router;
