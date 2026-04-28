require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const notificationScheduler = require('./services/notificationScheduler');

// DB handled via DynamoDB client in db.js

const app = express();

// CORS configuration
// - Always allows requests with no Origin (e.g., same-origin, curl, server-to-server).
// - Always allows localhost / 127.0.0.1 on any port for local development.
// - Always allows the prod S3 static-site frontend (TrailPack's public UI),
//   so the static site → EB backend flow works without env var configuration.
// - Additional origins can be whitelisted via the CORS_ALLOWED_ORIGINS env var
//   as a comma-separated list. Supports exact strings or a leading "*." wildcard
//   to match any subdomain (e.g., "*.netlify.app,https://trailpack.com").
const defaultOrigins = [
  // S3 static-website endpoint that serves the production frontend.
  'http://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com',
  // HTTPS variant in case the bucket is ever fronted by CloudFront/ACM at the
  // same hostname pattern; harmless when unused.
  'https://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com',
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
      callback(new Error('Not allowed by CORS'));
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

// Health check endpoint for Elastic Beanstalk
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

// Only start listening when run directly (not when required by tests).
if (require.main === module) {
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
