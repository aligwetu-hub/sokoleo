const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');

// POST /api/reviews — trader submits a rating after a completed deal
router.post('/', async (req, res) => {
  const { reviewer_id, farmer_id, transaction_id, rating, comment } = req.body;

  if (!reviewer_id || !farmer_id || !rating)
    return res.status(400).json({ error: 'reviewer_id, farmer_id and rating are required' });

  const ratingInt = parseInt(rating);
  if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5)
    return res.status(400).json({ error: 'rating must be between 1 and 5' });

  try {
    const r = await query(`
      INSERT INTO reviews (reviewer_id, farmer_id, transaction_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (reviewer_id, farmer_id, transaction_id) DO NOTHING
      RETURNING *`,
      [reviewer_id, farmer_id, transaction_id || null, ratingInt, comment || null]
    );

    if (!r.rows.length)
      return res.status(409).json({ error: 'You have already reviewed this transaction.' });

    res.status(201).json({ success: true, review: r.rows[0] });
  } catch (err) {
    console.error('Create review error:', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/farmer/:farmerId — all reviews for a farmer (for profile page)
router.get('/farmer/:farmerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT rv.id, rv.rating, rv.comment, rv.created_at,
             u.name AS reviewer_name
      FROM reviews rv
      JOIN users u ON rv.reviewer_id = u.id
      WHERE rv.farmer_id = $1
      ORDER BY rv.created_at DESC
      LIMIT 50`,
      [req.params.farmerId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Fetch reviews error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/stats/:farmerId — avg rating + breakdown (for hero card)
router.get('/stats/:farmerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT
        COUNT(*)::int                          AS total,
        ROUND(AVG(rating)::numeric, 1)         AS avg_rating,
        COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
        COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
        COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
        COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
        COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
      FROM reviews
      WHERE farmer_id = $1`,
      [req.params.farmerId]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Fetch review stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch review stats' });
  }
});

module.exports = router;
