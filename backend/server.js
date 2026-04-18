require('dotenv').config();
const express = require('express');
const cors = require('cors');

// DB handled via DynamoDB client in db.js

const app = express();

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      process.env.FRONTEND_URL
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/trips', require('./routes/trips'));
app.use('/trips', require('./routes/items'));  // For /trips/:id/items paths
app.use('/items', require('./routes/items'));  // For /items/:id direct access
app.use('/ai', require('./routes/ai'));
app.use('/notifications', require('./routes/notifications'));

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
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
