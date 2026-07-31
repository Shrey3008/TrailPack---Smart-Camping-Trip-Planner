// Jest setup: populate required env vars BEFORE any app modules are required.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.CORS_ALLOWED_ORIGINS = 'https://trailpack.com,*.netlify.app';

// MONGODB_URI is deliberately NOT set: tests connect Mongoose to an in-memory
// mongod via __tests__/helpers/db.js, and server.js only calls connectDB() when
// run directly, so requiring the app never touches a real database.

// EMAIL_USER / EMAIL_PASS are deliberately left unset so emailService stays in
// its unconfigured no-op mode and sendEmail() resolves { skipped: true }.

// No GROQ_API_KEY: aiService then reports AI_NOT_CONFIGURED rather than making
// live calls to Groq from the test suite.
