// SECURITY REGRESSION GUARD: unauthenticated account takeover.
//
// POST /auth/forgot/reset-password used to accept { email, newPassword } and
// reset the password without ever checking that the caller had answered the
// account's security question — "verified" was tracked only in the SPA's
// memory. Knowing an email address was enough to take over the account.
// Verified exploitable against production before the fix.
//
// The first test below is the exploit itself. It fails against the old code
// (which answered 200 and let the attacker log in) and passes now.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('./helpers/db');
const { app } = require('../server');
const { User } = require('../models');

const QUESTION = 'What city were you born in?';
const VICTIM = {
  userId: 'victim-1',
  name: 'Victim',
  email: 'victim@test.com',
  role: 'user',
  isActive: true,
  securityQuestion: QUESTION,
  securityAnswer: 'boston', // stored normalised (lowercase + trimmed)
};

async function seedVictim() {
  await User.create({ ...VICTIM, password: await bcrypt.hash('original-password', 10) });
}

// Walk the legitimate flow and return the grant it issues.
async function getResetToken(answer = 'Boston') {
  const res = await request(app)
    .post('/auth/forgot/verify-answer')
    .send({ email: VICTIM.email, answer });
  return res.body.resetToken;
}

function canLogIn(password) {
  return request(app)
    .post('/auth/login')
    .send({ email: VICTIM.email, password })
    .then(r => r.status === 200);
}

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  await seedVictim();
});

describe('POST /auth/forgot/reset-password requires a grant', () => {
  test('THE EXPLOIT: knowing only the email cannot reset the password', async () => {
    const res = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'attacker-password' });

    // Old behaviour: 200 "Password updated successfully".
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/resetToken is required/i);

    // The account must be untouched.
    expect(await canLogIn('attacker-password')).toBe(false);
    expect(await canLogIn('original-password')).toBe(true);
  });

  test('a forged reset token is refused', async () => {
    const res = await request(app)
      .post('/auth/forgot/reset-password')
      .send({
        email: VICTIM.email,
        newPassword: 'attacker-password',
        resetToken: crypto.randomBytes(32).toString('hex'),
      });

    expect(res.status).toBe(401);
    expect(await canLogIn('attacker-password')).toBe(false);
  });

  test('a wrong security answer issues no token', async () => {
    const res = await request(app)
      .post('/auth/forgot/verify-answer')
      .send({ email: VICTIM.email, answer: 'not-the-answer' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.resetToken).toBeUndefined();

    const stored = await User.findOne({ userId: VICTIM.userId }).lean();
    expect(stored.passwordResetTokenHash).toBeNull();
  });

  test("another account's valid token cannot reset this one", async () => {
    await User.create({
      userId: 'attacker-1',
      name: 'Attacker',
      email: 'attacker@test.com',
      password: await bcrypt.hash('whatever', 10),
      role: 'user',
      isActive: true,
      securityQuestion: QUESTION,
      securityAnswer: 'chicago',
    });

    // The attacker legitimately resets *their own* account and reuses the grant.
    const own = await request(app)
      .post('/auth/forgot/verify-answer')
      .send({ email: 'attacker@test.com', answer: 'chicago' });
    expect(own.body.resetToken).toBeTruthy();

    const res = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'attacker-password', resetToken: own.body.resetToken });

    expect(res.status).toBe(401);
    expect(await canLogIn('attacker-password')).toBe(false);
  });

  test('an expired token is refused', async () => {
    const resetToken = await getResetToken();
    // Wind the expiry back rather than waiting ten minutes.
    await User.updateOne(
      { userId: VICTIM.userId },
      { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'new-password-123', resetToken });

    expect(res.status).toBe(401);
    expect(await canLogIn('new-password-123')).toBe(false);
  });

  test('a token works exactly once', async () => {
    const resetToken = await getResetToken();

    const first = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'first-password-1', resetToken });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'second-password-2', resetToken });
    expect(second.status).toBe(401);

    expect(await canLogIn('first-password-1')).toBe(true);
    expect(await canLogIn('second-password-2')).toBe(false);
  });

  test('the legitimate flow still works end to end', async () => {
    const question = await request(app)
      .post('/auth/forgot/get-question')
      .send({ email: VICTIM.email });
    expect(question.status).toBe(200);
    expect(question.body.securityQuestion).toBe(QUESTION);

    // Casing and whitespace are normalised, as before.
    const verify = await request(app)
      .post('/auth/forgot/verify-answer')
      .send({ email: VICTIM.email, answer: '  BoStOn  ' });
    expect(verify.status).toBe(200);
    expect(verify.body.success).toBe(true);
    expect(verify.body.resetToken).toMatch(/^[a-f0-9]{64}$/);

    const reset = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'brand-new-password', resetToken: verify.body.resetToken });
    expect(reset.status).toBe(200);

    expect(await canLogIn('brand-new-password')).toBe(true);
    expect(await canLogIn('original-password')).toBe(false);
  });

  test('the raw token is never stored — only its hash', async () => {
    const resetToken = await getResetToken();
    const stored = await User.findOne({ userId: VICTIM.userId }).lean();

    expect(stored.passwordResetTokenHash).toBeTruthy();
    expect(stored.passwordResetTokenHash).not.toBe(resetToken);
    expect(stored.passwordResetTokenHash).toBe(
      crypto.createHash('sha256').update(resetToken).digest('hex')
    );
  });

  test('the grant is cleared once spent', async () => {
    const resetToken = await getResetToken();
    await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'brand-new-password', resetToken });

    const stored = await User.findOne({ userId: VICTIM.userId }).lean();
    expect(stored.passwordResetTokenHash).toBeNull();
    expect(stored.passwordResetExpiresAt).toBeNull();
  });

  test('still rejects passwords under 8 characters', async () => {
    const resetToken = await getResetToken();
    const res = await request(app)
      .post('/auth/forgot/reset-password')
      .send({ email: VICTIM.email, newPassword: 'short', resetToken });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/i);
  });
});
