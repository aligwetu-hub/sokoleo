bash

cat /tmp/sokoleo/src/routes/groupRoutes.js
Output

const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');

// GET /api/groups?county= - list/search farmer groups
router.get('/', async (req, res) => {
  try {
    const { county } = req.query;
    const conditions = [`status='active'`];
    const params = [];
    if (county) { params.push(county); conditions.push(`LOWER(county)=LOWER($${params.length})`); }
    const result = await query(
      `SELECT * FROM farmer_groups WHERE ${conditions.join(' AND ')} ORDER BY is_verified DESC, name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List groups error:', err.message);
    res.status(500).json({ error: 'Failed to fetch groups.' });
  }
});

// GET /api/groups/:id - single group detail
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM farmer_groups WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group.' });
  }
});

// POST /api/groups/register - register a new farmer group
router.post('/register', async (req, res) => {
  const { name, county, town, physical_address, contact_person, contact_phone } = req.body;
  if (!name || !county || !town) {
    return res.status(400).json({ error: 'name, county, and town are required.' });
  }
  try {
    const result = await query(
      `INSERT INTO farmer_groups (name, county, town, physical_address, contact_person, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, county, town, physical_address || null, contact_person || null, contact_phone || null]
    );
    res.status(201).json({ success: true, group: result.rows[0] });
  } catch (err) {
    console.error('Register group error:', err.message);
    res.status(500).json({ error: 'Failed to register group.' });
  }
});

// PATCH /api/groups/assign/:user_id - set (or clear) a farmer's group affiliation
// Body: { group_id } — pass group_id: null to remove a farmer from a group.
router.patch('/assign/:user_id', async (req, res) => {
  const { group_id } = req.body;
  try {
    if (group_id) {
      const groupRes = await query(`SELECT id FROM farmer_groups WHERE id=$1 AND status='active'`, [group_id]);
      if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    }
    const result = await query(
      `UPDATE farmers SET group_id=$1 WHERE user_id=$2 RETURNING *`,
      [group_id || null, req.params.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Farmer profile not found.' });
    res.json({ success: true, farmer: result.rows[0] });
  } catch (err) {
    console.error('Assign group error:', err.message);
    res.status(500).json({ error: 'Failed to update group affiliation.' });
  }
});

// GET /api/groups/:id/summary?product= - aggregate active listings for a group
// e.g. { product: 'Maize', total_quantity: 340, unit: 'bags', farmer_count: 12 }
router.get('/:id/summary', async (req, res) => {
  try {
    const { product } = req.query;
    const conditions = [`l.group_id = $1`, `l.status = 'active'`, `l.expires_at > NOW()`];
    const params = [req.params.id];
    if (product) { params.push(product); conditions.push(`LOWER(l.product) = LOWER($${params.length})`); }

    const result = await query(
      `SELECT l.product, l.unit,
              SUM(l.quantity) AS total_quantity,
              COUNT(DISTINCT l.farmer_id) AS farmer_count,
              COUNT(*) AS listing_count
       FROM listings l
       WHERE ${conditions.join(' AND ')}
       GROUP BY l.product, l.unit
       ORDER BY total_quantity DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Group summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch group summary.' });
  }
});

module.exports = router;
