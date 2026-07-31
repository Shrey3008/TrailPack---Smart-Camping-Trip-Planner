// Guards the test environment's isolation.
//
// server.js calls dotenv.config() at import time. Before this was gated on
// NODE_ENV, requiring the app inside a test pulled the developer's real .env
// into the process: the suite made live (billable) Groq calls, and
// process.env.MONGODB_URI pointed at production Atlas — one stray connectDB()
// away from running the tests against real user data.
//
// These assertions are cheap and fail loudly if that regresses.
require('../server'); // must not repopulate the environment from .env

describe('test environment isolation', () => {
  test('no real database URI is present', () => {
    expect(process.env.MONGODB_URI).toBeUndefined();
  });

  test('no AI credentials are present, so tests cannot make billable calls', () => {
    expect(process.env.GROQ_API_KEY).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  test('no mail credentials are present, so tests cannot send email', () => {
    expect(process.env.EMAIL_USER).toBeUndefined();
    expect(process.env.EMAIL_PASS).toBeUndefined();
  });

  test('NODE_ENV is test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
