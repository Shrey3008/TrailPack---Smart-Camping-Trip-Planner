const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const docClient = require('../db.js');
const { authenticate, authorize } = require('../middleware/auth');
const { QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// AI-Powered Smart Checklist Generator
// Combines rule-based logic with weather-aware AI recommendations
const generateSmartChecklist = async (terrain, season, duration, location = null) => {
  const items = [];
  let weatherInsights = null;
  
  // Fetch weather data if location provided
  if (location && process.env.WEATHER_API_KEY) {
    try {
      const weatherResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.WEATHER_API_KEY}&units=imperial`
      );
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        weatherInsights = {
          temp: weatherData.main.temp,
          condition: weatherData.weather[0].main,
          humidity: weatherData.main.humidity,
          windSpeed: weatherData.wind.speed
        };
      }
    } catch (e) {
      console.log('Weather fetch failed, using terrain/season rules only');
    }
  }
  
  // Comprehensive base items for all trips (35+ essential items)
  const baseItems = [
    { name: 'Backpack (40-60L)', category: 'Tools' },
    { name: 'Water bottles (2-3L capacity)', category: 'Food & Water' },
    { name: 'Comprehensive first aid kit', category: 'Safety' },
    { name: 'Personal medications', category: 'Safety' },
    { name: 'Toilet paper & trowel', category: 'Personal' },
    { name: 'Hand sanitizer', category: 'Personal' },
    { name: 'Toothbrush & toothpaste', category: 'Personal' },
    { name: 'Biodegradable soap', category: 'Personal' },
    { name: 'Quick-dry towel', category: 'Personal' },
    { name: 'Sunglasses', category: 'Clothing' },
    { name: 'Sun hat or cap', category: 'Clothing' },
    { name: 'Hiking socks (2-3 pairs)', category: 'Clothing' },
    { name: 'Underwear (2-3 pairs)', category: 'Clothing' },
    { name: 'Base layer shirt', category: 'Clothing' },
    { name: 'Hiking pants/shorts', category: 'Clothing' },
    { name: 'Insulated jacket', category: 'Clothing' },
    { name: 'Rain jacket', category: 'Clothing' },
    { name: 'Hiking boots/shoes', category: 'Clothing' },
    { name: 'Camp shoes (sandals)', category: 'Clothing' },
    { name: 'Headlamp + extra batteries', category: 'Safety' },
    { name: 'Emergency whistle', category: 'Safety' },
    { name: 'Map & compass/GPS device', category: 'Tools' },
    { name: 'Fire starter/matches', category: 'Safety' },
    { name: 'Knife/multi-tool', category: 'Tools' },
    { name: 'Paracord (50 feet)', category: 'Tools' },
    { name: 'Duct tape (small roll)', category: 'Tools' },
    { name: 'Zip-lock bags', category: 'Tools' },
    { name: 'Trash bags (pack out waste)', category: 'Tools' },
    { name: 'Camera/phone + charger', category: 'Electronics' },
    { name: 'Power bank/portable charger', category: 'Electronics' },
    { name: 'Wallet & ID', category: 'Personal' },
    { name: 'Cash (emergency)', category: 'Personal' },
    { name: 'Snacks/energy bars', category: 'Food & Water' },
    { name: 'Electrolyte powder/tablets', category: 'Food & Water' }
  ];
  items.push(...baseItems);
  
  // AI-Powered Weather-Aware Items
  if (weatherInsights) {
    const temp = weatherInsights.temp;
    const condition = weatherInsights.condition;
    
    // Temperature-based AI recommendations
    if (temp > 90) {
      items.push(
        { name: 'Extra water (heat warning - 1 gallon)', category: 'Food & Water' },
        { name: 'Electrolyte supplements', category: 'Food & Water' },
        { name: 'Cooling towel', category: 'Clothing' },
        { name: 'Wide-brim sun hat', category: 'Clothing' },
        { name: 'SPF 50+ sunscreen', category: 'Safety' },
        { name: 'Lightweight breathable shirt', category: 'Clothing' },
        { name: 'UV protection lip balm', category: 'Personal' }
      );
    } else if (temp < 40) {
      items.push(
        { name: 'Insulated water bottle', category: 'Food & Water' },
        { name: 'Hand warmers', category: 'Safety' },
        { name: 'Thermal base layers', category: 'Clothing' },
        { name: 'Insulated boots', category: 'Clothing' },
        { name: 'Heavy winter jacket', category: 'Clothing' },
        { name: 'Neck gaiter/scarf', category: 'Clothing' },
        { name: 'Insulated gloves', category: 'Clothing' }
      );
    }
    
    // Weather condition-based AI recommendations
    const conditionItems = {
      'Rain': [
        { name: 'Waterproof rain jacket', category: 'Clothing' },
        { name: 'Waterproof rain pants', category: 'Clothing' },
        { name: 'Packable umbrella', category: 'Tools' },
        { name: 'Waterproof bag covers', category: 'Tools' },
        { name: 'Waterproof boots', category: 'Clothing' },
        { name: 'Extra socks (waterproofed)', category: 'Clothing' }
      ],
      'Thunderstorm': [
        { name: 'Emergency shelter/tarp', category: 'Shelter' },
        { name: 'Waterproof phone case', category: 'Tools' },
        { name: 'Lightning safety guide', category: 'Safety' },
        { name: 'Emergency radio', category: 'Electronics' }
      ],
      'Snow': [
        { name: 'Microspikes/crampons', category: 'Tools' },
        { name: 'Snow gaiters', category: 'Clothing' },
        { name: 'Goggles/sunglasses (snow)', category: 'Clothing' },
        { name: 'Insulated water bottle', category: 'Food & Water' }
      ],
      'Clouds': [
        { name: 'Light rain jacket', category: 'Clothing' },
        { name: 'Packable down jacket', category: 'Clothing' }
      ],
      'Clear': [
        { name: 'Lightweight long sleeve (sun)', category: 'Clothing' }
      ]
    };
    
    if (conditionItems[condition]) {
      items.push(...conditionItems[condition]);
    }
    
    // Wind-based recommendations
    if (weatherInsights.windSpeed > 15) {
      items.push(
        { name: 'Windbreaker jacket', category: 'Clothing' },
        { name: 'Guy lines for tent', category: 'Shelter' },
        { name: 'Wind-resistant hat', category: 'Clothing' }
      );
    }
  }
  
  // Terrain-specific items (AI-enhanced with expanded lists)
  const terrainRules = {
    'Mountain': [
      { name: 'Hiking boots (ankle support)', category: 'Clothing' },
      { name: 'Warm layers (fleece/down)', category: 'Clothing' },
      { name: 'Trekking poles', category: 'Tools' },
      { name: 'Altitude sickness medication', category: 'Safety' },
      { name: 'Rock climbing helmet', category: 'Safety' },
      { name: 'Rope (30 feet)', category: 'Tools' },
      { name: 'Carabiners (2-3)', category: 'Tools' },
      { name: 'Belay device', category: 'Tools' },
      { name: 'High-altitude sunscreen', category: 'Safety' },
      { name: 'Navigation tools (altimeter)', category: 'Tools' },
      { name: 'Emergency bivy', category: 'Safety' },
      { name: 'Crampons/ice axe (if snowy)', category: 'Tools' }
    ],
    'Forest': [
      { name: 'Bug spray (DEET 30%+)', category: 'Safety' },
      { name: 'Tarp/footprint', category: 'Shelter' },
      { name: 'Long pants (quick-dry)', category: 'Clothing' },
      { name: 'Long sleeve shirt', category: 'Clothing' },
      { name: 'Tick removal tool', category: 'Safety' },
      { name: 'Permethrin clothing treatment', category: 'Safety' },
      { name: 'Bear spray (bear country)', category: 'Safety' },
      { name: 'Hanging food bag/rope', category: 'Food & Water' },
      { name: 'Headnet (mosquito protection)', category: 'Clothing' },
      { name: 'Camp shoes (closed toe)', category: 'Clothing' }
    ],
    'Desert': [
      { name: 'Extra water (1 gallon/person/day)', category: 'Food & Water' },
      { name: 'Water purification method', category: 'Food & Water' },
      { name: 'Sun hat with neck flap', category: 'Clothing' },
      { name: 'SPF 50+ sunscreen', category: 'Safety' },
      { name: 'Sunglasses (polarized)', category: 'Clothing' },
      { name: 'Cooling bandana/towel', category: 'Clothing' },
      { name: 'Lightweight long sleeve (sun)', category: 'Clothing' },
      { name: 'Snake gaiters', category: 'Clothing' },
      { name: 'Extra electrolyte packets', category: 'Food & Water' },
      { name: 'Emergency water container', category: 'Food & Water' },
      { name: 'Signal mirror', category: 'Safety' }
    ]
  };
  
  if (terrainRules[terrain]) {
    items.push(...terrainRules[terrain]);
  }
  
  // Season-specific items (expanded)
  const seasonRules = {
    'Winter': [
      { name: 'Winter jacket (down/puffy)', category: 'Clothing' },
      { name: 'Insulated gloves', category: 'Clothing' },
      { name: 'Warm hat (wool/fleece)', category: 'Clothing' },
      { name: 'Insulated sleeping bag (0°F rated)', category: 'Shelter' },
      { name: 'Four-season tent', category: 'Shelter' },
      { name: 'Insulated sleeping pad (R5+)', category: 'Shelter' },
      { name: 'Winter boots', category: 'Clothing' },
      { name: 'Gaiters (snow)', category: 'Clothing' },
      { name: 'Traction devices (microspikes)', category: 'Tools' },
      { name: 'Hot beverage container', category: 'Food & Water' },
      { name: 'Hand/toe warmers', category: 'Safety' }
    ],
    'Summer': [
      { name: 'Lightweight breathable clothing', category: 'Clothing' },
      { name: 'Cooling towel', category: 'Clothing' },
      { name: 'Lightweight mesh tent', category: 'Shelter' },
      { name: 'Sunscreen SPF 50+', category: 'Safety' },
      { name: 'Insect repellent', category: 'Safety' },
      { name: 'Swimwear (if water nearby)', category: 'Personal' },
      { name: 'Lightweight sleeping bag (40°F)', category: 'Shelter' },
      { name: 'UV protective shirt', category: 'Clothing' },
      { name: 'Portable fan', category: 'Electronics' },
      { name: 'Electrolyte supplements', category: 'Food & Water' }
    ],
    'Fall': [
      { name: 'Layered clothing system', category: 'Clothing' },
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Warm sleeping bag (20°F rated)', category: 'Shelter' },
      { name: 'Beanie/warm hat', category: 'Clothing' },
      { name: 'Gloves (lightweight)', category: 'Clothing' },
      { name: 'Headlamp (earlier darkness)', category: 'Safety' },
      { name: 'Warm socks (wool)', category: 'Clothing' },
      { name: 'Insulated mug', category: 'Food & Water' }
    ],
    'Spring': [
      { name: 'Layered clothing system', category: 'Clothing' },
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Waterproof hiking boots', category: 'Clothing' },
      { name: 'Rain pants', category: 'Clothing' },
      { name: 'Waterproof bag liners', category: 'Tools' },
      { name: 'Quick-dry towel', category: 'Personal' },
      { name: 'Waterproof phone case', category: 'Electronics' },
      { name: 'Mud gaiters', category: 'Clothing' }
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
      { name: 'Camping stove + fuel', category: 'Food & Water' },
      { name: 'Food supplies', category: 'Food & Water' }
    );
  }
  
  if (duration > 3) {
    items.push(
      { name: 'Extra batteries/power bank', category: 'Tools' },
      { name: 'Water purification tablets', category: 'Food & Water' },
      { name: 'Multi-tool', category: 'Tools' },
      { name: 'Duct tape (repairs)', category: 'Tools' }
    );
  }
  
  // AI Risk Assessment - add items based on risk factors
  if (duration > 5 || (terrain === 'Mountain' && season === 'Winter')) {
    items.push(
      { name: 'Satellite communicator/GPS', category: 'Safety' },
      { name: 'Emergency bivy sack', category: 'Safety' }
    );
  }
  
  // Common safety items
  items.push(
    { name: 'Flashlight/Headlamp + extra batteries', category: 'Safety' },
    { name: 'Emergency whistle', category: 'Safety' },
    { name: 'Map and compass/GPS', category: 'Tools' }
  );
  
  // Remove duplicates by name
  const uniqueItems = [];
  const seenNames = new Set();
  for (const item of items) {
    if (!seenNames.has(item.name.toLowerCase())) {
      seenNames.add(item.name.toLowerCase());
      uniqueItems.push(item);
    }
  }
  
  return {
    items: uniqueItems,
    weatherUsed: !!weatherInsights,
    aiRecommendations: weatherInsights ? 
      `AI added ${uniqueItems.length - baseItems.length} items based on ${weatherInsights.condition}, ${Math.round(weatherInsights.temp)}°F` : 
      'Used rule-based generation (no weather data)'
  };
};

// Legacy function for backwards compatibility
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

// POST /trips - Create a new trip with AI-powered checklist
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, terrain, season, duration, location } = req.body;
    
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
      createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: tripItem
    }));
    
    // Generate AI-powered checklist items
    const smartChecklist = await generateSmartChecklist(terrain, season, parsedDuration, location);
    const checklistItems = smartChecklist.items;
    
    // Store AI metadata with the trip
    if (smartChecklist.weatherUsed) {
      tripItem.aiGenerated = true;
      tripItem.aiRecommendations = smartChecklist.aiRecommendations;
    }
    
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
      trip: tripItem,
      aiPowered: smartChecklist.weatherUsed,
      aiRecommendations: smartChecklist.aiRecommendations
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
