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
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.USERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email }
    }));
    return result.Items?.[0];
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
      UpdateExpression: `set ${updateExpression}, updatedAt = :updatedAt`,
      ExpressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      }
    }));
  },

  // Trip Operations
  createTrip: async (userId, tripData) => {
    const tripId = uuidv4();
    const item = {
      tripId,
      userId,
      ...tripData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
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

    await docClient.send(new UpdateCommand({
      TableName: TABLES.TRIPS,
      Key: { tripId },
      UpdateExpression: `set ${updateExpression}, updatedAt = :updatedAt`,
      ExpressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      }
    }));
  },

  deleteTrip: async (tripId) => {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.TRIPS,
      Key: { tripId }
    }));
  },

  // Checklist Item Operations
  createItem: async (tripId, itemData) => {
    const itemId = uuidv4();
    const item = {
      itemId,
      tripId,
      ...itemData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
    const expressionAttributeValues = Object.entries(updates).reduce((acc, [key, value]) => ({
      ...acc,
      [`:${key}`]: value
    }), {});

    await docClient.send(new UpdateCommand({
      TableName: TABLES.ITEMS,
      Key: { itemId },
      UpdateExpression: `set ${updateExpression}, updatedAt = :updatedAt`,
      ExpressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString()
      }
    }));
  },

  deleteItem: async (itemId) => {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.ITEMS,
      Key: { itemId }
    }));
  }
};

module.exports = { dynamoDBService, TABLES };
