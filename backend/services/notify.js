// In-app notification emitter.
//
// The /notifications API, the Notification model and a full test suite have
// existed for a while, but nothing in the running system ever wrote a row:
// services/notificationService.js holds every creation helper and is required
// by nothing, the POST /notifications/* endpoints are called by no frontend
// file, and the reminder scheduler sends email without recording anything
// in-app. Production held zero notifications as a result.
//
// This is the one live path. Deliberately tiny, and deliberately fail-soft:
// a notification is a side effect of some more important operation (accepting
// an invite, creating a trip, sending a reminder), and failing to record one
// must never fail the thing the user actually asked for.
const { Notification } = require('../models');

async function notify(userId, type, message) {
  if (!userId || !message) return null;
  try {
    const doc = await Notification.create({ userId, type, message, read: false });
    return doc;
  } catch (err) {
    // Logged, not thrown — see above.
    console.warn(`[notify] could not record "${type}" for ${userId}:`, err.message);
    return null;
  }
}

module.exports = { notify };
