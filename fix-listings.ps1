# Fix listingRoutes.js
Write-Host "Fixing listingRoutes.js..." -ForegroundColor Yellow

$content = @'
const express = require('express');
const router = express.Router();
const db = require('../db/client');

router.get('/', async (req, res) => {
  const { product, location, availability, page=1, limit=20 } = req.query;
  const offset = (parseInt(page)-1)*parseInt(limit);
  try {
    let conds = ["l.status='active'"], params=[], i=1;
    if (product) { conds.push(`LOWER(l.product) LIKE LOWER($${i++})`); params.push('%'+product+'%'); }
    if (location) { conds.push(`LOWER(l.location) LIKE LOWER($${i++})`); params.push('%'+location+'%'); }
    if (availability) { conds.push(`l.availability=$${i++}`); params.push(availability); }
    params.push(parseInt(limit), offset);
    const sql = `SELECT l.*,u.name as farmer_name,u.phone as farmer_phone,u.location as farmer_location FROM listings l JOIN users u ON l.farmer_id=u.id WHERE ${conds.join(' AND ')} ORDER BY l.created_at DESC LIMIT $${i++} OFFSET $${i}`;
    const r = await db.query(sql, params);
    res.json({ listings: r.rows, page: parseInt(page), count: r.rows.length });
  } catch(e) {
    console.error('List error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT l.*,u.name as farmer_name,u.phone as farmer_phone FROM listings l JOIN users u ON l.farmer_id=u.id WHERE l.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { farmer_phone, product, quantity, unit, price_per_unit, location, availability, description } = req.body;
  if (!farmer_phone||!product||!quantity||!location||!availability) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    // Find farmer by phone
    const u = await db.query('SELECT id FROM users WHERE phone=$1', [farmer_phone]);
    if (!u.rows.length) return res.status(404).json({ error: 'Farmer not found. Phone: ' + farmer_phone });
    
    const farmerId = u.rows[0].id;
    
    // Check what columns exist in listings table
    const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='listings'");
    const colNames = cols.rows.map(r => r.column_name);
    console.log('Listings columns:', colNames.join(', '));
    
    // Build insert based on available columns
    const hasUnit = colNames.includes('unit');
    const hasPrice = colNames.includes('price_per_unit');
    const hasDesc = colNames.includes('description');
    const hasExpires = colNames.includes('expires_at');
    
    let sql, values;
    if (hasUnit && hasPrice && hasDesc) {
      sql = 'INSERT INTO listings (farmer_id,product,quantity,unit,price_per_unit,location,availability,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *';
      values = [farmerId, product, quantity, unit||'bags', price_per_unit||null, location, availability, description||null];
    } else {
      sql = 'INSERT INTO listings (farmer_id,product,quantity,location,availability) VALUES ($1,$2,$3,$4,$5) RETURNING *';
      values = [farmerId, product, quantity, location, availability];
    }
    
    const l = await db.query(sql, values);
    res.status(201).json({ message: 'Listing created.', listing: l.rows[0] });
  } catch(e) {
    console.error('Create listing error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const r = await db.query('UPDATE listings SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
'@

[System.IO.File]::WriteAllText("$PWD\src\routes\listingRoutes.js", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "listingRoutes.js fixed!" -ForegroundColor Green
Write-Host "Restart server: npm run dev" -ForegroundColor Cyan
