// Invite flow + shared-trips lookup endpoints.
// Mounted at the app root (see server.js) so routes like /invites/accept and
// /shared-trips/mine sit alongside /trips.
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const sharedTrips = require('../services/sharedTripsService');
const { notify } = require('../services/notify');
const { User } = require('../models');

// Look up a user by email (indexed field in Mongo).
async function findUserByEmail(email) {
  if (!email) return null;
  return User.findOne({ email: email.toLowerCase().trim() }).lean();
}

// ---------- Invitations (owner only) ----------

// POST /trips/:tripId/invites — create an email invitation
router.post('/trips/:tripId/invites', authenticate, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { email } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // If the invited email belongs to an existing account, and that user is
    // already a collaborator or the owner, short-circuit.
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      if (existing.userId === req.user.userId) {
        return res.status(400).json({ message: 'You are the trip owner' });
      }
      const currentCollabs = await sharedTrips.listCollaborators(tripId);
      if (currentCollabs.some(c => c.userId === existing.userId)) {
        return res.status(400).json({ message: 'This user is already a collaborator' });
      }
    }

    const invite = await sharedTrips.createInvite(tripId, {
      email: normalizedEmail,
      invitedBy: req.user.userId,
      invitedByName: req.user.name || null,
    });

    // Build a full accept URL; prefer FRONTEND_URL in production, else fall back
    // to the Referer host so local dev still produces a clickable link.
    const frontend = process.env.FRONTEND_URL
      || (req.get('origin') || req.get('referer') || '').replace(/\/[^/]*$/, '')
      || 'http://localhost:8080';
    const acceptUrl = `${frontend.replace(/\/$/, '')}/accept-invite.html?token=${invite.token}`;

    const tripCtx = await sharedTrips.getTrip(tripId);

    // Tell the invited user, in the app, that they have been invited.
    //
    // Until now this route had exactly one delivery channel — email — and it is
    // switched off in production (DISABLE_EMAIL=true), so an invitation
    // produced a row in the database and silence everywhere the recipient
    // could actually look. The only notification the whole invite flow emitted
    // went to the *owner*, on acceptance, which the recipient had no way to
    // reach.
    //
    // `existing` is the invitee's account, already resolved above for the
    // "already a collaborator" check, so the userId notify() needs is in hand.
    //
    // KNOWN LIMITATION: an invite addressed to an email with no TrailPack
    // account has no userId to notify, and is skipped here rather than treated
    // as an error — there is nobody to write a row for yet. That person's only
    // route in remains the invite email, which is disabled in production, so in
    // practice inviting someone who has not signed up still reaches them only
    // if the owner sends them the accept link by hand. Fixing that needs either
    // email re-enabled or an invite claimed at signup; neither is in scope here.
    if (existing) {
      const who = req.user.name || req.user.email || 'Someone';
      const tripName = tripCtx && tripCtx.trip ? tripCtx.trip.name : 'a trip';
      // Fail-soft by construction (see services/notify.js): the invite is
      // already created and must not be undone by a notification write.
      await notify(existing.userId, 'trip-invitation', `${who} invited you to join "${tripName}".`);
    }

    // Fire-and-forget invite email. No-ops when the email service isn't configured.
    try {
      const emailService = require('../services/emailService');
      const tripForEmail = tripCtx ? tripCtx.trip : { name: 'a camping trip' };
      emailService.sendTripInvitation(
        normalizedEmail,
        tripForEmail,
        req.user.name || 'A TrailPack user',
        acceptUrl
      ).catch(err => console.warn('[sharedTrips] invite email failed:', err.message));
    } catch (_) { /* service unavailable — ignore */ }

    res.status(201).json({
      message: 'Invitation created',
      invite: {
        inviteId: invite.inviteId,
        email: invite.email,
        expiresAt: invite.expiresAt,
      },
      // The token is returned to the caller once (on creation) so the UI can
      // share a direct link. It's not exposed in the listing endpoint.
      acceptUrl,
      token: invite.token,
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ message: 'Error creating invite' });
  }
});

// GET /trips/:tripId/invites — list outstanding invitations (owner only)
router.get('/trips/:tripId/invites', authenticate, async (req, res) => {
  try {
    const { tripId } = req.params;
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    const invites = await sharedTrips.listPendingInvites(tripId);
    res.json({ invites });
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ message: 'Error listing invites' });
  }
});

// DELETE /trips/:tripId/invites/:inviteId — revoke (owner only)
router.delete('/trips/:tripId/invites/:inviteId', authenticate, async (req, res) => {
  try {
    const { tripId, inviteId } = req.params;
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    await sharedTrips.revokeInvite(tripId, inviteId);
    res.json({ message: 'Invitation revoked' });
  } catch (error) {
    console.error('Error revoking invite:', error);
    res.status(500).json({ message: 'Error revoking invite' });
  }
});

// ---------- Accept flow (authenticated user) ----------

// GET /invites/:token — preview an invitation (before accepting)
router.get('/invites/:token', authenticate, async (req, res) => {
  try {
    const invite = await sharedTrips.findInviteByToken(req.params.token);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ message: 'Invitation not found or already used' });
    }
    if (new Date(invite.expiresAt) <= new Date()) {
      return res.status(400).json({ message: 'Invitation has expired' });
    }
    const found = await sharedTrips.getTrip(invite.tripId);
    res.json({
      invite: {
        tripId: invite.tripId,
        email: invite.email,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
      },
      trip: found ? {
        tripId: found.trip.tripId,
        name: found.trip.name,
        terrain: found.trip.terrain,
        season: found.trip.season,
        duration: found.trip.duration,
        location: found.trip.location,
      } : null,
      yourEmail: req.user.email,
      emailMatches: !invite.email || invite.email === (req.user.email || '').toLowerCase(),
    });
  } catch (error) {
    console.error('Error previewing invite:', error);
    res.status(500).json({ message: 'Error previewing invite' });
  }
});

// POST /invites/accept — accept an invitation
router.post('/invites/accept', authenticate, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: 'token is required' });
    const result = await sharedTrips.acceptInvite(token, {
      userId: req.user.userId,
      email: req.user.email,
      name: req.user.name,
    });

    // Tell the owner someone joined. Fail-soft by construction (see
    // services/notify.js) — the invite is already accepted at this point and
    // must not be undone by a notification write.
    const found = await sharedTrips.getTrip(result.tripId);
    if (found && found.ownerId !== req.user.userId) {
      const who = req.user.name || req.user.email || 'Someone';
      await notify(found.ownerId, 'trip-invitation', `${who} joined your trip "${found.trip.name}".`);
    }

    res.json({ message: 'Invitation accepted', tripId: result.tripId });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error accepting invite:', error);
    res.status(500).json({ message: 'Error accepting invite' });
  }
});

// ---------- Shared trips lookup ----------

// GET /shared-trips/mine — trips shared with me (mirrors GET /trips/shared for clarity)
router.get('/shared-trips/mine', authenticate, async (req, res) => {
  try {
    const trips = await sharedTrips.listSharedTripsForUser(req.user.userId);
    res.json({ trips });
  } catch (error) {
    console.error('Error listing shared trips:', error);
    res.status(500).json({ message: 'Error listing shared trips' });
  }
});

module.exports = router;
