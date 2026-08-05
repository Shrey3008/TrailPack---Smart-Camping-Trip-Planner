// The in-app notification system had a complete API, model and test suite, but
// nothing ever wrote a row: notificationService.js is dead code, the
// POST /notifications/* endpoints have no caller, and the reminder scheduler
// sent email without recording anything in-app. Production held zero
// notifications. These tests pin the emission points that now exist, so the
// bell has something to show.
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('./helpers/db');
const { app } = require('../server');
const { User, Trip, Notification, Collaborator, SentReminder } = require('../models');
const scheduler = require('../services/notificationScheduler');

async function seedUser(userId, email, name) {
  await User.create({
    userId, name, email,
    password: await bcrypt.hash('password123', 10),
    role: 'user', isActive: true,
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token;
}

function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

beforeAll(() => db.connect());
afterAll(() => db.close());
beforeEach(() => db.clear());

describe('the reminder scheduler records an in-app notification', () => {
  test('a trip 3 days out produces a notification, not just an email', async () => {
    await seedUser('owner-1', 'owner@test.com', 'Owner');
    const trip = await Trip.create({
      userId: 'owner-1', name: 'Rainier Traverse', terrain: 'Mountain',
      season: 'Summer', duration: 3, startDate: daysFromNow(3),
    });

    await scheduler.run();

    const notes = await Notification.find({ userId: 'owner-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('pre-trip');
    expect(notes[0].message).toMatch(/Rainier Traverse/);
    expect(notes[0].message).toMatch(/3 days/);
    expect(notes[0].read).toBe(false);
  });

  test('a trip 1 day out produces the packing nudge', async () => {
    await seedUser('owner-1', 'owner@test.com', 'Owner');
    await Trip.create({
      userId: 'owner-1', name: 'Moab Loop', terrain: 'Desert',
      season: 'Spring', duration: 2, startDate: daysFromNow(1),
    });

    await scheduler.run();

    const notes = await Notification.find({ userId: 'owner-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('packing-nudge');
    expect(notes[0].message).toMatch(/tomorrow/i);
  });

  test('notifications are recorded even though SMTP is not configured here', async () => {
    // The suite runs with no mail credentials, so sendEmail resolves
    // { skipped: true }. The in-app copy must not depend on that — this is the
    // case where it matters most.
    await seedUser('owner-1', 'owner@test.com', 'Owner');
    await Trip.create({
      userId: 'owner-1', name: 'Redwood', terrain: 'Forest',
      season: 'Fall', duration: 2, startDate: daysFromNow(3),
    });

    await scheduler.run();
    expect(await Notification.countDocuments({ userId: 'owner-1' })).toBe(1);
  });

  test('a second run does not duplicate the notification', async () => {
    await seedUser('owner-1', 'owner@test.com', 'Owner');
    await Trip.create({
      userId: 'owner-1', name: 'Rainier', terrain: 'Mountain',
      season: 'Summer', duration: 3, startDate: daysFromNow(3),
    });

    await scheduler.run();
    await scheduler.run();
    await scheduler.run();

    // Dedup is what makes this safe to run daily. It is now recorded even when
    // the email was skipped, precisely so repeat runs cannot pile up rows the
    // user would actually see.
    expect(await Notification.countDocuments({ userId: 'owner-1' })).toBe(1);
    expect(await SentReminder.countDocuments()).toBe(1);
  });

  test('a trip outside the reminder windows produces nothing', async () => {
    await seedUser('owner-1', 'owner@test.com', 'Owner');
    await Trip.create({
      userId: 'owner-1', name: 'Far Future', terrain: 'Forest',
      season: 'Fall', duration: 2, startDate: daysFromNow(30),
    });

    await scheduler.run();
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('joining a trip notifies the owner', () => {
  test('accepting an invite notifies the trip owner', async () => {
    const ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ada Owner');
    const guestToken = await seedUser('guest-1', 'guest@test.com', 'Blake Guest');

    const trip = await Trip.create({
      userId: 'owner-1', name: 'Shared Trip', terrain: 'Forest', season: 'Fall', duration: 2,
    });

    const invite = await request(app)
      .post(`/trips/${trip.tripId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'guest@test.com' });
    expect(invite.status).toBe(201);

    // Creating the invite now notifies the guest — that is the point of the
    // invite notification. Snapshot their count so the assertion below measures
    // what accepting did, rather than everything that has ever reached them.
    const guestNotesBeforeAccept = await Notification.countDocuments({ userId: 'guest-1' });

    const accept = await request(app)
      .post('/invites/accept')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ token: invite.body.token });
    expect(accept.status).toBe(200);

    const ownerNotes = await Notification.find({ userId: 'owner-1' }).lean();
    expect(ownerNotes).toHaveLength(1);
    expect(ownerNotes[0].message).toMatch(/Blake Guest/);
    expect(ownerNotes[0].message).toMatch(/Shared Trip/);

    // The person who just clicked "accept" does not need telling. Checked as a
    // delta, because they were legitimately notified of the invitation itself
    // a moment earlier; a bare count of 0 stopped being the right test for this
    // once invites started reaching the invitee.
    expect(await Notification.countDocuments({ userId: 'guest-1' })).toBe(guestNotesBeforeAccept);
  });

  test('being added as a participant notifies the person added', async () => {
    const ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ada Owner');
    await seedUser('friend-1', 'friend@test.com', 'Friend');

    const trip = await Trip.create({
      userId: 'owner-1', name: 'Group Trip', terrain: 'Mountain', season: 'Winter', duration: 2,
    });

    const res = await request(app)
      .post(`/trips/${trip.tripId}/participants`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: 'friend-1', email: 'friend@test.com', name: 'Friend' });
    expect(res.status).toBe(200);

    const notes = await Notification.find({ userId: 'friend-1' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/Ada Owner/);
    expect(notes[0].message).toMatch(/Group Trip/);

    // Adding yourself is a no-op worth not announcing.
    expect(await Notification.countDocuments({ userId: 'owner-1' })).toBe(0);
  });

  test('a failed notification write never breaks the operation it follows', async () => {
    const ownerToken = await seedUser('owner-1', 'owner@test.com', 'Ada Owner');
    await seedUser('friend-1', 'friend@test.com', 'Friend');
    const trip = await Trip.create({
      userId: 'owner-1', name: 'Group Trip', terrain: 'Mountain', season: 'Winter', duration: 2,
    });

    // Force every notification write to fail.
    const spy = jest.spyOn(Notification, 'create').mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request(app)
      .post(`/trips/${trip.tripId}/participants`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: 'friend-1' });

    // The participant is what the caller asked for; the notification is a side
    // effect and must not take the request down with it.
    expect(res.status).toBe(200);
    expect(await Collaborator.countDocuments({ tripId: trip.tripId, userId: 'friend-1' })).toBe(1);

    spy.mockRestore();
    warn.mockRestore();
  });
});

describe('the notifications API now has something to serve', () => {
  test('the bell endpoints reflect emitted notifications', async () => {
    const token = await seedUser('owner-1', 'owner@test.com', 'Owner');
    await Trip.create({
      userId: 'owner-1', name: 'Rainier', terrain: 'Mountain',
      season: 'Summer', duration: 3, startDate: daysFromNow(3),
    });
    await scheduler.run();

    const list = await request(app).get('/notifications').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const count = await request(app).get('/notifications/unread-count').set('Authorization', `Bearer ${token}`);
    expect(count.body.count).toBe(1);

    const read = await request(app)
      .put(`/notifications/${list.body[0].notifId}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);

    const after = await request(app).get('/notifications/unread-count').set('Authorization', `Bearer ${token}`);
    expect(after.body.count).toBe(0);
  });
});
