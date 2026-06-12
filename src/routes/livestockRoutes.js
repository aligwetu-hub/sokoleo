const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');
const { sendSMS } = require('../services/smsService');

// GET /api/livestock — browse listings (traders/public)
router.get('/', async (req, res) => {
  const { farmer_id, animal_type, status, location } = req.query;
  try {
    let sql = `
      SELECT l.*, u.name AS farmer_name, u.phone AS farmer_phone, u.location AS farmer_location
      FROM livestock_listings l
      JOIN users u ON l.farmer_id = u.id
      WHERE 1=1`;
    const params = [];
    if (farmer_id)   { params.push(farmer_id);   sql += ` AND l.farmer_id=$${params.length}`; }
    if (animal_type) { params.push(animal_type);  sql += ` AND l.animal_type ILIKE $${params.length}`; }
    if (status)      { params.push(status);        sql += ` AND l.status=$${params.length}`; }
    else             { sql += ` AND l.status='active'`; }
    if (location)    { params.push(`%${location}%`); sql += ` AND l.location ILIKE $${params.length}`; }
    sql += ` ORDER BY l.created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('List livestock error:', err.message);
    res.status(500).json({ error: 'Failed to fetch livestock listings' });
  }
});

// GET /api/livestock/:id — single listing
router.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT l.*, u.name AS farmer_name, u.phone AS farmer_phone
      FROM livestock_listings l JOIN users u ON l.farmer_id=u.id
      WHERE l.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Listing not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch listing' }); }
});

// POST /api/livestock — farmer creates a listing
router.post('/', async (req, res) => {
  const {
    farmer_id, animal_type, breed, quantity, age_months, weight_kg,
    price_per_head, location, health_status, vaccinated, description, images, photo_url
  } = req.body;

  if (!farmer_id || !animal_type || !quantity || !price_per_head || !location)
    return res.status(400).json({ error: 'farmer_id, animal_type, quantity, price_per_head and location are required' });
  if (!photo_url)
    return res.status(400).json({ error: 'A photo is required for livestock listings.' });

  try {
    const r = await query(`
      INSERT INTO livestock_listings
        (farmer_id, animal_type, breed, quantity, age_months, weight_kg,
         price_per_head, location, health_status, vaccinated, description, images, photo_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        farmer_id, animal_type, breed || null, parseInt(quantity),
        age_months ? parseInt(age_months) : null,
        weight_kg ? parseFloat(weight_kg) : null,
        parseFloat(price_per_head), location,
        health_status || 'healthy', vaccinated === true || vaccinated === 'true',
        description || null, images || null, photo_url
      ]
    );
    const listing = r.rows[0];

    // Notify farmer
    const farmer = await query('SELECT phone FROM users WHERE id=$1', [farmer_id]);
    if (farmer.rows[0]) {
      await sendSMS(
        farmer.rows[0].phone,
        `SokoLeo: Your ${animal_type} listing (${quantity} head @ KES ${Number(price_per_head).toLocaleString()}/head) is now live. Traders can find it on the marketplace.`
      );
    }

    res.status(201).json({ success: true, listing });
  } catch (err) {
    console.error('Create livestock error:', err.message);
    res.status(500).json({ error: 'Failed to create livestock listing' });
  }
});

// PATCH /api/livestock/:id — update status or details
router.patch('/:id', async (req, res) => {
  const { status, price_per_head, quantity, description } = req.body;
  try {
    const fields = []; const params = [];
    if (status)        { params.push(status);       fields.push(`status=$${params.length}`); }
    if (price_per_head){ params.push(parseFloat(price_per_head)); fields.push(`price_per_head=$${params.length}`); }
    if (quantity)      { params.push(parseInt(quantity)); fields.push(`quantity=$${params.length}`); }
    if (description !== undefined) { params.push(description); fields.push(`description=$${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const r = await query(`UPDATE livestock_listings SET ${fields.join(',')} WHERE id=$${params.length} RETURNING *`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Listing not found' });
    res.json({ success: true, listing: r.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Failed to update listing' }); }
});

// DELETE /api/livestock/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM livestock_listings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete listing' }); }
});

module.exports = router;
