const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');

// POST /api/reviews — submit a review
router.post('/', async (req, res) => {
  const { reviewer_id, seller_id, rating, comment, transaction_id } = req.body;

  if (!reviewer_id || !seller_id || !rating)
    return res.status(400).json({ error: 'reviewer_id, seller_id and rating are required' });

  const ratingInt = parseInt(rating);
  if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5)
    return res.status(400).json({ error: 'rating must be between 1 and 5' });

  try {
    const r = await query(
      `INSERT INTO reviews (reviewer_id, seller_id, transaction_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [reviewer_id, seller_id, transaction_id || null, ratingInt, comment || null]
    );

    // Recalculate and upsert seller_stats
    await query(`
      INSERT INTO seller_stats (seller_id, avg_rating, total_reviews, last_updated)
      SELECT $1,
             ROUND(AVG(rating)::numeric, 2),
             COUNT(*),
             NOW()
      FROM reviews WHERE seller_id = $1
      ON CONFLICT (seller_id) DO UPDATE
        SET avg_rating    = EXCLUDED.avg_rating,
            total_reviews = EXCLUDED.total_reviews,
            last_updated  = NOW()
    `, [seller_id]);

    res.status(201).json({ success: true, review: r.rows[0] });
  } catch (err) {
    console.error('Create review error:', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/seller/:sellerId — all reviews for a seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT rv.id, rv.rating, rv.comment, rv.created_at, rv.reviewer_role,
             u.name AS reviewer_name
      FROM reviews rv
      JOIN users u ON rv.reviewer_id = u.id
      WHERE rv.seller_id = $1
      ORDER BY rv.created_at DESC
      LIMIT 50`,
      [req.params.sellerId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Fetch reviews error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/stats/:sellerId — seller_stats + per-star breakdown
router.get('/stats/:sellerId', async (req, res) => {
  try {
    const [stats, breakdown] = await Promise.all([
      query(`SELECT * FROM seller_stats WHERE seller_id = $1`, [req.params.sellerId]),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
          COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
          COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
          COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
          COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
        FROM reviews WHERE seller_id = $1`,
        [req.params.sellerId]
      )
    ]);
    res.json({ ...(stats.rows[0] || {}), ...(breakdown.rows[0] || {}) });
  } catch (err) {
    console.error('Fetch review stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch review stats' });
  }
});

module.exports = router;
