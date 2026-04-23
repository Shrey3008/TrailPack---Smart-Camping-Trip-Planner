// Jest setup: populate required env vars BEFORE any app modules are required.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.DYNAMODB_USERS_TABLE = 'TrailPack-Users-Test';
process.env.CORS_ALLOWED_ORIGINS = 'https://trailpack.com,*.netlify.app';
