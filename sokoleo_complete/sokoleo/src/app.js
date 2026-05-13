require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const farmTourRoutes = require('./routes/farmTourRoutes');
const callbackRoutes = require('./routes/callbackRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for USSD callbacks

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true });
app.use('/api/', limiter);

// Static files (admin dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'SokoLeo API', timestamp: new Date() }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/tours', farmTourRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', callbackRoutes); // USSD + M-Pesa callbacks

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
