// SECURITY REGRESSION GUARD: unlimited attempts on the auth surface.
//
// /auth/login and /auth/forgot/* accepted unbounded attempts. Security answers
// are low-entropy ("what city were you born in") and normalised to lowercase
// before comparison, so /auth/forgot/verify-answer was brute-forceable in
// minutes. Verified against production before the fix: 25 consecutive wrong
// passwords all returned 401, never 429.
//
// __tests__/setupAfterEnv.js resets the limiter counters between tests, so the
// middleware is live in every suite but only this one exhausts it.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User } = require('../models');

// Must match the defaults in middleware/rateLimit.js.
const CREDENTIAL_LIMIT = 8;

const USER = {
  userId: 'u1',
  name: 'U',
  email: 'u@test.com',
  role: 'user',
  isActive: true,
  securityQuestion: 'What city were you born in?',
  securityAnswer: 'boston',
};

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  await User.create({ ...USER, password: await bcrypt.hash('right-password', 10) });
});

async function attempt(path, body) {
  return request(app).post(path).send(body);
}

describe('POST /auth/login is throttled', () => {
  test('THE EXPLOIT: repeated wrong passwords start returning 429', async () => {
    const codes = [];
    for (let i = 0; i < CREDENTIAL_LIMIT + 3; i++) {
      const res = await attempt('/auth/login', { email: USER.email, password: `wrong-${i}` });
      codes.push(res.status);
    }

    // Old behaviour: every single one was a 401.
    expect(codes).toContain(429);
    expect(codes.slice(0, CREDENTIAL_LIMIT).every(c => c === 401)).toBe(true);
    expect(codes[codes.length - 1]).toBe(429);
  });

  test('the throttle refuses the correct password too, once tripped', async () => {
    for (let i = 0; i < CREDENTIAL_LIMIT; i++) {
      await attempt('/auth/login', { email: USER.email, password: `wrong-${i}` });
    }

    const res = await attempt('/auth/login', { email: USER.email, password: 'right-password' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too many/i);
  });

  test('successful logins are not counted against the quota', async () => {
    // skipSuccessfulRequests: a working session shouldn't burn its own budget.
    for (let i = 0; i < CREDENTIAL_LIMIT + 5; i++) {
      const res = await attempt('/auth/login', { email: USER.email, password: 'right-password' });
      expect(res.status).toBe(200);
    }
  });

  test('one account being throttled does not lock out another', async () => {
    await User.create({
      userId: 'u2',
      name: 'Other',
      email: 'other@test.com',
      password: await bcrypt.hash('other-password', 10),
      role: 'user',
      isActive: true,
    });

    for (let i = 0; i < CREDENTIAL_LIMIT + 2; i++) {
      await attempt('/auth/login', { email: USER.email, password: `wrong-${i}` });
    }

    // Keyed on (IP, email), so the second account is unaffected.
    const res = await attempt('/auth/login', { email: 'other@test.com', password: 'other-password' });
    expect(res.status).toBe(200);
  });
});

describe('POST /auth/forgot/verify-answer is throttled', () => {
  test('THE EXPLOIT: guessing the security answer starts returning 429', async () => {
    const codes = [];
    for (let i = 0; i < CREDENTIAL_LIMIT + 3; i++) {
      const res = await attempt('/auth/forgot/verify-answer', {
        email: USER.email,
        answer: `guess-${i}`,
      });
      codes.push(res.status);
    }

    // Old behaviour: 200 { success: false } forever, as many times as you liked.
    expect(codes).toContain(429);
  });

  test('a throttled attacker cannot obtain a reset token', async () => {
    for (let i = 0; i < CREDENTIAL_LIMIT + 2; i++) {
      await attempt('/auth/forgot/verify-answer', { email: USER.email, answer: `guess-${i}` });
    }

    // Even the right answer is refused while the throttle holds, so the brute
    // force cannot be finished off with a lucky guess.
    const res = await attempt('/auth/forgot/verify-answer', { email: USER.email, answer: 'boston' });
    expect(res.status).toBe(429);
    expect(res.body.resetToken).toBeUndefined();
  });
});

describe('the limiter does not break ordinary use', () => {
  test('a handful of failed logins still answer 401', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await attempt('/auth/login', { email: USER.email, password: 'oops' });
      expect(res.status).toBe(401);
    }
  });

  test('a legitimate reset flow completes without tripping anything', async () => {
    const verify = await attempt('/auth/forgot/verify-answer', { email: USER.email, answer: 'Boston' });
    expect(verify.status).toBe(200);
    expect(verify.body.resetToken).toBeTruthy();

    const reset = await attempt('/auth/forgot/reset-password', {
      email: USER.email,
      newPassword: 'a-brand-new-password',
      resetToken: verify.body.resetToken,
    });
    expect(reset.status).toBe(200);
  });
});
