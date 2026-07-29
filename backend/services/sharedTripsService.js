// Shared-trips service: collaborator management, invitations, and access checks.
// MongoDB version. The old TRIPPTR# pointer and SHARED_TRIP# reverse-lookup
// rows are unnecessary now — Trip.userId is the owner, and the Collaborator
// collection is queryable from either side.

const crypto = require('crypto');
const { Trip, Collaborator, Invite } = require('../models');

const INVITE_TTL_DAYS = 7;
const EXCLUDE = '-_id -__v';

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function daysFromNowISO(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------- Trip lookup / access ----------

async function getTrip(tripId) {
  const trip = await Trip.findOne({ tripId }).select(EXCLUDE).lean();
  if (!trip) return null;
  return { trip, ownerId: trip.userId };
}

// Kept as no-ops for backwards compatibility — pointers don't exist in Mongo.
async function putTripPointer(_tripId, _ownerId) { /* no-op */ }
async function deleteTripPointer(_tripId) { /* no-op */ }

/**
 * Resolve a trip and ensure the requesting user can access it.
 * @returns {{ trip, ownerId, role: 'owner'|'collaborator' }}
 * @throws { status, message } style errors
 */
async function assertTripAccess(tripId, userId) {
  const found = await getTrip(tripId);
  if (!found) {
    const err = new Error('Trip not found');
    err.status = 404;
    throw err;
  }
  if (found.ownerId === userId) return { ...found, role: 'owner' };

  const collab = await Collaborator.findOne({ tripId, userId }).lean();
  if (collab) return { ...found, role: 'collaborator' };

  const err = new Error('You do not have access to this trip');
  err.status = 403;
  throw err;
}

async function assertTripOwner(tripId, userId) {
  const ctx = await assertTripAccess(tripId, userId);
  if (ctx.role !== 'owner') {
    const err = new Error('Only the trip owner can do that');
    err.status = 403;
    throw err;
  }
  return ctx;
}

// ---------- Collaborators ----------

async function listCollaborators(tripId) {
  return Collaborator.find({ tripId }).select(EXCLUDE).lean();
}

async function addCollaborator(tripId, user, invitedBy) {
  const doc = await Collaborator.findOneAndUpdate(
    { tripId, userId: user.userId },
    {
      $setOnInsert: {
        tripId,
        userId: user.userId,
        email: user.email || null,
        name: user.name || null,
        invitedBy: invitedBy || null,
        joinedAt: new Date().toISOString(),
      },
    },
    { upsert: true, new: true }
  ).select(EXCLUDE).lean();
  return doc;
}

async function removeCollaborator(tripId, userId) {
  await Collaborator.deleteOne({ tripId, userId });
}

// ---------- Invitations ----------

async function createInvite(tripId, { email, invitedBy, invitedByName }) {
  const invite = await Invite.create({
    tripId,
    email: (email || '').toLowerCase().trim(),
    token: newInviteToken(),
    invitedBy: invitedBy || null,
    invitedByName: invitedByName || null,
    status: 'pending',
    expiresAt: daysFromNowISO(INVITE_TTL_DAYS),
  });
  const obj = invite.toObject();
  delete obj._id;
  delete obj.__v;
  return obj;
}

async function listPendingInvites(tripId) {
  const now = new Date();
  const invites = await Invite.find({ tripId, status: 'pending' }).select(EXCLUDE).lean();
  return invites
    .filter(i => new Date(i.expiresAt) > now)
    // Don't leak tokens when listing; owner can still revoke by inviteId.
    .map(i => ({ ...i, token: undefined }));
}

async function revokeInvite(tripId, inviteId) {
  await Invite.deleteOne({ tripId, inviteId });
}

async function findInviteByToken(token) {
  if (!token) return null;
  return Invite.findOne({ token }).select(EXCLUDE).lean();
}

async function acceptInvite(token, user) {
  const invite = await findInviteByToken(token);
  if (!invite) {
    const err = new Error('Invitation not found or already used');
    err.status = 404;
    throw err;
  }
  if (invite.status !== 'pending') {
    const err = new Error('Invitation is no longer valid');
    err.status = 400;
    throw err;
  }
  if (new Date(invite.expiresAt) <= new Date()) {
    const err = new Error('Invitation has expired');
    err.status = 400;
    throw err;
  }
  if (invite.email && user.email && invite.email !== user.email.toLowerCase().trim()) {
    const err = new Error('This invitation was sent to a different email address');
    err.status = 403;
    throw err;
  }

  await Invite.updateOne(
    { inviteId: invite.inviteId },
    {
      $set: {
        status: 'accepted',
        acceptedBy: user.userId,
        acceptedAt: new Date().toISOString(),
      },
    }
  );

  await addCollaborator(invite.tripId, user, invite.invitedBy);
  return { tripId: invite.tripId };
}

// ---------- Shared-trips for a user ----------

async function listSharedTripsForUser(userId) {
  const rows = await Collaborator.find({ userId }).lean();
  const trips = [];
  for (const row of rows) {
    const found = await getTrip(row.tripId);
    if (found) trips.push({ ...found.trip, ownerId: found.ownerId, sharedSince: row.joinedAt });
  }
  // newest first
  trips.sort((a, b) => new Date(b.sharedSince || 0) - new Date(a.sharedSince || 0));
  return trips;
}

module.exports = {
  // access
  assertTripAccess,
  assertTripOwner,
  getTrip,
  putTripPointer,
  deleteTripPointer,
  // collaborators
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  // invites
  createInvite,
  listPendingInvites,
  revokeInvite,
  findInviteByToken,
  acceptInvite,
  // user-scoped
  listSharedTripsForUser,
  // constants
  INVITE_TTL_DAYS,
};
