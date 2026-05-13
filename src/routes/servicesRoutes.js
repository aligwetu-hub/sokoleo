const express = require('express');
const router  = express.Router();
const { query } = require('../db/pool');

// GET /api/services — browse farm services directory
router.get('/', async (req, res) => {
  const { service_type, location, q, status } = req.query;
  try {
    let sql = `
      SELECT s.*, u.name AS provider_name, u.phone AS provider_phone
      FROM farm_services s
      JOIN users u ON s.provider_id = u.id
      WHERE 1=1`;
    const params = [];
    if (status)       { params.push(status);        sql += ` AND s.status=$${params.length}`; }
    else              { sql += ` AND s.status='active'`; }
    if (service_type) { params.push(service_type);  sql += ` AND s.service_type ILIKE $${params.length}`; }
    if (location)     { params.push(`%${location}%`); sql += ` AND s.location ILIKE $${params.length}`; }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (s.service_name ILIKE $${params.length} OR s.description ILIKE $${params.length} OR s.service_type ILIKE $${params.length})`;
    }
    sql += ` ORDER BY s.is_verified DESC, s.rating DESC, s.created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('List services error:', err.message);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// GET /api/services/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT s.*, u.name AS provider_name, u.phone AS provider_phone
      FROM farm_services s JOIN users u ON s.provider_id=u.id
      WHERE s.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Service not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch service' }); }
});

// POST /api/services — register a new service
router.post('/', async (req, res) => {
  const {
    provider_id, service_type, service_name, description,
    price_range, location, coverage_radius_km, contact_phone, available_days
  } = req.body;

  if (!provider_id || !service_type || !service_name || !location)
    return res.status(400).json({ error: 'provider_id, service_type, service_name and location are required' });

  try {
    const r = await query(`
      INSERT INTO farm_services
        (provider_id, service_type, service_name, description, price_range,
         location, coverage_radius_km, contact_phone, available_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        provider_id, service_type, service_name,
        description || null, price_range || null,
        location, coverage_radius_km ? parseInt(coverage_radius_km) : 20,
        contact_phone || null,
        available_days || null
      ]
    );
    res.status(201).json({ success: true, service: r.rows[0] });
  } catch (err) {
    console.error('Create service error:', err.message);
    res.status(500).json({ error: 'Failed to register service' });
  }
});

// PATCH /api/services/:id/verify — admin verifies a service
router.patch('/:id/verify', async (req, res) => {
  try {
    const r = await query(
      `UPDATE farm_services SET is_verified=TRUE WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true, service: r.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Failed to verify service' }); }
});

// PATCH /api/services/:id — update service details
router.patch('/:id', async (req, res) => {
  const { service_name, description, price_range, status, contact_phone, coverage_radius_km } = req.body;
  try {
    const fields = []; const params = [];
    if (service_name)    { params.push(service_name);   fields.push(`service_name=$${params.length}`); }
    if (description !== undefined) { params.push(description); fields.push(`description=$${params.length}`); }
    if (price_range)     { params.push(price_range);    fields.push(`price_range=$${params.length}`); }
    if (status)          { params.push(status);          fields.push(`status=$${params.length}`); }
    if (contact_phone)   { params.push(contact_phone);  fields.push(`contact_phone=$${params.length}`); }
    if (coverage_radius_km) { params.push(parseInt(coverage_radius_km)); fields.push(`coverage_radius_km=$${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const r = await query(`UPDATE farm_services SET ${fields.join(',')} WHERE id=$${params.length} RETURNING *`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true, service: r.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Failed to update service' }); }
});

// DELETE /api/services/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM farm_services WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete service' }); }
});

// GET /api/services/types/list — available service categories
router.get('/types/list', (req, res) => {
  res.json([
    { value: 'vet',       label: 'Veterinary Services' },
    { value: 'agronomy',  label: 'Agronomy / Extension' },
    { value: 'transport', label: 'Transport & Logistics' },
    { value: 'equipment', label: 'Equipment Hire' },
    { value: 'irrigation',label: 'Irrigation Services' },
    { value: 'storage',   label: 'Storage / Warehousing' },
    { value: 'input',     label: 'Farm Inputs Supply' },
    { value: 'finance',   label: 'Agricultural Finance' },
    { value: 'other',     label: 'Other' },
  ]);
});

module.exports = router;
