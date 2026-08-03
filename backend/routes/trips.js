const express = require('express');
const router = express.Router();
const { Trip, Item } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { estimateProvisions } = require('../services/provisionsService');
const sharedTrips = require('../services/sharedTripsService');
const { notify } = require('../services/notify');
const aiService = require('../services/aiService');

// Duplicated from routes/weather.js so POST /trips can expand a
// trailing 2-letter country code on req.body.location into its full
// name before persisting. Kept in sync by copy — weather.js remains
// the canonical source.
const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AD:'Andorra',
  AO:'Angola',AG:'Antigua and Barbuda',AR:'Argentina',
  AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',
  BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',BB:'Barbados',
  BY:'Belarus',BE:'Belgium',BZ:'Belize',BJ:'Benin',
  BT:'Bhutan',BO:'Bolivia',BA:'Bosnia and Herzegovina',
  BW:'Botswana',BR:'Brazil',BN:'Brunei',BG:'Bulgaria',
  BF:'Burkina Faso',BI:'Burundi',CV:'Cape Verde',
  KH:'Cambodia',CM:'Cameroon',CA:'Canada',
  CF:'Central African Republic',TD:'Chad',CL:'Chile',
  CN:'China',CO:'Colombia',KM:'Comoros',CG:'Congo',
  CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CY:'Cyprus',
  CZ:'Czech Republic',DK:'Denmark',DJ:'Djibouti',
  DM:'Dominica',DO:'Dominican Republic',EC:'Ecuador',
  EG:'Egypt',SV:'El Salvador',GQ:'Equatorial Guinea',
  ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',ET:'Ethiopia',
  FJ:'Fiji',FI:'Finland',FR:'France',GA:'Gabon',
  GM:'Gambia',GE:'Georgia',DE:'Germany',GH:'Ghana',
  GR:'Greece',GD:'Grenada',GT:'Guatemala',GN:'Guinea',
  GW:'Guinea-Bissau',GY:'Guyana',HT:'Haiti',HN:'Honduras',
  HU:'Hungary',IS:'Iceland',IN:'India',ID:'Indonesia',
  IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',
  JM:'Jamaica',JP:'Japan',JO:'Jordan',KZ:'Kazakhstan',
  KE:'Kenya',KI:'Kiribati',KW:'Kuwait',KG:'Kyrgyzstan',
  LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',
  LR:'Liberia',LY:'Libya',LI:'Liechtenstein',LT:'Lithuania',
  LU:'Luxembourg',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',
  MV:'Maldives',ML:'Mali',MT:'Malta',MH:'Marshall Islands',
  MR:'Mauritania',MU:'Mauritius',MX:'Mexico',FM:'Micronesia',
  MD:'Moldova',MC:'Monaco',MN:'Mongolia',ME:'Montenegro',
  MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',
  NR:'Nauru',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',
  NI:'Nicaragua',NE:'Niger',NG:'Nigeria',NO:'Norway',
  OM:'Oman',PK:'Pakistan',PW:'Palau',PA:'Panama',
  PG:'Papua New Guinea',PY:'Paraguay',PE:'Peru',
  PH:'Philippines',PL:'Poland',PT:'Portugal',QA:'Qatar',
  RO:'Romania',RU:'Russia',RW:'Rwanda',KN:'Saint Kitts and Nevis',
  LC:'Saint Lucia',VC:'Saint Vincent and the Grenadines',
  WS:'Samoa',SM:'San Marino',ST:'Sao Tome and Principe',
  SA:'Saudi Arabia',SN:'Senegal',RS:'Serbia',SC:'Seychelles',
  SL:'Sierra Leone',SG:'Singapore',SK:'Slovakia',SI:'Slovenia',
  SB:'Solomon Islands',SO:'Somalia',ZA:'South Africa',
  SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',
  SR:'Suriname',SE:'Sweden',CH:'Switzerland',SY:'Syria',
  TW:'Taiwan',TJ:'Tajikistan',TZ:'Tanzania',TH:'Thailand',
  TL:'Timor-Leste',TG:'Togo',TO:'Tonga',TT:'Trinidad and Tobago',
  TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',TV:'Tuvalu',
  UG:'Uganda',UA:'Ukraine',AE:'United Arab Emirates',
  GB:'United Kingdom',US:'United States',UY:'Uruguay',
  UZ:'Uzbekistan',VU:'Vanuatu',VE:'Venezuela',VN:'Vietnam',
  YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe'
};

