// Jest setup: populate required env vars BEFORE any app modules are required.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.CORS_ALLOWED_ORIGINS = 'https://trailpack.com,*.netlify.app';

// Defence in depth. server.js skips dotenv when NODE_ENV==='test', but anything
// that loads .env by another route must still not reach real infrastructure, so
// delete these explicitly rather than merely relying on them being absent:
//
//   MONGODB_URI  - tests use an in-memory mongod (__tests__/helpers/db.js).
//                  A leaked production URI plus one stray connectDB() would
//                  point the whole suite at live data.
//   GROQ_API_KEY - keeps aiService in its AI_NOT_CONFIGURED state instead of
//                  making billable, network-dependent calls during tests.
//   EMAIL_*      - keeps emailService in no-op mode so sendEmail() resolves
//                  { skipped: true } and no mail is ever sent.
delete process.env.MONGODB_URI;
delete process.env.MONGODB_DB;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;
