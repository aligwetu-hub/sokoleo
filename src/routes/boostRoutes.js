const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');

const BOOST_TIERS = {
  50:  { duration_hrs: 24,  label: '24 hours'  },
  100: { duration_hrs: 72,  label: '72 hours'  },
  200: { duration_hrs: 168, label: '7 days'    },
};

// POST /api/boosts  — activate a boost after farmer has paid
router.post('/', async (req, res) => {
  const { listing_id, farmer_id, amount_paid, duration_hrs } = req.body;

  if (!listing_id || !farmer_id || !amount_paid)
    return res.status(400).json({ error: 'listing_id, farmer_id and amount_paid are required' });

  const amount = parseFloat(amount_paid);
  const tier   = BOOST_TIERS[amount] || null;
  const hours  = parseInt(duration_hrs) || (tier ? tier.duration_hrs : 24);

  if (!tier && !duration_hrs)
    return res.status(400).json({ error: 'amount_paid must be 50, 100, or 200 KES' });

  try {
    // Verify listing belongs to farmer
    const listingRes = await query(
      `SELECT id FROM listings WHERE id=$1 AND farmer_id=$2`, [listing_id, farmer_id]
    );
    if (!listingRes.rows.length)
      return res.status(404).json({ error: 'Listing not found or does not belong to this farmer' });

    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

    // Record boost
    const boostRes = await query(`
      INSERT INTO boosts (listing_id, farmer_id, amount_paid, duration_hrs, expires_at)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [listing_id, farmer_id, amount, hours, expiresAt]
    );

    // Stamp listing
    await query(`
      UPDATE listings
      SET is_boosted=TRUE, boosted_until=$1, boost_count=boost_count+1
      WHERE id=$2`,
      [expiresAt, listing_id]
    );

    res.status(201).json({
      success: true,
      boost: boostRes.rows[0],
      boosted_until: expiresAt,
      message: `Listing boosted for ${hours < 168 ? hours + ' hours' : '7 days'}!`,
    });
  } catch (err) {
    console.error('Boost error:', err.message);
    res.status(500).json({ error: 'Failed to activate boost' });
  }
});

// GET /api/boosts/active  — all currently active boosted listings (with listing + farmer info)
router.get('/active', async (req, res) => {
  try {
    const r = await query(`
      SELECT l.*, u.name AS farmer_name, u.phone AS farmer_phone
      FROM listings l
      JOIN users u ON l.farmer_id = u.id
      WHERE l.is_boosted = TRUE AND l.boosted_until > NOW() AND l.status = 'active'
      ORDER BY l.boosted_until DESC`);
    res.json(r.rows);
  } catch (err) {
    console.error('Active boosts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch boosted listings' });
  }
});

// DELETE /api/boosts/expire  — clean up expired boosts (can be called on a schedule)
router.delete('/expire', async (req, res) => {
  try {
    const r = await query(`
      UPDATE listings
      SET is_boosted=FALSE, boosted_until=NULL
      WHERE is_boosted=TRUE AND boosted_until < NOW()
      RETURNING id`);
    res.json({ success: true, expired: r.rows.length, message: `${r.rows.length} expired boosts cleared` });
  } catch (err) {
    console.error('Expire boosts error:', err.message);
    res.status(500).json({ error: 'Failed to expire boosts' });
  }
});

// GET /api/boosts/farmer/:farmerId  — all boosts by a specific farmer
router.get('/farmer/:farmerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT b.*, l.product, l.location
      FROM boosts b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.farmer_id = $1
      ORDER BY b.started_at DESC
      LIMIT 50`,
      [req.params.farmerId]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch boost history' });
  }
});

module.exports = router;
