// Shared-trips service: collaborator management, invitations, and access checks.
// Uses the same single-table pattern as the rest of the backend.
//
// Schema additions:
//   PK: TRIPPTR#{tripId}         SK: META           — pointer { tripId, ownerId, createdAt }
//   PK: TRIP#{tripId}            SK: PARTICIPANT#{userId} — accepted collaborator
//   PK: TRIP#{tripId}            SK: INVITE#{inviteId} — pending invitation
//   PK: USER#{userId}            SK: SHARED_TRIP#{tripId} — reverse lookup for shared trips
//
// Invitations are matched by a random token (UUID). The token is the authoritative
// lookup key when a user accepts. We also scan by email to show a user their
// own pending invites if they register/log in with an invited address.

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const docClient = require('../db.js');
const {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const INVITE_TTL_DAYS = 7;

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function daysFromNowISO(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------- Trip pointer / access ----------

async function putTripPointer(tripId, ownerId) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TRIPPTR#${tripId}`,
      SK: 'META',
      tripId,
      ownerId,
      createdAt: new Date().toISOString(),
    },
  }));
}

async function deleteTripPointer(tripId) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIPPTR#${tripId}`, SK: 'META' },
  }));
}

async function getTripPointer(tripId) {
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIPPTR#${tripId}`, SK: 'META' },
  }));
  return res.Item || null;
}

async function getTrip(tripId) {
  const ptr = await getTripPointer(tripId);
  if (!ptr) return null;
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${ptr.ownerId}`, SK: `TRIP#${tripId}` },
  }));
  if (!res.Item) return null;
  return { trip: res.Item, ownerId: ptr.ownerId };
}

/**
 * Resolve a trip and ensure the requesting user can access it.
 * @returns {{ trip, ownerId, role: 'owner'|'collaborator' }}
 * @throws { status, message } style errors
 */
async function assertTripAccess(tripId, userId) {
  // Fast-path / backwards-compat: try the requester's own
  // USER#{userId} / TRIP#{tripId} key directly. This handles trips
  // created before the TRIPPTR pointer feature shipped (which would
  // otherwise 404 in the pointer lookup below) and saves one round
  // trip in the common case where the caller is the owner.
  const ownerDirect = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `TRIP#${tripId}` },
  }));
  if (ownerDirect.Item) {
    // Lazy-backfill the pointer so future pointer-based lookups
    // (collaborators querying this trip, dashboard shared-trip lists,
    // etc.) work without further intervention. Best-effort: if the
    // write fails we still return successfully for the owner.
    try {
      const ptr = await getTripPointer(tripId);
      if (!ptr) await putTripPointer(tripId, userId);
    } catch (_) { /* non-fatal */ }
    return { trip: ownerDirect.Item, ownerId: userId, role: 'owner' };
  }

  // Pointer-based lookup for the non-owner case (collaborators, or
  // owner queries that somehow missed the direct key — shouldn't
  // happen but kept defensively).
  const found = await getTrip(tripId);
  if (!found) {
    const err = new Error('Trip not found');
    err.status = 404;
    throw err;
  }
  if (found.ownerId === userId) return { ...found, role: 'owner' };

  // Check for an accepted collaborator row.
  const collab = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIP#${tripId}`, SK: `PARTICIPANT#${userId}` },
  }));
  if (collab.Item) {
    return { ...found, role: 'collaborator' };
  }

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
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TRIP#${tripId}`,
      ':sk': 'PARTICIPANT#',
    },
  }));
  return (res.Items || []).map(stripKeys);
}

async function addCollaborator(tripId, user, invitedBy) {
  const item = {
    PK: `TRIP#${tripId}`,
    SK: `PARTICIPANT#${user.userId}`,
    userId: user.userId,
    email: user.email,
    name: user.name || null,
    invitedBy: invitedBy || null,
    joinedAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  // Reverse lookup so the user can list trips shared with them.
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${user.userId}`,
      SK: `SHARED_TRIP#${tripId}`,
      tripId,
      joinedAt: item.joinedAt,
    },
  }));

  return stripKeys(item);
}

async function removeCollaborator(tripId, userId) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIP#${tripId}`, SK: `PARTICIPANT#${userId}` },
  }));
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `SHARED_TRIP#${tripId}` },
  }));
}

// ---------- Invitations ----------

async function createInvite(tripId, { email, invitedBy, invitedByName }) {
  const inviteId = uuidv4();
  const token = newInviteToken();
  const item = {
    PK: `TRIP#${tripId}`,
    SK: `INVITE#${inviteId}`,
    inviteId,
    tripId,
    email: (email || '').toLowerCase().trim(),
    token,
    invitedBy: invitedBy || null,
    invitedByName: invitedByName || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: daysFromNowISO(INVITE_TTL_DAYS),
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return stripKeys(item);
}

async function listPendingInvites(tripId) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TRIP#${tripId}`,
      ':sk': 'INVITE#',
    },
  }));
  const now = new Date();
  return (res.Items || [])
    .filter(i => i.status === 'pending' && new Date(i.expiresAt) > now)
    .map(stripKeys)
    // Don't leak tokens when listing; owner can still revoke by inviteId.
    .map(i => ({ ...i, token: undefined }));
}

async function revokeInvite(tripId, inviteId) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIP#${tripId}`, SK: `INVITE#${inviteId}` },
  }));
}

// Token-based lookup requires a scan (no GSI). Acceptable for MVP.
async function findInviteByToken(token) {
  if (!token) return null;
  const res = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :tp) AND begins_with(SK, :sp) AND #t = :tk',
    ExpressionAttributeNames: { '#t': 'token' },
    ExpressionAttributeValues: {
      ':tp': 'TRIP#',
      ':sp': 'INVITE#',
      ':tk': token,
    },
  }));
  const item = (res.Items || [])[0];
  return item ? stripKeys(item) : null;
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

  // Mark invite accepted.
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRIP#${invite.tripId}`, SK: `INVITE#${invite.inviteId}` },
    UpdateExpression: 'SET #s = :s, acceptedBy = :ub, acceptedAt = :at',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': 'accepted',
      ':ub': user.userId,
      ':at': new Date().toISOString(),
    },
  }));

  await addCollaborator(invite.tripId, user, invite.invitedBy);
  return { tripId: invite.tripId };
}

// ---------- Shared-trips for a user ----------

async function listSharedTripsForUser(userId) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'SHARED_TRIP#',
    },
  }));
  const rows = res.Items || [];
  const trips = [];
  for (const row of rows) {
    const found = await getTrip(row.tripId);
    if (found) trips.push({ ...found.trip, ownerId: found.ownerId, sharedSince: row.joinedAt });
  }
  // newest first
  trips.sort((a, b) => new Date(b.sharedSince || 0) - new Date(a.sharedSince || 0));
  return trips;
}

// ---------- Utilities ----------

function stripKeys(item) {
  if (!item) return item;
  const { PK, SK, ...rest } = item;
  return rest;
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
