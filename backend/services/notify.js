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

// `link` is optional and, when given, must be a path relative to the app's own
// origin — see models/Notification.js for why absolute URLs are the wrong thing
// to store. Anything with a scheme or a protocol-relative "//" prefix is
// dropped rather than saved: the notification list is rendered as clickable
// rows, so a stored link is a navigation target, and a target that can point
// off-site is an open redirect waiting for the first caller that builds one
// out of user input.
function sanitizeLink(link) {
  if (!link || typeof link !== 'string') return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    console.warn(`[notify] refusing non-relative link: ${trimmed}`);
    return null;
  }
  return trimmed.replace(/^\/+/, '');
}

async function notify(userId, type, message, link = null) {
  if (!userId || !message) return null;
  try {
    const doc = await Notification.create({
      userId, type, message, read: false, link: sanitizeLink(link),
    });
    return doc;
  } catch (err) {
    // Logged, not thrown — see above.
    console.warn(`[notify] could not record "${type}" for ${userId}:`, err.message);
    return null;
  }
}

module.exports = { notify, _internals: { sanitizeLink } };
