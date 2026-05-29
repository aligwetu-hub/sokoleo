const express = require('express');
const router = express.Router();
const db = require('../db/client');
const { sendSMS, SMS_TEMPLATES } = require('../services/smsService');
const monitoring = require('../services/monitoringService');

async function updateSellerStats(sellerId) {
  try {
    await db.query(`
      INSERT INTO seller_stats (seller_id, total_sales, completion_rate, last_updated)
      VALUES ($1, 1, 100, NOW())
      ON CONFLICT (seller_id) DO UPDATE SET
        total_sales = seller_stats.total_sales + 1,
        completion_rate = (
          SELECT ROUND(
            COUNT(*) FILTER (WHERE n2.status = 'accepted')::numeric /
            NULLIF(COUNT(*), 0) * 100, 2
          )
          FROM negotiations n2
          JOIN listings l2 ON n2.listing_id = l2.id
          WHERE l2.farmer_id = $1
        ),
        last_updated = NOW()
    `, [sellerId]);
  } catch (e) { console.error('Seller stats update error:', e.message); }
}

// POST /api/v1/negotiations - trader makes offer
router.post('/', async (req, res) => {
  const { listing_id, trader_phone, offer_price, message } = req.body;
  if (!listing_id || !trader_phone || !offer_price) {
    return res.status(400).json({ error: 'listing_id, trader_phone, and offer_price are required.' });
  }
  try {
    // Get listing and farmer
    const listingRes = await db.query(
      `SELECT l.*, u.name as farmer_name, u.phone as farmer_phone
       FROM listings l JOIN users u ON l.farmer_id = u.id
       WHERE l.id=$1 AND l.status='active'`,
      [listing_id]
    );
    if (!listingRes.rows.length) return res.status(404).json({ error: 'Listing not found or not active.' });
    const listing = listingRes.rows[0];

    // Get trader
    const traderRes = await db.query('SELECT id, name FROM users WHERE phone=$1', [trader_phone]);
    if (!traderRes.rows.length) return res.status(404).json({ error: 'Trader not found.' });
    const trader = traderRes.rows[0];

    // Check if negotiation already exists
    const existing = await db.query(
      `SELECT id FROM negotiations WHERE listing_id=$1 AND trader_id=$2 AND status='open'`,
      [listing_id, trader.id]
    );
    if (existing.rows.length) return res.status(409).json({ error: 'You already have an open negotiation for this listing.' });

    // Create negotiation
    const neg = await db.query(
      `INSERT INTO negotiations (listing_id, trader_id, farmer_id, initial_price, current_offer, offered_by)
       VALUES ($1,$2,$3,$4,$5,'trader') RETURNING *`,
      [listing_id, trader.id, listing.farmer_id, listing.price_per_unit || offer_price, offer_price]
    );

    // Log first message
    await db.query(
      `INSERT INTO negotiation_messages (negotiation_id, sender_role, amount, message) VALUES ($1,'trader',$2,$3)`,
      [neg.rows[0].id, offer_price, message || null]
    );

    // SMS farmer — non-blocking
    try {
      await sendSMS(listing.farmer_phone,
        SMS_TEMPLATES.newOffer(listing.farmer_name, listing.product, offer_price, trader.name));
    } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }

    res.status(201).json({ message: 'Offer sent to farmer!', negotiation: neg.rows[0] });
  } catch(e) {
    console.error('Negotiation error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

// GET /api/v1/negotiations/trader/:phone
router.get('/trader/:phone', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT n.*, l.product, l.quantity, l.unit, l.location,
              u.name as farmer_name, u.phone as farmer_phone
       FROM negotiations n
       JOIN listings l ON n.listing_id = l.id
       JOIN users u ON n.farmer_id = u.id
       WHERE n.trader_id = (SELECT id FROM users WHERE phone=$1)
       ORDER BY n.updated_at DESC`,
      [req.params.phone]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/v1/negotiations/farmer/:phone
router.get('/farmer/:phone', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT n.*, l.product, l.quantity, l.unit, l.location,
              u.name as trader_name, u.phone as trader_phone
       FROM negotiations n
       JOIN listings l ON n.listing_id = l.id
       JOIN users u ON n.trader_id = u.id
       WHERE n.farmer_id = (SELECT id FROM users WHERE phone=$1)
       ORDER BY n.updated_at DESC`,
      [req.params.phone]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/v1/negotiations/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM negotiation_messages WHERE negotiation_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/negotiations/:id/respond - farmer accepts, counters or rejects
router.post('/:id/respond', async (req, res) => {
  const { action, counter_price, message, farmer_phone } = req.body;
  if (!action || !farmer_phone) return res.status(400).json({ error: 'action and farmer_phone required.' });
  if (!['accept','counter','reject'].includes(action)) return res.status(400).json({ error: 'action must be accept, counter, or reject.' });

  try {
    const neg = await db.query(
      `SELECT n.*, l.product, u.name as trader_name, u.phone as trader_phone
       FROM negotiations n
       JOIN listings l ON n.listing_id = l.id
       JOIN users u ON n.trader_id = u.id
       WHERE n.id=$1`,
      [req.params.id]
    );
    if (!neg.rows.length) return res.status(404).json({ error: 'Negotiation not found.' });
    const n = neg.rows[0];

    if (action === 'accept') {
      await db.query(`UPDATE negotiations SET status='accepted', updated_at=NOW() WHERE id=$1`, [req.params.id]);

      // Auto-create reservation
      await db.query(
        `INSERT INTO reservations (listing_id, trader_id, quantity_reserved, status, notes)
         VALUES ($1,$2,$3,'confirmed',$4)`,
        [n.listing_id, n.trader_id, n.quantity || 'as listed', `Price agreed: KES ${n.current_offer}`]
      );
      await db.query(`UPDATE listings SET status='reserved' WHERE id=$1`, [n.listing_id]);

      try {
        await sendSMS(n.trader_phone,
          SMS_TEMPLATES.offerAccepted(n.trader_name, n.product, n.current_offer, n.farmer_name || 'Mkulima'));
      } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }

      await updateSellerStats(n.farmer_id);
      monitoring.trackDeal(n.current_offer, n.product);
      res.json({ message: 'Offer accepted! Reservation created.', agreed_price: n.current_offer });

    } else if (action === 'counter') {
      if (!counter_price) return res.status(400).json({ error: 'counter_price required for counter.' });
      await db.query(
        `UPDATE negotiations SET current_offer=$1, offered_by='farmer', updated_at=NOW() WHERE id=$2`,
        [counter_price, req.params.id]
      );
      await db.query(
        `INSERT INTO negotiation_messages (negotiation_id, sender_role, amount, message) VALUES ($1,'farmer',$2,$3)`,
        [req.params.id, counter_price, message || null]
      );
      try {
        await sendSMS(n.trader_phone,
          SMS_TEMPLATES.offerCountered(n.trader_name, n.product, counter_price, 'the Farmer'));
      } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }
      res.json({ message: 'Counter offer sent to trader.' });

    } else if (action === 'reject') {
      await db.query(`UPDATE negotiations SET status='rejected', updated_at=NOW() WHERE id=$1`, [req.params.id]);
      try {
        await sendSMS(n.trader_phone,
          SMS_TEMPLATES.offerRejected(n.trader_name, n.product, 'the Farmer'));
      } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }
      res.json({ message: 'Offer rejected.' });
    }
  } catch(e) {
    console.error('Respond error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

// POST /api/v1/negotiations/:id/trader-respond - trader accepts counter or counters back
router.post('/:id/trader-respond', async (req, res) => {
  const { action, counter_price, message, trader_phone } = req.body;
  if (!action || !trader_phone) return res.status(400).json({ error: 'action and trader_phone required.' });

  try {
    const neg = await db.query(
      `SELECT n.*, l.product, u.name as farmer_name, u.phone as farmer_phone
       FROM negotiations n
       JOIN listings l ON n.listing_id = l.id
       JOIN users u ON n.farmer_id = u.id
       WHERE n.id=$1`,
      [req.params.id]
    );
    if (!neg.rows.length) return res.status(404).json({ error: 'Negotiation not found.' });
    const n = neg.rows[0];

    if (action === 'accept') {
      await db.query(`UPDATE negotiations SET status='accepted', updated_at=NOW() WHERE id=$1`, [req.params.id]);
      await db.query(
        `INSERT INTO reservations (listing_id, trader_id, quantity_reserved, status, notes) VALUES ($1,$2,$3,'confirmed',$4)`,
        [n.listing_id, n.trader_id, 'as listed', `Price agreed: KES ${n.current_offer}`]
      );
      await db.query(`UPDATE listings SET status='reserved' WHERE id=$1`, [n.listing_id]);
      try {
        await sendSMS(n.farmer_phone,
          SMS_TEMPLATES.offerAccepted(n.farmer_name, n.product, n.current_offer, n.trader_name));
      } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }
      await updateSellerStats(n.farmer_id);
      monitoring.trackDeal(n.current_offer, n.product);
      res.json({ message: 'Deal accepted!', agreed_price: n.current_offer });

    } else if (action === 'counter') {
      if (!counter_price) return res.status(400).json({ error: 'counter_price required.' });
      await db.query(`UPDATE negotiations SET current_offer=$1, offered_by='trader', updated_at=NOW() WHERE id=$2`, [counter_price, req.params.id]);
      await db.query(`INSERT INTO negotiation_messages (negotiation_id, sender_role, amount, message) VALUES ($1,'trader',$2,$3)`, [req.params.id, counter_price, message || null]);
      try {
        await sendSMS(n.farmer_phone,
          SMS_TEMPLATES.newOffer(n.farmer_name, n.product, counter_price, n.trader_name));
      } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }
      res.json({ message: 'Counter sent to farmer.' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
