const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiService = require('../services/aiService');

// All AI routes require authentication
router.use(authenticate);

// GET /ai/weather/:location - Get real weather data from OpenWeatherMap
router.get('/weather/:location', async (req, res) => {
  try {
    const { location } = req.params;
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey) {
      // Return mock data if no API key configured
      return res.json({
        location,
        temperature: '72°F',
        condition: 'Sunny',
        humidity: '45%',
        windSpeed: '8 mph',
        forecast: [
          { day: 'Today', temp: '72°F', condition: 'Sunny' },
          { day: 'Tomorrow', temp: '68°F', condition: 'Partly Cloudy' }
        ],
        hikingRecommendation: 'Good conditions for hiking',
        gearSuggestions: ['Sunscreen', 'Light layers', 'Sunglasses'],
        source: 'mock'
      });
    }
    
    // Fetch real weather data
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`
    );
    
    if (!response.ok) {
      throw new Error('Weather API request failed');
    }
    
    const data = await response.json();
    
    // Generate hiking recommendations based on weather
    let hikingRecommendation = 'Good conditions for hiking';
    let gearSuggestions = [];
    
    if (data.main.temp > 85) {
      hikingRecommendation = 'Hot conditions - start early';
      gearSuggestions = ['Extra water', 'Sun hat', 'Electrolytes'];
    } else if (data.main.temp < 40) {
      hikingRecommendation = 'Cold conditions - dress in layers';
      gearSuggestions = ['Warm jacket', 'Gloves', 'Hand warmers'];
    }
    
    if (data.weather[0].main === 'Rain' || data.weather[0].main === 'Thunderstorm') {
      hikingRecommendation = 'Poor conditions - consider rescheduling';
      gearSuggestions = ['Rain gear', 'Waterproof boots', 'Dry bags'];
    }
    
    res.json({
      location: data.name,
      temperature: `${Math.round(data.main.temp)}°F`,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      humidity: `${data.main.humidity}%`,
      windSpeed: `${Math.round(data.wind.speed)} mph`,
      hikingRecommendation,
      gearSuggestions,
      source: 'openweathermap',
      updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Weather prediction error:', error);
    res.status(500).json({ message: 'Failed to get weather prediction' });
  }
});

// POST /ai/route/optimize - Optimize hiking route
router.post('/route/optimize', async (req, res) => {
  try {
    const { waypoints } = req.body;

    res.json({
      optimizedRoute: waypoints || [],
      estimatedTime: '4h 30m'
    });
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({ message: 'Failed to optimize route' });
  }
});

// POST /ai/recommendations/personalized - Get personalized recommendations
router.post('/recommendations/personalized', async (req, res) => {
  try {
    res.json({
      recommendations: [
        'Bring extra water',
        'Check trail conditions',
        'Pack sunscreen'
      ]
    });
  } catch (error) {
    console.error('Personalized recommendations error:', error);
    res.status(500).json({ message: 'Failed to generate personalized recommendations' });
  }
});

// POST /ai/trip/summary - Generate trip summary
router.post('/trip/summary', async (req, res) => {
  try {
    res.json({
      summary: 'Trip summary generated',
      highlights: []
    });
  } catch (error) {
    console.error('Trip summary error:', error);
    res.status(500).json({ message: 'Failed to generate trip summary' });
  }
});

// GET /ai/insights/weather/:tripId - Get weather insights for a specific trip
router.get('/insights/weather/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;

    res.json({
      tripId,
      weatherRisk: 'Low',
      recommendation: 'Good conditions'
    });
  } catch (error) {
    console.error('Weather insights error:', error);
    res.status(500).json({ message: 'Failed to get weather insights' });
  }
});

// POST /ai/insights/route/:tripId - Get route insights for a specific trip
router.post('/insights/route/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;

    res.json({
      tripId,
      routeInsights: 'Route looks safe',
      difficulty: 'Moderate'
    });
  } catch (error) {
    console.error('Route insights error:', error);
    res.status(500).json({ message: 'Failed to get route insights' });
  }
});

// POST /ai/risk-analysis - Hybrid trip risk analysis.
//
// Scoring + factor detection is pure rule-based (deterministic,
// covered by tests in __tests__/risk.test.js). The recommendations
// array is AI-enhanced: we ask Groq (llama-3.1-8b-instant, JSON mode)
// for trip-specific safety tips, and fall back to a static rule-based
// list if Groq is unavailable (no key, network error, quota, empty
// response). The response shape deliberately exposes BOTH the legacy
// field names the tests assert on (overallRisk, riskFactors) and the
// new names the frontend reads (riskLevel, factors) so the fix is
// backwards-compatible.
router.post('/risk-analysis', async (req, res) => {
  try {
    const { terrain, season, duration, experience } = req.body;

    const riskFactors = [];
    let overallRisk = 'Low';
    let riskScore = 0;

    // Terrain risk
    const terrainRisks = {
      'Mountain': { level: 'High', score: 30, factors: ['Altitude sickness', 'Steep terrain', 'Rockfall risk'] },
      'Forest': { level: 'Low', score: 10, factors: ['Wildlife encounters', 'Getting lost'] },
      'Desert': { level: 'High', score: 35, factors: ['Heat exhaustion', 'Dehydration', 'Limited shade'] }
    };

    if (terrainRisks[terrain]) {
      riskScore += terrainRisks[terrain].score;
      riskFactors.push(...terrainRisks[terrain].factors);
    }

    // Season risk
    const seasonRisks = {
      'Winter': { level: 'High', score: 30, factors: ['Hypothermia', 'Avalanche', 'Ice/snow hazards'] },
      'Summer': { level: 'Medium', score: 20, factors: ['Heat stroke', 'Wildfire risk', 'Thunderstorms'] },
      'Spring': { level: 'Medium', score: 15, factors: ['Unpredictable weather', 'Muddy trails'] },
      'Fall': { level: 'Low', score: 10, factors: ['Early darkness', 'Temperature drops'] }
    };

    if (seasonRisks[season]) {
      riskScore += seasonRisks[season].score;
      riskFactors.push(...seasonRisks[season].factors);
    }

    // Duration risk
    if (duration > 5) {
      riskScore += 15;
      riskFactors.push('Extended trip fatigue');
    }
    if (duration > 3) {
      riskScore += 10;
      riskFactors.push('Multi-day supply management');
    }

    // Experience modifier
    const expModifier = {
      'Beginner': 20,
      'Intermediate': 10,
      'Advanced': 0,
      'Expert': -5
    };
    riskScore += expModifier[experience] || 10;

    // Determine overall risk
    if (riskScore >= 60) overallRisk = 'High';
    else if (riskScore >= 35) overallRisk = 'Medium';

    // Static fallback recommendations (used when Groq is unavailable
    // or the tests run without a GROQ_API_KEY in the environment).
    const fallbackRecs = [];
    if (overallRisk === 'High') {
      fallbackRecs.push('Consider a guided tour', 'File a trip plan with authorities', 'Carry emergency beacon');
    } else if (overallRisk === 'Medium') {
      fallbackRecs.push('Hike with a partner', 'Check weather forecasts', 'Bring extra supplies');
    } else {
      fallbackRecs.push('Standard preparations adequate', 'Enjoy your trip!');
    }
    if (terrain === 'Mountain') fallbackRecs.push('Acclimatize gradually', 'Carry altitude medication');
    if (terrain === 'Desert') fallbackRecs.push('Carry 1 gallon water per person per day', 'Hike during cooler hours');
    if (season === 'Winter') fallbackRecs.push('Check avalanche forecasts', 'Carry avalanche safety gear');

    const factors = [...new Set(riskFactors)];
    const dedupedFallback = [...new Set(fallbackRecs)];

    // AI-enhanced recommendations. aiService.generateRiskRecommendations()
    // returns [] on any failure (no key, Groq error, bad JSON), which
    // is exactly our signal to use the static fallback.
    let recommendations = dedupedFallback;
    try {
      const aiRecs = await aiService.generateRiskRecommendations({
        terrain,
        season,
        duration,
        experience,
        riskLevel: overallRisk,
        factors,
      });
      if (Array.isArray(aiRecs) && aiRecs.length > 0) {
        recommendations = [...new Set(aiRecs)];
      }
    } catch (aiErr) {
      // Defensive: aiService already swallows errors, but if anything
      // slips through we still want the card to render.
      console.error('Risk recommendations AI call failed:', aiErr);
    }

    const cappedScore = Math.min(riskScore, 100);

    res.json({
      // New field names read by the frontend checklist card.
      riskLevel: overallRisk,
      riskScore: cappedScore,
      factors,
      // Legacy field names asserted on by backend/__tests__/risk.test.js.
      // Kept for backwards compatibility; safe to remove once all
      // consumers migrate.
      overallRisk,
      riskFactors: factors,
      recommendations,
      emergencyContacts: ['Local Rangers: 911', 'Search & Rescue: Contact local authority'],
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Risk analysis error:', error);
    res.status(500).json({ message: 'Failed to generate risk analysis' });
  }
});

module.exports = router;
