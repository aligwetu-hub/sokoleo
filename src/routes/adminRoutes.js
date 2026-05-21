const express  = require('express');
const router   = express.Router();
const { query } = require('../db/pool');
const COUNTIES = require('../config/kenya-counties');

// GET /api/admin/counties
router.get('/counties', (req, res) => res.json(COUNTIES));

// GET /api/admin/counties/:county/towns
router.get('/counties/:county/towns', (req, res) => {
  const towns = COUNTIES.getTowns(req.params.county);
  res.json({ county: req.params.county, towns });
});

// GET /api/admin/stats - dashboard overview
router.get('/stats', async (req, res) => {
  try {
    const [farmers, traders, listings, reservations, payments, topCrops] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE role='farmer'`),
      query(`SELECT COUNT(*) FROM users WHERE role='trader'`),
      query(`SELECT COUNT(*) FROM listings WHERE status='active'`),
      query(`SELECT COUNT(*) FROM reservations`),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'`),
      query(`SELECT product, COUNT(*) as count FROM listings GROUP BY product ORDER BY count DESC LIMIT 5`),
    ]);

    res.json({
      farmers: parseInt(farmers.rows[0].count),
      traders: parseInt(traders.rows[0].count),
      active_listings: parseInt(listings.rows[0].count),
      total_reservations: parseInt(reservations.rows[0].count),
      total_revenue_kes: parseFloat(payments.rows[0].total),
      top_crops: topCrops.rows,
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const { role, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    let sql = `SELECT id, name, phone, role, location, is_verified, created_at FROM users`;
    const params = [];
    if (role) { sql += ` WHERE role=$1`; params.push(role); }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// PATCH /api/admin/users/:id/verify
router.patch('/users/:id/verify', async (req, res) => {
  try {
    await query(`UPDATE users SET is_verified=TRUE WHERE id=$1`, [req.params.id]);
    res.json({ message: 'User verified.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify user.' });
  }
});

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    await query(`UPDATE users SET is_active=FALSE WHERE id=$1`, [req.params.id]);
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user.' });
  }
});

// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
  console.log('Analytics endpoint hit!');
  try {
    const farmers  = await query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'farmer'`);
    const traders  = await query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'trader'`);
    const listings = await query(`SELECT COUNT(*)::int AS count FROM listings`);

    res.json({
      key_metrics: {
        total_farmers:    farmers.rows[0].count,
        total_traders:    traders.rows[0].count,
        total_listings:   listings.rows[0].count,
        total_revenue:    0,
        total_commission: 0,
      },
      today: {
        new_users:       0,
        new_listings:    0,
        deals_completed: 0,
        revenue_today:   0,
      },
      commission_by_category: [],
      recent_transactions:    [],
      top_farmers:            [],
      top_traders:            [],
    });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/listings
router.get('/listings', async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, u.name as farmer_name, u.phone as farmer_phone
       FROM listings l JOIN users u ON l.farmer_id = u.id
       ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

module.exports = router;
