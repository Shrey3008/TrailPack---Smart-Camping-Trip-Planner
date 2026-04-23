const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Try multiple variations of the location string to improve geocoding hit-rate.
// Returns the most populous match, which usually corresponds to the well-known place.
async function geocodeLocation(location) {
  const variants = [];
  variants.push(location.trim());
  if (location.includes(',')) {
    variants.push(location.split(',')[0].trim());
  }
  const words = location.trim().split(/\s+/);
  if (words.length > 1) {
    variants.push(words[0]);
  }
  const unique = [...new Set(variants)];
  for (const variant of unique) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(variant)}&count=10&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) continue;
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      // Prefer the most populous result (likely the famous one)
      const sorted = [...data.results].sort((a, b) => (b.population || 0) - (a.population || 0));
      return sorted[0];
    }
  }
  return null;
}

// GET /weather?location=LocationName&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Uses Open-Meteo APIs (no API key required)
router.get('/', authenticate, async (req, res) => {
  try {
    const { location, startDate, endDate } = req.query;

    if (!location) {
      return res.status(400).json({ message: 'location is required' });
    }

    // 1. Geocode the location name to lat/lon
    const place = await geocodeLocation(location);
    if (!place) {
      return res.status(404).json({ message: `Location "${location}" not found` });
    }
    const { latitude, longitude, name, country, admin1 } = place;

    // 2. Fetch forecast from Open-Meteo
    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&timezone=auto&forecast_days=16`;

    if (startDate && endDate) {
      forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
        `&start_date=${startDate}&end_date=${endDate}&timezone=auto`;
    }

    const wxResp = await fetch(forecastUrl);
    if (!wxResp.ok) {
      return res.status(502).json({ message: 'Weather request failed' });
    }
    const wxData = await wxResp.json();

    res.json({
      location: {
        name,
        country,
        region: admin1,
        latitude,
        longitude
      },
      current: wxData.current || null,
      daily: wxData.daily || null,
      units: {
        daily: wxData.daily_units,
        current: wxData.current_units
      }
    });
  } catch (error) {
    console.error('[Weather] Error:', error);
    res.status(500).json({ message: 'Error fetching weather: ' + error.message });
  }
});

// GET /weather/suggestions?location=X&startDate=Y&endDate=Z
// Returns weather-based packing suggestions
router.get('/suggestions', authenticate, async (req, res) => {
  try {
    const { location, startDate, endDate } = req.query;
    if (!location) {
      return res.status(400).json({ message: 'location is required' });
    }

    const place = await geocodeLocation(location);
    if (!place) {
      return res.status(404).json({ message: `Location "${location}" not found` });
    }
    const { latitude, longitude } = place;

    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16`;
    if (startDate && endDate) {
      forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&start_date=${startDate}&end_date=${endDate}&timezone=auto`;
    }
    const wxResp = await fetch(forecastUrl);
    const wxData = await wxResp.json();
    const daily = wxData.daily || {};

    const maxTemps = daily.temperature_2m_max || [];
    const minTemps = daily.temperature_2m_min || [];
    const precip = daily.precipitation_sum || [];
    const precipProb = daily.precipitation_probability_max || [];
    const windSpeed = daily.wind_speed_10m_max || [];

    const maxHigh = maxTemps.length ? Math.max(...maxTemps) : null;
    const minLow = minTemps.length ? Math.min(...minTemps) : null;
    const totalPrecip = precip.reduce((a, b) => a + (b || 0), 0);
    const maxPrecipProb = precipProb.length ? Math.max(...precipProb) : 0;
    const maxWind = windSpeed.length ? Math.max(...windSpeed) : 0;

    const suggestions = [];

    // Temperature-based
    if (minLow !== null && minLow < 0) {
      suggestions.push({ icon: '🧥', text: 'Heavy winter jacket (temps below freezing)', priority: 'high' });
      suggestions.push({ icon: '🧤', text: 'Thermal gloves and hat', priority: 'high' });
      suggestions.push({ icon: '🛏️', text: 'Sub-zero sleeping bag', priority: 'high' });
    } else if (minLow !== null && minLow < 10) {
      suggestions.push({ icon: '🧥', text: 'Warm jacket (cold nights)', priority: 'high' });
      suggestions.push({ icon: '🧦', text: 'Thermal base layers', priority: 'medium' });
    }
    if (maxHigh !== null && maxHigh > 28) {
      suggestions.push({ icon: '👕', text: 'Lightweight breathable clothing (hot days)', priority: 'high' });
      suggestions.push({ icon: '🧴', text: 'Extra sunscreen (SPF 30+)', priority: 'high' });
      suggestions.push({ icon: '💧', text: 'Extra water / hydration bladder', priority: 'high' });
      suggestions.push({ icon: '🧢', text: 'Wide-brim hat', priority: 'medium' });
    }

    // Precipitation-based
    if (maxPrecipProb > 60 || totalPrecip > 10) {
      suggestions.push({ icon: '🧥', text: 'Waterproof rain jacket', priority: 'high' });
      suggestions.push({ icon: '👖', text: 'Rain pants', priority: 'medium' });
      suggestions.push({ icon: '⛺', text: 'Tent with rainfly / tarp', priority: 'high' });
      suggestions.push({ icon: '🥾', text: 'Waterproof boots', priority: 'high' });
    } else if (maxPrecipProb > 30) {
      suggestions.push({ icon: '🧥', text: 'Light rain jacket (possible showers)', priority: 'medium' });
    }

    // Wind-based
    if (maxWind > 40) {
      suggestions.push({ icon: '🪢', text: 'Extra tent stakes and guy-lines (high winds)', priority: 'high' });
      suggestions.push({ icon: '🧥', text: 'Wind-resistant shell layer', priority: 'medium' });
    }

    // Always include
    suggestions.push({ icon: '🔦', text: 'Headlamp with extra batteries', priority: 'medium' });
    suggestions.push({ icon: '🩹', text: 'First-aid kit', priority: 'high' });

    res.json({
      summary: {
        highTempC: maxHigh,
        lowTempC: minLow,
        totalPrecipMm: Math.round(totalPrecip * 10) / 10,
        maxPrecipProbability: maxPrecipProb,
        maxWindKmh: maxWind
      },
      suggestions
    });
  } catch (error) {
    console.error('[Weather Suggestions] Error:', error);
    res.status(500).json({ message: 'Error: ' + error.message });
  }
});

module.exports = router;
