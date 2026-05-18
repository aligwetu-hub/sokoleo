const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');

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
  try {
    const [
      keyMetrics,
      todayActivity,
      commissionByCategory,
      recentTransactions,
      topFarmers,
      topTraders,
    ] = await Promise.all([

      query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE role='farmer')::int                            AS total_farmers,
          (SELECT COUNT(*) FROM users WHERE role='trader')::int                            AS total_traders,
          (SELECT COUNT(*) FROM listings)::int                                             AS total_listings,
          (SELECT COUNT(*) FROM listings WHERE status='active')::int                      AS active_listings,
          COALESCE((SELECT SUM(sokoleo_commission) FROM transactions WHERE status='confirmed'),0) AS total_commission
      `),

      query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE)::int         AS new_registrations,
          (SELECT COUNT(*) FROM listings WHERE created_at::date = CURRENT_DATE)::int      AS new_listings,
          (SELECT COUNT(*) FROM transactions WHERE status='confirmed'
            AND confirmed_at::date = CURRENT_DATE)::int                                   AS deals_today,
          COALESCE((SELECT SUM(sokoleo_commission) FROM transactions
            WHERE status='confirmed' AND confirmed_at::date = CURRENT_DATE),0)            AS revenue_today
      `),

      query(`
        SELECT
          category,
          COUNT(*)::int                         AS total_deals,
          COALESCE(SUM(listing_price),0)        AS total_gmv,
          COALESCE(SUM(sokoleo_commission),0)   AS commission_earned
        FROM transactions
        WHERE status='confirmed'
        GROUP BY category
        ORDER BY commission_earned DESC
      `),

      query(`
        SELECT
          t.created_at, t.item_description, t.listing_price,
          t.sokoleo_commission, t.status, t.category,
          b.name AS buyer_name, s.name AS seller_name
        FROM transactions t
        JOIN users b ON t.buyer_id  = b.id
        JOIN users s ON t.seller_id = s.id
        ORDER BY t.created_at DESC LIMIT 10
      `),

      query(`
        SELECT
          u.name, u.phone, u.location,
          COUNT(t.id)::int                        AS completed_deals,
          COALESCE(SUM(t.seller_receives),0)      AS total_earnings
        FROM users u
        JOIN transactions t ON t.seller_id = u.id AND t.status='confirmed'
        GROUP BY u.id, u.name, u.phone, u.location
        ORDER BY total_earnings DESC LIMIT 5
      `),

      query(`
        SELECT
          u.name, u.phone, u.location,
          COUNT(t.id)::int                        AS completed_deals,
          COALESCE(SUM(t.buyer_pays),0)           AS total_spent
        FROM users u
        JOIN transactions t ON t.buyer_id = u.id AND t.status='confirmed'
        GROUP BY u.id, u.name, u.phone, u.location
        ORDER BY total_spent DESC LIMIT 5
      `),
    ]);

    res.json({
      key_metrics:           keyMetrics.rows[0],
      today:                 todayActivity.rows[0],
      commission_by_category: commissionByCategory.rows,
      recent_transactions:   recentTransactions.rows,
      top_farmers:           topFarmers.rows,
      top_traders:           topTraders.rows,
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