// Normalize a user-supplied location string. If it ends with a
// comma + 2-letter uppercase code, expand the code via COUNTRY_NAMES
// (e.g. 'Colombo, SL' -> 'Colombo, Sierra Leone'); if the code isn't
// in the map, drop the suffix and keep just the city. Anything else
// (no comma, long country name already spelled out, empty) is
// returned trimmed and unchanged.
// Validate a coordinate value to a finite number within [-max, max].
// Accepts numbers or numeric strings. Returns null for missing/invalid input
// so the trip item stores explicit null rather than undefined (DynamoDB-safe).
function parseCoord(v, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n) || n < -max || n > max) return null;
  return n;
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'string') return location;
  const trimmed = location.trim();
  const match = trimmed.match(/^(.+?),\s*([A-Z]{2})$/);
  if (!match) return trimmed;
  const city = match[1].trim();
  const code = match[2];
  const country = COUNTRY_NAMES[code];
  return country ? `${city}, ${country}` : city;
}

// Smart Rule-Based Checklist Generator (fallback path).
// This is now the *fallback* used by POST /trips when the Groq-backed
// generator (aiService.generateBaseChecklist) is unavailable or returns
// an empty/invalid list. Kept as deterministic, dependency-free code so
// trip creation is guaranteed to succeed even if the AI provider is
// down, mis-configured, or rate-limited.
const generateChecklist = (terrain, season, duration) => {
  const items = [];
  
  // BASE ITEMS (every trip) - category: "Essentials"
  const baseItems = [
    { name: 'Backpack', category: 'Essentials' },
    { name: 'Water bottle', category: 'Essentials' },
    { name: 'First aid kit', category: 'Essentials' },
    { name: 'Map and compass', category: 'Essentials' },
    { name: 'Lighter or matches', category: 'Essentials' },
    { name: 'Headlamp', category: 'Essentials' }
  ];
  items.push(...baseItems);
  
  // TERRAIN RULES
  if (terrain === 'Mountain') {
    items.push(
      { name: 'Hiking boots', category: 'Clothing' },
      { name: 'Warm layers', category: 'Clothing' },
      { name: 'Trekking poles', category: 'Clothing' },
      { name: 'Tent', category: 'Shelter' },
      { name: 'Cold-rated sleeping bag', category: 'Shelter' }
    );
  } else if (terrain === 'Forest') {
    items.push(
      { name: 'Bug spray', category: 'Tools' },
      { name: 'Tarp', category: 'Tools' },
      { name: 'Rope', category: 'Tools' },
      { name: 'Tent', category: 'Shelter' },
      { name: 'Sleeping bag', category: 'Shelter' }
    );
  } else if (terrain === 'Desert') {
    items.push(
      { name: 'Extra water bottles', category: 'Food & Water' },
      { name: 'Electrolyte tablets', category: 'Food & Water' },
      { name: 'Sun hat', category: 'Clothing' },
      { name: 'UV protection shirt', category: 'Clothing' }
    );
  }
  
  // SEASON RULES
  if (season === 'Winter') {
    items.push(
      { name: 'Insulated jacket', category: 'Clothing' },
      { name: 'Gloves', category: 'Clothing' },
      { name: 'Beanie', category: 'Clothing' },
      { name: 'Thermal base layer', category: 'Clothing' }
    );
  } else if (season === 'Summer') {
    items.push(
      { name: 'Lightweight shirt', category: 'Clothing' },
      { name: 'Sunscreen SPF 50', category: 'Clothing' },
      { name: 'Sunglasses', category: 'Clothing' }
    );
  } else if (season === 'Fall') {
    items.push(
      { name: 'Rain jacket', category: 'Clothing' },
      { name: 'Layered clothing', category: 'Clothing' },
      { name: 'Warm socks', category: 'Clothing' }
    );
  } else if (season === 'Spring') {
    items.push(
      { name: 'Waterproof boots', category: 'Clothing' },
      { name: 'Light rain jacket', category: 'Clothing' },
      { name: 'Layered clothing', category: 'Clothing' }
    );
  }
  
  // DURATION RULES
  if (duration > 3) {
    items.push(
      { name: 'Extra meal supplies', category: 'Food & Water' },
      { name: 'Water filter', category: 'Food & Water' }
    );
  }
  if (duration > 5) {
    items.push(
      { name: 'Emergency whistle', category: 'Safety' },
      { name: 'Satellite communicator', category: 'Safety' }
    );
  }
  
  return items;
};

