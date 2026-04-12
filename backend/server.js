require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com',
  'https://trailpack-frontend-173480719972.s3-website-us-east-1.amazonaws.com'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/trips', require('./routes/trips'));
app.use('/items', require('./routes/items'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'TrailPack API is running!' });
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
