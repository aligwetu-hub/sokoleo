const express = require('express');
const router = express.Router();
const { query } = require('../db/client');
const { initiateSTKPush } = require('../services/paymentService');
const {
  notifyReservationToFarmer,
  notifyReservationToTrader,
  notifyPaymentConfirmed,
} = require('../services/smsService');

// POST /api/reservations - create reservation
router.post('/', async (req, res) => {
  const { listing_id, trader_phone, quantity_reserved, notes } = req.body;

  if (!listing_id || !trader_phone) {
    return res.status(400).json({ error: 'listing_id and trader_phone are required.' });
  }

  try {
    // Get trader
    const traderRes = await query(`SELECT id, name FROM users WHERE phone=$1`, [trader_phone]);
    if (traderRes.rows.length === 0) return res.status(404).json({ error: 'Trader not found. Please register first.' });
    const trader = traderRes.rows[0];

    // Get listing + farmer info
    const listingRes = await query(
      `SELECT l.*, u.name as farmer_name, u.phone as farmer_phone
       FROM listings l JOIN users u ON l.farmer_id = u.id
       WHERE l.id=$1 AND l.status='active'`,
      [listing_id]
    );
    if (listingRes.rows.length === 0) return res.status(404).json({ error: 'Listing not found or not active.' });
    const listing = listingRes.rows[0];

    // Create reservation
    const resResult = await query(
      `INSERT INTO reservations (listing_id, trader_id, quantity_reserved, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [listing_id, trader.id, quantity_reserved || listing.quantity, notes || null]
    );
    const reservation = resResult.rows[0];

    // Update listing to reserved
    await query(`UPDATE listings SET status='reserved' WHERE id=$1`, [listing_id]);

    // Notify both parties
    await notifyReservationToFarmer(listing.farmer_phone, trader.name, listing.product, quantity_reserved || listing.quantity);
    await notifyReservationToTrader(trader_phone, listing.farmer_name, listing.farmer_phone, listing.product, quantity_reserved || listing.quantity);

    res.status(201).json({ message: 'Reservation placed.', reservation });
  } catch (err) {
    console.error('Reservation error:', err.message);
    res.status(500).json({ error: 'Failed to create reservation.' });
  }
});

// POST /api/reservations/:id/pay - initiate M-Pesa payment
router.post('/:id/pay', async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) return res.status(400).json({ error: 'phone and amount are required.' });

  try {
    const resResult = await query(`SELECT * FROM reservations WHERE id=$1`, [req.params.id]);
    if (resResult.rows.length === 0) return res.status(404).json({ error: 'Reservation not found.' });

    const reservation = resResult.rows[0];
    const mpesaPhone = phone.replace(/^0/, '254').replace(/^\+/, '');

    const result = await initiateSTKPush(mpesaPhone, amount, `RES-${reservation.id.slice(0,8)}`, 'SokoLeo Reservation');

    if (!result.success) {
      return res.status(502).json({ error: 'Payment initiation failed.', detail: result.error });
    }

    // Save payment record
    await query(
      `INSERT INTO payments (user_id, reference_id, reference_type, amount, method, mpesa_checkout_id)
       VALUES ((SELECT trader_id FROM reservations WHERE id=$1), $1, 'reservation', $2, 'mpesa', $3)`,
      [reservation.id, amount, result.CheckoutRequestID || null]
    );

    res.json({ message: 'Payment initiated. Check your phone for M-Pesa prompt.', checkoutId: result.CheckoutRequestID });
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(500).json({ error: 'Payment failed.' });
  }
});

// GET /api/reservations/farmer/:phone
router.get('/farmer/:phone', async (req, res) => {
  try {
    const db = require('../db/client');
    const result = await db.query(
      `SELECT r.*, l.product, l.quantity, l.location,
              u.name as trader_name, u.phone as trader_phone
       FROM reservations r
       JOIN listings l ON r.listing_id = l.id
       JOIN users u ON r.trader_id = u.id
       WHERE l.farmer_id = (SELECT id FROM users WHERE phone=$1)
       ORDER BY r.created_at DESC`,
      [req.params.phone]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Farmer reservations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reservations.' });
  }
});

// GET /api/reservations/trader/:phone
router.get('/trader/:phone', async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, l.product, l.quantity, l.location, u.name as farmer_name, u.phone as farmer_phone
       FROM reservations r
       JOIN listings l ON r.listing_id = l.id
       JOIN users u ON l.farmer_id = u.id
       WHERE r.trader_id = (SELECT id FROM users WHERE phone=$1)
       ORDER BY r.created_at DESC`,
      [req.params.phone]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reservations.' });
  }
});

// PATCH /api/reservations/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['confirmed','cancelled','completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    const result = await query(
      `UPDATE reservations SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reservation.' });
  }
});

module.exports = router;