// POST /trips - Create a new trip with an AI-generated checklist
// (Groq via aiService) and a deterministic rule-based fallback.
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, terrain, season, duration, groupSize, location, lat, lon, startDate, endDate } = req.body;

    // Validation
    if (!name || !terrain || !season || !duration) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const userId = req.user.userId;
    const parsedDuration = parseInt(duration);
    // Group size: clamp to [1, 50]; default to 1 when missing/invalid.
    const parsedGroupSize = Math.min(50, Math.max(1, parseInt(groupSize, 10) || 1));
    // Optional geographic coordinates from the destination autocomplete.
    // Validated to finite numbers within [-90,90] / [-180,180]; otherwise null.
    const parsedLat = parseCoord(lat, 90);
    const parsedLon = parseCoord(lon, 180);

    const tripDoc = await Trip.create({
      userId,
      name,
      terrain,
      season,
      duration: parsedDuration,
      groupSize: parsedGroupSize,
      location: normalizeLocation(location) || null,
      lat: parsedLat,
      lon: parsedLon,
      startDate: startDate || null,
      endDate: endDate || null,
      status: 'planned',
      photoIndex: Math.floor(Math.random() * 15),
    });
    const tripItem = tripDoc.toObject();
    delete tripItem._id;
    delete tripItem.__v;
    const tripId = tripItem.tripId;

    // Generate the initial checklist. Try the Groq-backed AI generator
    // first so the list is tailored to terrain/season/duration/location;
    // if it returns [] (no key, AI error, bad JSON, fewer than its
    // MIN_ITEMS sanity floor) fall back to the deterministic rule-based
    // generator so trip creation never fails because of an AI hiccup.
    let checklistItems = await aiService.generateBaseChecklist({
      name,
      location: tripItem.location,
      terrain,
      season,
      duration: parsedDuration,
      groupSize: parsedGroupSize,
    });
    let checklistSource = 'ai';
    if (!Array.isArray(checklistItems) || checklistItems.length === 0) {
      checklistItems = generateChecklist(terrain, season, parsedDuration);
      checklistSource = 'rule-based';
    }
    console.log(`[trips] checklist generated via ${checklistSource} (${checklistItems.length} items) for trip ${tripId}`);

    await Item.insertMany(checklistItems.map(item => ({
      tripId,
      name: item.name,
      category: item.category,
      packed: false,
    })));
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip: tripItem
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ message: 'Error creating trip' });
  }
});

// GET /trips - Get all trips for authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const trips = await Trip.find({ userId })
      .sort({ createdAt: -1 })
      .select('-_id -__v')
      .lean();

    res.json({ trips: trips });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Error fetching trips' });
  }
});

// GET /trips/stats - Get dashboard stats for authenticated user
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const trips = await Trip.find({ userId }).select('tripId').lean();
    const totalTrips = trips.length;

    const tripIds = trips.map(t => t.tripId);
    let totalItems = 0;
    let packedItems = 0;
    if (tripIds.length > 0) {
      totalItems = await Item.countDocuments({ tripId: { $in: tripIds } });
      packedItems = await Item.countDocuments({ tripId: { $in: tripIds }, packed: true });
    }

    const packedPercentage = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;
    
    res.json({
      totalTrips,
      totalItems,
      packedItems,
      packedPercentage
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// GET /trips/:id/provisions - Estimated water + food for a trip
router.get('/:id/provisions', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    const trip = await Trip.findOne({ tripId, userId }).select('-_id -__v').lean();
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    const provisions = estimateProvisions({
      duration: trip.duration,
      terrain: trip.terrain,
      season: trip.season,
      // groupSize is the new field (POST /trips); keep participants as a
      // legacy fallback for older rows, and finally default to 1.
      participants: trip.groupSize || trip.participants || 1,
    });

    res.json(provisions);
  } catch (error) {
    console.error('Error estimating provisions:', error);
    res.status(500).json({ message: 'Error estimating provisions' });
  }
});

// GET /trips/:id - Get a single trip
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    const trip = await Trip.findOne({ tripId, userId }).select('-_id -__v').lean();
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json(trip);
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ message: 'Error fetching trip' });
  }
});

// PUT /trips/:id - Update a trip
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;
    const { name, terrain, season, duration, groupSize, status, location, lat, lon, startDate, endDate } = req.body;
    
    const updates = {};

    if (name) updates.name = name;
    if (terrain) updates.terrain = terrain;
    if (season) updates.season = season;
    if (duration) updates.duration = parseInt(duration);
    if (groupSize !== undefined && groupSize !== null && groupSize !== '') {
      updates.groupSize = Math.min(50, Math.max(1, parseInt(groupSize, 10) || 1));
    }
    if (status) updates.status = status;
    if (location !== undefined) updates.location = normalizeLocation(location) || null;
    if (lat !== undefined) updates.lat = parseCoord(lat, 90);
    if (lon !== undefined) updates.lon = parseCoord(lon, 180);
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const updated = await Trip.findOneAndUpdate(
      { tripId, userId },
      { $set: updates },
      { new: true }
    ).select('-_id -__v').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ message: 'Error updating trip: ' + error.message });
  }
});

