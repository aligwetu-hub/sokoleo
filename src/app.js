require('dotenv').config();
const express  = require('express');
const rateLimit = require('express-rate-limit');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const authRoutes        = require('./routes/authRoutes');
const listingRoutes     = require('./routes/listingRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const farmTourRoutes    = require('./routes/farmTourRoutes');
const callbackRoutes    = require('./routes/callbackRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const escrowRoutes      = require('./routes/escrowRoutes');
const livestockRoutes   = require('./routes/livestockRoutes');
const servicesRoutes    = require('./routes/servicesRoutes');
const visionRoutes      = require('./routes/visionRoutes');
const reviewRoutes      = require('./routes/reviewRoutes');
const messageRoutes     = require('./routes/messageRoutes');
const boostRoutes       = require('./routes/boostRoutes');
const negotiationRoutes = require('./routes/negotiationRoutes');
const smsRoutes         = require('./routes/smsRoutes');

const app = express();

// Trust Render's proxy — required for express-rate-limit behind a load balancer
app.set('trust proxy', 1);

// Security + logging
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true });
app.use('/api/', limiter);

// Stricter limit for AI vision (expensive calls)
const visionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true });
app.use('/api/vision', visionLimiter);

// ── 1. Static files (FIRST — serves .html, .js, .css, images) ────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── 2. API Routes (before catch-all) ─────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/listings',     listingRoutes);
app.use('/api/negotiations', negotiationRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/livestock',    livestockRoutes);
app.use('/api/escrow',       escrowRoutes);
app.use('/api/reviews',      reviewRoutes);
app.use('/api/messages',     messageRoutes);
app.use('/api/boosts',       boostRoutes);
app.use('/api/sms',          smsRoutes);
app.use('/api/tours',        farmTourRoutes);
app.use('/api/services',     servicesRoutes);
app.use('/api/vision',       visionRoutes);
app.use('/api',              callbackRoutes); // USSD + M-Pesa callbacks

// ── 3. Named HTML page routes ─────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'SokoLeo API', version: '2.0', timestamp: new Date() })
);
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/analytics', (req, res) => res.sendFile(path.join(__dirname, '../public/analytics.html')));

// ── 4. 404 catch-all (LAST) ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── 5. Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image too large (max 10 MB)' });
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

module.exports = app;
