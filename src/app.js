const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const listingRoutes = require('./routes/listingRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const farmTourRoutes = require('./routes/farmTourRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const ussdRoutes = require('./routes/ussdRoutes');
const smsRoutes = require('./routes/smsRoutes');
const negotiationRoutes = require("./routes/negotiationRoutes");
const adminRoutes = require('./routes/adminRoutes');
const livestockRoutes = require('./routes/livestockRoutes');

const app = express();

const path = require('path');
app.use(express.static(path.join(__dirname, '../public'), { setHeaders: (res) => res.setHeader('Content-Type', 'text/html; charset=utf-8') }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sokoleo-backend' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/listings', listingRoutes);
app.use('/api/v1/reservations', reservationRoutes);
app.use('/api/v1/farm-tours', farmTourRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/ussd', ussdRoutes);
app.use('/api/v1/sms', smsRoutes);
app.use('/api/v1/negotiations', negotiationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/livestock', livestockRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'internal_server_error' });
});

module.exports = app;


