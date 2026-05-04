# Fix adminRoutes.js - rewrite users query
Write-Host "Fixing adminRoutes.js..." -ForegroundColor Yellow

$content = @'
const express = require('express');
const router = express.Router();
const db = require('../db/client');

router.get('/stats', async (req, res) => {
  try {
    const [farmers, traders, listings, reservations, payments, crops] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE role='farmer'"),
      db.query("SELECT COUNT(*) FROM users WHERE role='trader'"),
      db.query("SELECT COUNT(*) FROM listings WHERE status='active'"),
      db.query("SELECT COUNT(*) FROM reservations"),
      db.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'"),
      db.query("SELECT product, COUNT(*) as count FROM listings GROUP BY product ORDER BY count DESC LIMIT 5"),
    ]);
    res.json({
      farmers: parseInt(farmers.rows[0].count),
      traders: parseInt(traders.rows[0].count),
      active_listings: parseInt(listings.rows[0].count),
      total_reservations: parseInt(reservations.rows[0].count),
      total_revenue_kes: parseFloat(payments.rows[0].total),
      top_crops: crops.rows,
    });
  } catch(e) {
    console.error('Stats error:', e.message);
    res.status(500).json({ error: 'Failed.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const role = req.query.role;
    let sql = 'SELECT id, name, phone, role, location, is_verified, created_at FROM users';
    const params = [];
    if (role) {
      sql += ' WHERE role=$1';
      params.push(role);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch(e) {
    console.error('Users error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

router.patch('/users/:id/verify', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_verified=TRUE WHERE id=$1', [req.params.id]);
    res.json({ message: 'User verified.' });
  } catch(e) {
    res.status(500).json({ error: 'Failed.' });
  }
});

router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deactivated.' });
  } catch(e) {
    res.status(500).json({ error: 'Failed.' });
  }
});

router.get('/listings', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT l.id, l.product, l.quantity, l.unit, l.location, l.availability, l.status, l.created_at, u.name as farmer_name, u.phone as farmer_phone FROM listings l JOIN users u ON l.farmer_id=u.id ORDER BY l.created_at DESC LIMIT 100'
    );
    res.json(r.rows);
  } catch(e) {
    console.error('Listings error:', e.message);
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

module.exports = router;
'@

[System.IO.File]::WriteAllText("$PWD\src\routes\adminRoutes.js", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "adminRoutes.js fixed!" -ForegroundColor Green
Write-Host "Restart server: npm run dev" -ForegroundColor Cyan
