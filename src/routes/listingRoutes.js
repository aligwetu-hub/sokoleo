const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { notifyListingCreated, notifyNewProduce } = require('../services/smsService');

// GET /api/listings - search listings
router.get('/', async (req, res) => {
  const { product, location, availability, county, town, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let conditions = [`l.status = 'active'`, `l.expires_at > NOW()`];
    const params = [];
    let i = 1;

    if (product)      { conditions.push(`LOWER(l.product) LIKE LOWER($${i++})`);  params.push(`%${product}%`); }
    if (county)       { conditions.push(`LOWER(l.county) = LOWER($${i++})`);       params.push(county); }
    if (town || location) {
      const loc = town || location;
      conditions.push(`LOWER(l.location) LIKE LOWER($${i++})`);
      params.push(`%${loc}%`);
    }
    if (availability) { conditions.push(`l.availability = $${i++}`); params.push(availability); }

    params.push(parseInt(limit), offset);

    const sql = `
      SELECT l.id, l.product, l.quantity, l.unit, l.price_per_unit, l.location,
             l.county, l.region, l.availability, l.status, l.created_at, l.farmer_id,
             l.is_boosted, l.boosted_until, l.boost_count,
             u.name as farmer_name, u.phone as farmer_phone, u.location as farmer_location,
             u.is_verified as farmer_verified,
             ss.avg_rating as farmer_avg_rating, ss.total_reviews as farmer_total_reviews,
             ss.completion_rate as farmer_completion_rate
      FROM listings l
      JOIN users u ON l.farmer_id = u.id
      LEFT JOIN seller_stats ss ON ss.seller_id = l.farmer_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        (l.is_boosted AND l.boosted_until > NOW()) DESC,
        l.boosted_until DESC NULLS LAST,
        l.created_at DESC
      LIMIT $${i++} OFFSET $${i}
    `;

    const result = await query(sql, params);
    res.json({ listings: result.rows, page: parseInt(page), count: result.rows.length });
  } catch (err) {
    console.error('List listings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

// GET /api/listings/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, u.name as farmer_name, u.phone as farmer_phone, u.location as farmer_location,
              (l.is_boosted AND l.boosted_until > NOW()) AS boost_active
       FROM listings l JOIN users u ON l.farmer_id = u.id
       WHERE l.id=$1`, [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listing.' });
  }
});

// POST /api/listings - create listing
router.post('/', async (req, res) => {
  const { farmer_phone, product, quantity, unit, price_per_unit, location, county, region, availability, description } = req.body;

  if (!farmer_phone || !product || !quantity || !location || !availability) {
    return res.status(400).json({ error: 'farmer_phone, product, quantity, location, availability are required.' });
  }

  try {
    const userRes = await query(`SELECT id FROM users WHERE phone=$1 AND role='farmer'`, [farmer_phone]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Farmer not found.' });

    const farmerId = userRes.rows[0].id;

    const listing = await query(
      `INSERT INTO listings (farmer_id, product, quantity, unit, price_per_unit, location, county, region, availability, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [farmerId, product, quantity, unit || 'bags', price_per_unit || null, location, county || null, region || null, availability, description || null]
    );

    // Notify farmer
    await notifyListingCreated(farmer_phone, product, quantity, location);

    // Notify subscribed traders
    const traders = await query(
      `SELECT u.phone FROM users u
       JOIN traders t ON t.user_id = u.id
       WHERE t.subscription_tier IN ('basic','pro','bulk')
         AND (t.products_interest @> ARRAY[$1]::text[] OR t.products_interest = '{}')`,
      [product]
    );
    if (traders.rows.length > 0) {
      const phones = traders.rows.map(t => t.phone);
      await notifyNewProduce(phones, product, quantity, location, farmer_phone);
    }

    res.status(201).json({ message: 'Listing created.', listing: listing.rows[0] });
  } catch (err) {
    console.error('Create listing error:', err.message);
    res.status(500).json({ error: 'Failed to create listing.' });
  }
});

// PATCH /api/listings/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active','reserved','sold','expired'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    const result = await query(
      `UPDATE listings SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update listing.' });
  }
});

// GET /api/listings/market-prices — aggregated price summary, cached 5 min
let _marketPriceCache = null;
let _marketPriceCacheTime = 0;

router.get('/market-prices', async (req, res) => {
  const now = Date.now();
  if (_marketPriceCache && now - _marketPriceCacheTime < 300_000) {
    return res.json(_marketPriceCache);
  }
  try {
    const result = await query(`
      SELECT product,
             ROUND(AVG(price_per_unit)::numeric, 2) AS avg_price,
             MIN(price_per_unit) AS min_price,
             MAX(price_per_unit) AS max_price,
             COUNT(*) AS listing_count,
             SUM(quantity) AS total_quantity
      FROM listings
      WHERE status = 'active' AND price_per_unit IS NOT NULL
      GROUP BY product
      ORDER BY listing_count DESC
      LIMIT 50
    `);
    _marketPriceCache = result.rows;
    _marketPriceCacheTime = now;
    res.json(result.rows);
  } catch (err) {
    console.error('Market prices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market prices.' });
  }
});

// DELETE /api/listings/:id
router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM listings WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Listing deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete listing.' });
  }
});

module.exports = router;
