const express = require('express');
const router = express.Router();
const db = require('../db/client');
const { sendSMS } = require('../services/smsService');

router.get('/stats', async (req, res) => {
  try {
    const [farmers, traders, listings, reservations, payments, crops, pending] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE role='farmer'"),
      db.query("SELECT COUNT(*) FROM users WHERE role='trader'"),
      db.query("SELECT COUNT(*) FROM listings WHERE status='active'"),
      db.query("SELECT COUNT(*) FROM reservations"),
      db.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'"),
      db.query("SELECT product, COUNT(*) as count FROM listings GROUP BY product ORDER BY count DESC LIMIT 5"),
      db.query("SELECT COUNT(*) FROM users WHERE (role='farmer' OR role='trader') AND (is_verified IS NULL OR is_verified=FALSE)"),
    ]);
    res.json({
      farmers: parseInt(farmers.rows[0].count),
      traders: parseInt(traders.rows[0].count),
      active_listings: parseInt(listings.rows[0].count),
      total_reservations: parseInt(reservations.rows[0].count),
      total_revenue_kes: parseFloat(payments.rows[0].total),
      top_crops: crops.rows,
      pending_verification: parseInt(pending.rows[0].count),
    });
  } catch(e) { console.error('Stats error:', e.message); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/users', async (req, res) => {
  try {
    const { role, verified } = req.query;
    let conditions = [];
    const params = [];
    let i = 1;
    if (role) { conditions.push(`role=$${i++}`); params.push(role); }
    if (verified === 'false') { conditions.push(`(is_verified IS NULL OR is_verified=FALSE)`); }
    if (verified === 'true') { conditions.push(`is_verified=TRUE`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await db.query(
      `SELECT id,name,phone,role,location,national_id,is_verified,verification_note,created_at FROM users ${where} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json(r.rows);
  } catch(e) { console.error('Users error:', e.message); res.status(500).json({ error: 'Failed: ' + e.message }); }
});

// Verify user - admin approves
router.patch('/users/:id/verify', async (req, res) => {
  const { note } = req.body;
  try {
    await db.query('UPDATE users SET is_verified=TRUE, verification_note=$1 WHERE id=$2', [note||'Verified by admin', req.params.id]);
    // Notify user
    const u = await db.query('SELECT phone, name, role FROM users WHERE id=$1', [req.params.id]);
    if (u.rows.length) {
      const user = u.rows[0];
      await sendSMS(user.phone, `SokoLeo: Hi ${user.name}! Your account has been verified. You can now ${user.role === 'farmer' ? 'list produce' : 'make reservations'}. Dial *789# to get started!`);
    }
    res.json({ message: 'User verified and notified.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Reject user
router.patch('/users/:id/reject', async (req, res) => {
  const { reason } = req.body;
  try {
    await db.query('UPDATE users SET is_verified=FALSE, verification_note=$1 WHERE id=$2', [reason||'Rejected by admin', req.params.id]);
    const u = await db.query('SELECT phone, name FROM users WHERE id=$1', [req.params.id]);
    if (u.rows.length) {
      await sendSMS(u.rows[0].phone, `SokoLeo: Hi ${u.rows[0].name}, your account verification was unsuccessful. Reason: ${reason||'ID could not be confirmed'}. Please contact support.`);
    }
    res.json({ message: 'User rejected and notified.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deactivated.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/listings', async (req, res) => {
  try {
    const r = await db.query('SELECT l.id,l.product,l.quantity,l.location,l.availability,l.status,l.created_at,u.name as farmer_name,u.phone as farmer_phone,u.is_verified as farmer_verified FROM listings l JOIN users u ON l.farmer_id=u.id ORDER BY l.created_at DESC LIMIT 100');
    res.json(r.rows);
  } catch(e) { console.error('Listings error:', e.message); res.status(500).json({ error: 'Failed: ' + e.message }); }
});

module.exports = router;