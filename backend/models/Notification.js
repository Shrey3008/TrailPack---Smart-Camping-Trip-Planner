const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const notificationSchema = new mongoose.Schema({
  notifId: { type: String, default: uuidv4, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  message: { type: String, required: true },
  type: { type: String, default: 'general' },
  read: { type: Boolean, default: false },
  // Where tapping this notification should take the user, as a path RELATIVE to
  // whatever origin served the page — "accept-invite.html?token=…", never
  // "https://host/accept-invite.html?token=…".
  //
  // Relative on purpose. The frontend has moved host once already (Netlify to
  // Cloudflare) and FRONTEND_URL on Render still points at the old one, so an
  // absolute link baked in at write time would send users to a site that no
  // longer deploys — and would keep doing so for every row already stored.
  // A relative path resolves against wherever the app is actually being served.
  //
  // Null for notifications with nowhere useful to go, which is most of them.
  link: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
