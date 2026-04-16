const axios = require('axios');
const OpenAI = require('openai');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.weatherAPIKey = process.env.WEATHER_API_KEY;
    this.mapboxToken = process.env.MAPBOX_TOKEN;
  }

  // Weather prediction using OpenWeatherMap API
  async getWeatherPrediction(location, startDate, endDate) {
    try {
      const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${location}&appid=${this.weatherAPIKey}&units=metric`;
      const response = await axios.get(weatherUrl);
      
      const forecast = response.data.list;
      const predictions = forecast.map(item => ({
        date: new Date(item.dt * 1000),
        temperature: item.main.temp,
        condition: item.weather[0].main,
        description: item.weather[0].description,
        humidity: item.main.humidity,
        windSpeed: item.wind.speed,
        precipitation: item.pop * 100
      }));

      // Generate AI-powered weather insights
      const insights = await this.generateWeatherInsights(predictions, startDate, endDate);
      
      return {
        location,
        predictions,
        insights,
        recommendations: this.generateWeatherRecommendations(predictions)
      };
    } catch (error) {
      console.error('Weather API Error:', error);
      throw new Error('Failed to fetch weather data');
    }
  }

  // Generate AI-powered weather insights
  async generateWeatherInsights(predictions, startDate, endDate) {
    try {
      const weatherSummary = predictions.map(p => 
        `${p.date.toDateString()}: ${p.temperature}°C, ${p.description}, ${p.precipitation}% rain`
      ).join('\n');

      const prompt = `
        Based on this weather forecast for a camping trip from ${startDate} to ${endDate}:
        ${weatherSummary}
        
        Provide 3-4 key insights for campers:
        1. Weather patterns and trends
        2. Potential risks or challenges
        3. Best preparation strategies
        4. Optimal gear recommendations
        
        Keep it concise and practical for outdoor enthusiasts.
      `;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI Error:', error);
      return "Weather insights temporarily unavailable";
    }
  }

  // Generate weather-based recommendations
  generateWeatherRecommendations(predictions) {
    const recommendations = [];
    const avgTemp = predictions.reduce((sum, p) => sum + p.temperature, 0) / predictions.length;
    const maxPrecipitation = Math.max(...predictions.map(p => p.precipitation));
    const hasHighWinds = predictions.some(p => p.windSpeed > 10);

    if (avgTemp < 5) {
      recommendations.push({
        category: 'Clothing',
        priority: 'high',
        item: 'Insulated sleeping bag (0°C rating)',
        reason: 'Expected cold temperatures'
      });
    }

    if (maxPrecipitation > 60) {
      recommendations.push({
        category: 'Shelter',
        priority: 'high',
        item: 'Waterproof tent with rainfly',
        reason: 'High probability of rain'
      });
    }

    if (hasHighWinds) {
      recommendations.push({
        category: 'Shelter',
        priority: 'medium',
        item: 'Extra tent stakes and guylines',
        reason: 'Windy conditions expected'
      });
    }

    return recommendations;
  }

  // Route optimization using Mapbox API
  async optimizeRoute(startPoint, endPoint, waypoints = [], terrain = 'Mountain') {
    try {
      const coordinates = [startPoint, ...waypoints, endPoint].join(';');
      const routeUrl = `https://api.mapbox.com/directions/v5/mapbox/hiking/${coordinates}?access_token=${this.mapboxToken}&geometries=geojson&steps=true`;
      
      const response = await axios.get(routeUrl);
      const route = response.data.routes[0];

      // Generate AI-powered route insights
      const insights = await this.generateRouteInsights(route, terrain);

      return {
        distance: route.distance / 1000, // Convert to km
        duration: route.duration / 3600, // Convert to hours
        geometry: route.geometry,
        steps: route.legs[0].steps,
        elevation: await this.getElevationData(route.geometry.coordinates),
        insights,
        difficulty: this.assessRouteDifficulty(route, terrain)
      };
    } catch (error) {
      console.error('Route API Error:', error);
      throw new Error('Failed to optimize route');
    }
  }

  // Generate AI-powered route insights
  async generateRouteInsights(route, terrain) {
    try {
      const prompt = `
        Analyze this hiking route for a ${terrain} camping trip:
        - Distance: ${(route.distance / 1000).toFixed(1)} km
        - Duration: ${(route.duration / 3600).toFixed(1)} hours
        - Terrain: ${terrain}
        
        Provide insights on:
        1. Route difficulty and challenges
        2. Best camping spots along the way
        3. Water sources and resupply points
        4. Safety considerations
        5. Optimal departure times
        
        Keep it practical and informative for hikers.
      `;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI Error:', error);
      return "Route insights temporarily unavailable";
    }
  }

  // Get elevation data for route
  async getElevationData(coordinates) {
    try {
      const coords = coordinates.map(coord => coord.join(',')).join(';');
      const elevationUrl = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${coords}.json?access_token=${this.mapboxToken}`;
      
      const response = await axios.get(elevationUrl);
      return response.data.features.map(feature => feature.properties.elevation);
    } catch (error) {
      console.error('Elevation API Error:', error);
      return [];
    }
  }

  // Assess route difficulty
  assessRouteDifficulty(route, terrain) {
    const distance = route.distance / 1000; // km
    const duration = route.duration / 3600; // hours
    const elevationGain = this.calculateElevationGain(route.legs[0].steps);
    
    let difficulty = 'Easy';
    let score = 0;

    // Distance scoring
    if (distance > 15) score += 2;
    else if (distance > 8) score += 1;

    // Duration scoring
    if (duration > 8) score += 2;
    else if (duration > 4) score += 1;

    // Elevation scoring
    if (elevationGain > 1000) score += 2;
    else if (elevationGain > 500) score += 1;

    // Terrain scoring
    if (terrain === 'Mountain') score += 2;
    else if (terrain === 'Desert') score += 1;

    if (score >= 5) difficulty = 'Hard';
    else if (score >= 3) difficulty = 'Moderate';

    return { difficulty, score };
  }

  // Calculate elevation gain from route steps
  calculateElevationGain(steps) {
    return steps.reduce((total, step) => {
      return total + (step.elevation_up || 0);
    }, 0);
  }

  // Generate personalized recommendations using AI
  async generatePersonalizedRecommendations(userProfile, tripDetails) {
    try {
      const prompt = `
        Based on this user profile and trip details, generate personalized camping recommendations:

        User Profile:
        - Experience Level: ${userProfile.experienceLevel || 'Beginner'}
        - Preferred Activities: ${userProfile.activities?.join(', ') || 'Hiking, Camping'}
        - Physical Fitness: ${userProfile.fitnessLevel || 'Moderate'}
        - Past Trips: ${userProfile.pastTrips || 'None specified'}

        Trip Details:
        - Destination: ${tripDetails.location || 'Not specified'}
        - Duration: ${tripDetails.duration} days
        - Terrain: ${tripDetails.terrain}
        - Season: ${tripDetails.season}
        - Group Size: ${tripDetails.participants || 1}

        Provide recommendations for:
        1. Essential gear specific to this trip
        2. Activities and attractions
        3. Safety considerations
        4. Pro tips based on experience level
        5. Packing checklist modifications

        Format as a structured, actionable guide.
      `;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.7
      });

      return {
        recommendations: completion.choices[0].message.content,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('OpenAI Error:', error);
      return {
        recommendations: "Personalized recommendations temporarily unavailable",
        generatedAt: new Date().toISOString()
      };
    }
  }

  // Generate trip summary and highlights
  async generateTripSummary(tripData, checklistItems, activities) {
    try {
      const prompt = `
        Create an engaging trip summary based on this data:
        
        Trip: ${tripData.name}
        Location: ${tripData.location || 'Not specified'}
        Duration: ${tripData.duration} days
        Terrain: ${tripData.terrain}
        Season: ${tripData.season}
        
        Checklist Progress: ${checklistItems?.packed || 0}/${checklistItems?.total || 0} items packed
        Activities: ${activities?.join(', ') || 'Not specified'}
        
        Generate:
        1. A catchy trip title
        2. 3-4 key highlights
        3. Preparation status summary
        4. Excitement level (1-10)
        5. Pro tip for this trip
        
        Keep it inspiring and motivating!
      `;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.8
      });

      return {
        summary: completion.choices[0].message.content,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('OpenAI Error:', error);
      return {
        summary: "Trip summary temporarily unavailable",
        generatedAt: new Date().toISOString()
      };
    }
  }
}

module.exports = new AIService();
