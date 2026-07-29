// MongoDB (Atlas) connection — replaces the old DynamoDB client.
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your environment (see .env.example).');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'trailpack',
    serverSelectionTimeoutMS: 10000,
  });
  console.log('[db] Connected to MongoDB');
}

module.exports = { connectDB, mongoose };
