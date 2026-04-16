// AWS DynamoDB Configuration and Service
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// DynamoDB Client Configuration
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = DynamoDBDocumentClient.from(client);

// Table Names
const TABLES = {
  USERS: process.env.DYNAMODB_USERS_TABLE || 'TrailPack-Users',
  TRIPS: process.env.DYNAMODB_TRIPS_TABLE || 'TrailPack-Trips',
  ITEMS: process.env.DYNAMODB_ITEMS_TABLE || 'TrailPack-Items'
};

// DynamoDB Service
const dynamoDBService = {
  // User Operations
  createUser: async (userData) => {
    const userId = uuidv4();
    const item = {
      userId,
      ...userData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLES.USERS,
      Item: item
    }));
    
    return item;
  },

  getUserById: async (userId) => {
    const result = await docClient.send(new GetCommand({
      TableName: TABLES.USERS,
      Key: { userId }
    }));
    return result.Item;
  },

  getUserByEmail: async (email) => {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
      }));
      console.log('DEBUG getUserByEmail - Items found:', result.Items?.length || 0);
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      console.error('DEBUG getUserByEmail error:', error.message);
      return null;
    }
  },

  updateUser: async (userId, updates) => {
    const updateExpression = Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.keys(updates).reduce((acc, key) => ({
      ...acc,
      [`#${key}`]: key
    }), {});
    const expressionAttributeValues = Object.entries(updates).reduce((acc, [key, value]) => ({
      ...acc,
      [`:${key}`]: value
    }), {});

    await docClient.send(new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId },
      UpdateExpression: `set ${updateExpression}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        ...expressionAttributeNames,
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      }
    }));
  },

  // Trip Operations
  createTrip: async (userId, tripData) => {
    const tripId = String(uuidv4());
    const now = new Date().toISOString();
    
    // Build item with explicit string types only - avoid any nested objects
    const item = {
      tripId: tripId,
      userId: String(userId),
      name: String(tripData.name),
      terrain: String(tripData.terrain),
      season: String(tripData.season),
      duration: parseInt(tripData.duration),
      status: 'planning',
      createdAt: now,
      updatedAt: now
    };
    
    // Only add simple optional fields
    if (tripData.startDate) item.startDate = String(tripData.startDate);
    if (tripData.endDate) item.endDate = String(tripData.endDate);
    
    console.log('DEBUG - tripId value:', tripId);
    console.log('DEBUG - tripId type:', typeof tripId);
    console.log('DEBUG - item:', JSON.stringify(item));
    
    await docClient.send(new PutCommand({
      TableName: TABLES.TRIPS,
      Item: item
    }));
    
    return item;
  },

  getTripById: async (tripId) => {
    const result = await docClient.send(new GetCommand({
      TableName: TABLES.TRIPS,
      Key: { tripId }
    }));
    return result.Item;
  },

  getTripsByUser: async (userId) => {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.TRIPS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));
    return result.Items || [];
  },

  updateTrip: async (tripId, updates) => {
    const updateExpression = Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.keys(updates).reduce((acc, key) => ({
      ...acc,
      [`#${key}`]: key
    }), {});
    const expressionAttributeValues = Object.entries(updates).reduce((acc, [key, value]) => ({
      ...acc,
      [`:${key}`]: value
    }), {});

    const result = await docClient.send(new UpdateCommand({
      TableName: TABLES.TRIPS,
      Key: { tripId },
      UpdateExpression: `set ${updateExpression}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        ...expressionAttributeNames,
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    return result.Attributes;
  },

  deleteTrip: async (tripId) => {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.TRIPS,
      Key: { tripId }
    }));
  },

  // Checklist Item Operations
  createItem: async (tripId, itemData) => {
    const itemId = String(uuidv4());
    const now = new Date().toISOString();
    
    const item = {
      itemId: itemId,
      tripId: String(tripId),
      name: String(itemData.name || ''),
      category: String(itemData.category || ''),
      priority: String(itemData.priority || 'medium'),
      isChecked: false,
      createdAt: now,
      updatedAt: now
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLES.ITEMS,
      Item: item
    }));
    
    return item;
  },

  getItemById: async (itemId) => {
    const result = await docClient.send(new GetCommand({
      TableName: TABLES.ITEMS,
      Key: { itemId }
    }));
    return result.Item;
  },

  getItemsByTrip: async (tripId) => {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.ITEMS,
      IndexName: 'TripIdIndex',
      KeyConditionExpression: 'tripId = :tripId',
      ExpressionAttributeValues: { ':tripId': tripId }
    }));
    return result.Items || [];
  },

  updateItem: async (itemId, updates) => {
    const updateExpression = Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.keys(updates).reduce((acc, key) => ({
      ...acc,
      [`#${key}`]: key
    }), {});
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    
    const expressionAttributeValues = Object.entries(updates).reduce((acc, [key, value]) => ({
      ...acc,
      [`:${key}`]: value
    }), {});

    // Fixed case sensitivity for ExpressionAttributeNames
    await docClient.send(new UpdateCommand({
      TableName: TABLES.ITEMS,
      Key: { itemId },
      UpdateExpression: `set ${updateExpression}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      }
    }));
    
    return { itemId, ...updates, updatedAt: new Date().toISOString() };
  },

  deleteItem: async (itemId) => {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.ITEMS,
      Key: { itemId }
    }));
  },

  // User listing and filtering for admin
  getAllUsers: async (filters = {}) => {
    const { role, isActive } = filters;
    
    let filterExpression = '';
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};
    
    const conditions = [];
    
    if (role) {
      conditions.push('#role = :role');
      expressionAttributeNames['#role'] = 'role';
      expressionAttributeValues[':role'] = role;
    }
    
    if (isActive !== undefined) {
      conditions.push('#isActive = :isActive');
      expressionAttributeNames['#isActive'] = 'isActive';
      expressionAttributeValues[':isActive'] = isActive;
    }
    
    if (conditions.length > 0) {
      filterExpression = conditions.join(' AND ');
    }
    
    const params = {
      TableName: TABLES.USERS
    };
    
    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeNames = expressionAttributeNames;
      params.ExpressionAttributeValues = expressionAttributeValues;
    }
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
  },

  // Count users with filters
  countUsers: async (filters = {}) => {
    const users = await dynamoDBService.getAllUsers(filters);
    return users.length;
  },

  // Count all trips
  countTrips: async () => {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLES.TRIPS,
      Select: 'COUNT'
    }));
    return result.Count || 0;
  },

  // Count all items
  countItems: async () => {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLES.ITEMS,
      Select: 'COUNT'
    }));
    return result.Count || 0;
  },

  // Get users by role (for role distribution stats)
  getUsersByRole: async () => {
    const users = await dynamoDBService.getAllUsers({ isActive: true });
    const roleStats = {};
    users.forEach(user => {
      const role = user.role || 'user';
      roleStats[role] = (roleStats[role] || 0) + 1;
    });
    return Object.entries(roleStats).map(([role, count]) => ({ _id: role, count }));
  },

  // Get all trips for admin stats
  getAllTrips: async () => {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLES.TRIPS
    }));
    return result.Items || [];
  },

  // Get trips by status (for status distribution stats)
  getTripsByStatus: async () => {
    const trips = await dynamoDBService.getAllTrips();
    const statusStats = {};
    trips.forEach(trip => {
      const status = trip.status || 'planning';
      statusStats[status] = (statusStats[status] || 0) + 1;
    });
    return Object.entries(statusStats).map(([status, count]) => ({ _id: status, count }));
  },

  // Get recent users (last 30 days)
  getRecentUsers: async (days = 30) => {
    const users = await dynamoDBService.getAllUsers();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return users.filter(user => {
      const createdAt = new Date(user.createdAt);
      return createdAt >= cutoffDate;
    });
  },

  // Get recent trips (last 30 days)
  getRecentTrips: async (days = 30) => {
    const trips = await dynamoDBService.getAllTrips();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return trips.filter(trip => {
      const createdAt = new Date(trip.createdAt);
      return createdAt >= cutoffDate;
    });
  },

  // Get top users by trip count
  getTopUsers: async (limit = 5) => {
    const users = await dynamoDBService.getAllUsers({ isActive: true });
    
    // Sort by total trips (descending)
    return users
      .sort((a, b) => (b.stats?.totalTrips || 0) - (a.stats?.totalTrips || 0))
      .slice(0, limit)
      .map(user => ({
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        stats: user.stats || { totalTrips: 0, totalItemsPacked: 0 },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }));
  },

  // Get user by ID and return full user object
  getUserByIdFull: async (userId) => {
    const result = await docClient.send(new GetCommand({
      TableName: TABLES.USERS,
      Key: { userId }
    }));
    return result.Item;
  }
};

module.exports = dynamoDBService;