// DELETE /trips/:id - Delete a trip and its checklist items (owner only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    // Only the owner may delete. Returns 403 for collaborators, 404 if missing.
    try {
      await sharedTrips.assertTripOwner(tripId, userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }

    // Delete the trip and all of its checklist items.
    await Trip.deleteOne({ tripId, userId });
    await Item.deleteMany({ tripId });

    // Best-effort: remove collaborator rows + their reverse-lookup entries.
    try {
      const collaborators = await sharedTrips.listCollaborators(tripId);
      await Promise.all(collaborators.map(c => sharedTrips.removeCollaborator(tripId, c.userId)));
    } catch (e) {
      console.warn('Could not clean up collaborators on trip delete:', e.message);
    }

    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ message: 'Error deleting trip' });
  }
});

// Removed: GET /trips/shared. It was declared *after* GET /trips/:id, and
// Express matches in declaration order, so `/:id` swallowed the single-segment
// `/shared` and the route was unreachable — it answered 404 "Trip not found"
// for its entire life. It also duplicated GET /shared-trips/mine
// (routes/sharedTrips.js), which is the one the frontend calls and the one the
// README documents. Two endpoints for the same question, one of them silently
// broken, is a trap; the working one is enough.
//
// The sibling routes are fine: /trips/organizer/dashboard and
// /trips/admin/dashboard are two segments, so `/:id` never matches them.

// GET /trips/:id/participants - List collaborators on a trip (owner or collaborator)
router.get('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    try {
      await sharedTrips.assertTripAccess(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    const participants = await sharedTrips.listCollaborators(tripId);
    res.json({ participants });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ message: 'Error fetching participants' });
  }
});

// POST /trips/:id/participants - Directly add a participant by userId (owner only)
// Kept for backward compatibility with the existing organizer/dashboard flows;
// now also writes the reverse SHARED_TRIP# lookup via the service.
router.post('/:id/participants', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const { userId: targetUserId, email, name } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    await sharedTrips.addCollaborator(
      tripId,
      { userId: targetUserId, email: email || null, name: name || null },
      req.user.userId
    );

    // Being added to someone else's trip is otherwise silent — the collaborator
    // has no way to discover it except by noticing a new entry in their shared
    // trips. Fail-soft; the participant is already added.
    if (targetUserId !== req.user.userId) {
      const found = await sharedTrips.getTrip(tripId);
      const tripName = found ? found.trip.name : 'a trip';
      const who = req.user.name || 'Someone';
      await notify(targetUserId, 'trip-invitation', `${who} added you to "${tripName}".`);
    }

    res.json({ message: 'Participant added successfully' });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ message: 'Error adding participant' });
  }
});

// DELETE /trips/:id/participants/:userId - Remove collaborator (owner only)
router.delete('/:id/participants/:userId', authenticate, async (req, res) => {
  try {
    const tripId = req.params.id;
    const targetUserId = req.params.userId;
    try {
      await sharedTrips.assertTripOwner(tripId, req.user.userId);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message });
    }
    await sharedTrips.removeCollaborator(tripId, targetUserId);
    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ message: 'Error removing participant' });
  }
});

// GET /trips/organizer/dashboard - Stats + trips list for the organizer page.
// Response shape: { stats: {...}, trips: [...] }.
router.get('/organizer/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const ownedTrips = await Trip.find({ userId }).select('-_id -__v').lean();

    // Attach participant lists to each trip for the UI.
    const tripsWithParticipants = await Promise.all(ownedTrips.map(async (trip) => {
      const participants = await sharedTrips.listCollaborators(trip.tripId);
      return { ...trip, participants, participantCount: participants.length };
    }));

    const stats = {
      totalOrganized: tripsWithParticipants.length,
      activeTrips: tripsWithParticipants.filter(t => t.status === 'active' || t.status === 'in_progress').length,
      completedTrips: tripsWithParticipants.filter(t => t.status === 'completed').length,
      totalParticipants: tripsWithParticipants.reduce((sum, t) => sum + (t.participantCount || 0), 0),
    };

    res.json({ stats, trips: tripsWithParticipants });
  } catch (error) {
    console.error('Error fetching organizer dashboard:', error);
    res.status(500).json({ message: 'Error fetching organizer dashboard' });
  }
});

// GET /trips/admin/dashboard - Get admin dashboard (admin only)
router.get('/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    const trips = await Trip.find({}).select('-_id -__v').lean();
    res.json(trips);
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ message: 'Error fetching admin dashboard' });
  }
});

module.exports = router;
