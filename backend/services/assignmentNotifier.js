// Coalesces item-assignment notifications.
//
// Assignment is one PATCH per item — the checklist assigns from a per-row menu,
// so dividing a twelve-item packing list between two people is twelve separate
// requests. Emitting a notification from each one buries the assignee under a
// dozen near-identical rows that all say the same thing, which is worse than
// saying nothing: a bell that cries wolf stops being read.
//
// So notices are held for a short window per (assignee, trip) and flushed as a
// single summary. The window restarts on each new assignment, so a burst of
// clicks produces exactly one notification once the person stops clicking.
//
// Deliberately in-memory and deliberately not a scheduler. Two consequences
// worth knowing:
//
//   - It is per-process. A second instance would debounce independently, so the
//     same person could get one notification per instance that served a click.
//     Fine on a single Render instance; it is the thing to revisit before
//     scaling out.
//   - A pending notice is lost if the process restarts inside the window. That
//     is why the window is seconds rather than minutes — a dropped notification
//     is recoverable (the assignment itself is already saved and visible on the
//     checklist), but a long window makes the loss likelier for no real gain.
const { notify } = require('./notify');

// Short by design; see above. Overridable so tests do not have to sit through
// a real wait to exercise the timer path.
const WINDOW_MS = () => Number(process.env.ASSIGNMENT_NOTICE_WINDOW_MS) || 5000;

// key: `${userId}#${tripId}` -> { actorName, tripName, items: Map(itemId -> name), timer }
const pending = new Map();

const keyOf = (userId, tripId) => `${userId}#${tripId}`;

function quote(name) {
  return `"${name}"`;
}

// One line, and it has to survive being the only thing the assignee reads.
// A bare count loses the information that actually helps them ("do I need to
// go buy something?"), so names are kept while they still fit.
function buildMessage(actorName, tripName, names) {
  const who = actorName || 'Someone';
  const trip = quote(tripName || 'a trip');

  if (names.length === 1) {
    return `${who} asked you to bring ${quote(names[0])} for ${trip}.`;
  }
  if (names.length === 2) {
    return `${who} asked you to bring ${quote(names[0])} and ${quote(names[1])} for ${trip}.`;
  }
  return `${who} asked you to bring ${names.length} items for ${trip}, including ` +
         `${quote(names[0])} and ${quote(names[1])}.`;
}

async function flushKey(key) {
  const entry = pending.get(key);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  pending.delete(key);

  const names = [...entry.items.values()];
  if (!names.length) return;

  await notify(entry.userId, 'item-assignment', buildMessage(entry.actorName, entry.tripName, names));
}

/**
 * Record that `itemId` is now assigned to `userId` on `tripId`, and schedule a
 * single summarised notification once assignments stop arriving.
 *
 * Callers keep their own suppression rules — this does not know or care whether
 * the assignee is the actor, or whether the assignee actually changed. It only
 * coalesces what it is given.
 */
function queueAssignmentNotice({ userId, tripId, tripName, actorName, itemId, itemName }) {
  if (!userId || !itemId) return;

  const key = keyOf(userId, tripId);
  let entry = pending.get(key);
  if (!entry) {
    entry = { userId, tripId, actorName, tripName, items: new Map(), timer: null };
    pending.set(key, entry);
  }
  // Latest actor and trip name win; both are stable across a burst in practice.
  entry.actorName = actorName || entry.actorName;
  entry.tripName = tripName || entry.tripName;
  entry.items.set(itemId, itemName);

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    flushKey(key).catch(err => {
      console.warn(`[assignmentNotifier] flush failed for ${key}:`, err.message);
    });
  }, WINDOW_MS());
  // Never hold the event loop open on account of a pending notification.
  if (typeof entry.timer.unref === 'function') entry.timer.unref();
}

/**
 * Drop a queued item, because it was unassigned or handed to someone else
 * before the window elapsed. Without this, assigning and then immediately
 * correcting yourself still tells the first person they are carrying something
 * they are not.
 */
function cancelAssignmentNotice({ userId, tripId, itemId }) {
  if (!userId || !itemId) return;

  const key = keyOf(userId, tripId);
  const entry = pending.get(key);
  if (!entry) return;

  entry.items.delete(itemId);
  if (entry.items.size === 0) {
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(key);
  }
}

/**
 * Send every pending notice now. Exposed for tests, which should not have to
 * wait out a real window, and available if a graceful shutdown ever wants to
 * drain rather than drop.
 */
async function flushAssignmentNotices() {
  await Promise.all([...pending.keys()].map(flushKey));
}

/** Test-only: forget everything without sending. */
function resetAssignmentNotices() {
  pending.forEach(entry => { if (entry.timer) clearTimeout(entry.timer); });
  pending.clear();
}

module.exports = {
  queueAssignmentNotice,
  cancelAssignmentNotice,
  flushAssignmentNotices,
  resetAssignmentNotices,
  _internals: { buildMessage },
};
