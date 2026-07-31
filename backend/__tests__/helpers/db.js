// In-memory MongoDB lifecycle for the test suite.
//
// The old tests stubbed DynamoDBDocumentClient with aws-sdk-client-mock and
// asserted on the command objects sent to it. After the move to Mongo there is
// no SDK to intercept, so instead of mocking a driver we run a real mongod in
// memory and let the actual Mongoose models execute. Tests therefore exercise
// the real schemas, indexes, validation and query logic rather than a
// hand-written imitation of them.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod = null;

// Start a throwaway mongod and point Mongoose at it. Safe to call once per
// test file from beforeAll().
async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'trailpack-test' });
}

// Wipe every collection between tests so cases stay independent. Deleting
// documents (rather than dropping collections) keeps the indexes that the
// models declared at connect time — including the unique ones the tests rely
// on to prove duplicates are rejected.
async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
}

async function close() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connect, clear, close };
