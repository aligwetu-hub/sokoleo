require('dotenv').config();
const express      = require('express');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const morgan       = require('morgan');
const cors         = require('cors');
const compression  = require('compression');
const path         = require('path');
const fs           = require('fs');

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
const pickupRoutes      = require('./routes/pickupRoutes');
const smsRoutes         = require('./routes/smsRoutes');
const whatsappRoutes    = require('./routes/whatsappRoutes');
const sanitizeInput     = require('./middleware/sanitize');
const adminAuth         = require('./middleware/adminAuth');

const app = express();

// Trust Render's proxy — required for express-rate-limit behind a load balancer
app.set('trust proxy', 1);

// Gzip compression for all responses
app.use(compression());

// CORS — restricted to known origins
const allowedOrigins = [
  'https://sokoleo.onrender.com',
  'http://localhost:4000',
  'http://localhost:3000',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Security headers
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Input sanitization (XSS / JS injection scrubbing)
app.use(sanitizeInput);

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true });
app.use('/api/', limiter);

// Stricter limit for AI vision (expensive calls)
const visionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true });
app.use('/api/vision', visionLimiter);

// ── 1. Static files (FIRST — serves .html, .js, .css, images) ────────────────
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath, {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
console.log('Serving static files from:', publicPath);

// ── 2. API Routes (before catch-all) ─────────────────────────────────────────

// Public counties endpoint — not behind adminAuth
const COUNTIES = require('./config/kenya-counties');
app.get('/api/counties', (req, res) => res.json(COUNTIES));

app.use('/api/auth',         authRoutes);
app.use('/api/listings',     listingRoutes);
app.use('/api/negotiations', negotiationRoutes);
app.use('/api/pickup',      pickupRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin',        adminAuth, adminRoutes);
app.use('/api/livestock',    livestockRoutes);
app.use('/api/escrow',       escrowRoutes);
app.use('/api/reviews',      reviewRoutes);
app.use('/api/messages',     messageRoutes);
app.use('/api/boosts',       boostRoutes);
app.use('/api/sms',          smsRoutes);
app.use('/api/whatsapp',    whatsappRoutes);
app.use('/api/tours',        farmTourRoutes);
app.use('/api/services',     servicesRoutes);
app.use('/api/vision',       visionRoutes);
app.use('/api',              callbackRoutes); // USSD + M-Pesa callbacks

// ── 3. Health + debug routes ──────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const BackupService = require('./services/backupService');
  const status = await BackupService.healthCheck();
  status.service = 'SokoLeo API';
  status.version = '2.0';
  res.status(status.database === 'ok' ? 200 : 503).json(status);
});

app.get('/debug-path', (req, res) => {
  const publicDir = path.join(__dirname, '..', 'public');
  res.json({
    publicPath: publicDir,
    exists: fs.existsSync(publicDir),
    files: fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [],
  });
});

// ── 4. Explicit HTML page routes ──────────────────────────────────────────────
const pages = [
  'index', 'farmer', 'trader', 'admin', 'analytics',
  'market-prices', 'farm-services', 'route-planner', 'farmer-profile',
];

pages.forEach(page => {
  app.get(`/${page}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', `${page}.html`));
  });
});

app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/analytics', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'analytics.html')));

// ── 5. 404 catch-all (LAST) ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── 6. Error handler ──────────────────────────────────────────────────────────
const monitoring = require('./services/monitoringService');

app.use(async (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image too large (max 10 MB)' });
  await monitoring.trackError(err, `${req.method} ${req.path}`);
  console.error('Unhandled error:', err.stack);
  res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason) => {
  await monitoring.trackError(new Error(String(reason)), 'unhandledRejection');
  console.error('Unhandled Rejection:', reason);
});

// Handle uncaught exceptions — alert then exit cleanly
process.on('uncaughtException', async (error) => {
  await monitoring.trackError(error, 'uncaughtException');
  console.error('Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 2000);
});

module.exports = app;
