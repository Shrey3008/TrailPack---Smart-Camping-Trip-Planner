// Never load the developer's .env during tests. Doing so pulled the real
// MONGODB_URI (production Atlas) and GROQ_API_KEY into the test process the
// moment a test required this file — so the suite made live Groq calls, and a
// single stray connectDB() would have pointed tests at production data.
// __tests__/setup.js supplies everything the suite needs.
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { connectDB } = require('./db');
const notificationScheduler = require('./services/notificationScheduler');

const app = express();

// CORS configuration
// - Always allows requests with no Origin (e.g., same-origin, curl, server-to-server).
// - Always allows localhost / 127.0.0.1 on any port for local development.
// - Always allows any *.netlify.app subdomain (TrailPack's public UI on Netlify).
// - Additional origins can be whitelisted via the CORS_ALLOWED_ORIGINS env var
//   as a comma-separated list. Supports exact strings or a leading "*." wildcard
//   to match any subdomain (e.g., "*.netlify.app,https://trailpack.com").
const defaultOrigins = [
  // Netlify-hosted production frontend (any deploy/branch subdomain).
  '*.netlify.app',
];

const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowedOrigins = [...defaultOrigins, ...extraOrigins];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  return allowedOrigins.some(entry => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".example.com"
      try {
        const host = new URL(origin).host;
        return host === suffix.slice(1) || host.endsWith(suffix);
      } catch (_) {
        return false;
      }
    }
    return entry === origin;
  });
}

app.use(cors({
  origin: function(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      // A disallowed origin is a client error, not a server fault. Tag it so
      // the error handler answers 403 instead of a generic 500 and skips the
      // stack trace — the warn above already records everything useful.
      const err = new Error('Not allowed by CORS');
      err.status = 403;
      err.expected = true;
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/trips', require('./routes/trips'));
app.use('/trips', require('./routes/items'));  // For /trips/:id/items paths
app.use('/items', require('./routes/items'));  // For /items/:id direct access
app.use('/', require('./routes/sharedTrips')); // /trips/:id/invites, /invites/*, /shared-trips/*
app.use('/ai', require('./routes/ai'));
app.use('/notifications', require('./routes/notifications'));
app.use('/admin', require('./routes/admin'));
app.use('/weather', require('./routes/weather'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'TrailPack API is running!' });
});

// Health check endpoint (used by Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// MOCK ROUTES for Phase 4 compatibility (return empty data to stop 404s)
app.get('/notifications', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

app.get('/notifications/unread', (req, res) => {
  res.status(200).json({ success: true, count: 0 });
});

app.get('/notifications/unread-count', (req, res) => {
  res.status(200).json({ success: true, data: { unreadCount: 0 } });
});

app.get('/shared-trips', (req, res) => {
  res.status(200).json({ success: true, trips: [] });
});

// Error handling middleware.
// Errors tagged with `expected` (e.g. a blocked CORS origin) are normal client
// errors — answer with their status and skip the stack trace so real faults
// stay visible in the logs. Anything untagged is a genuine 500.
app.use((err, req, res, next) => {
  const status = err && err.status;
  if (err && err.expected && status) {
    return res.status(status).json({ message: err.message });
  }
  console.error(err.stack);
  res.status(status && status >= 400 && status < 600 ? status : 500)
    .json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

// Only start listening when run directly (not when required by tests).
// Connect to MongoDB first — the process should crash loudly (and Render
// will restart it) rather than serve requests with no database.
if (require.main === module) {
  connectDB()
    .then(() => startServer())
    .catch(err => {
      console.error('[db] Failed to connect to MongoDB:', err.message);
      process.exit(1);
    });
}

function startServer() {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Daily notification scheduler — fires at 09:00 server time and
    // emails trip owners 3-day pre-trip reminders + 1-day packing
    // nudges. The scheduler is fully self-contained and fail-soft;
    // see services/notificationScheduler.js for guard rails.
    try {
      cron.schedule('0 9 * * *', () => notificationScheduler.run(), { timezone: 'America/New_York' });
      console.log('[scheduler] Notification scheduler started — runs daily at 9AM America/New_York');
    } catch (err) {
      console.error('[scheduler] Failed to start cron job:', err.message);
    }
  });
}

module.exports = { app, isOriginAllowed };
