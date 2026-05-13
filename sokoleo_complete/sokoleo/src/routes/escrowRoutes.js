// src/routes/escrowRoutes.js
const express    = require('express');
const router     = express.Router();
const COMMISSION = require('../config/commission');
let db;
const paths = ['../db/client','../db','../config/db'];
for(const p of paths){ try{ db = require(p); break; }catch(e){} }

// ── HELPER: generate 6-digit confirmation code ─────────────────────────────
function genCode(){ return Math.floor(100000 + Math.random()*900000).toString(); }

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/escrow/calculate
// Preview commission before creating a transaction
// Body: { amount, category }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/calculate', (req, res) => {
  const { amount, category } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).json({ error: 'Amount is required' });
  const cat    = COMMISSION.getCategory(category || '');
  const result = COMMISSION.calculate(parseFloat(amount), cat);
  res.json({ success: true, commission: result, category: cat });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/escrow/initiate
// Create a new transaction and put it in escrow
// Body: { buyer_id, seller_id, listing_id, listing_type, item_description,
//         category, quantity, unit, listing_price, payment_method }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/initiate', async (req, res) => {
  const {
    buyer_id, seller_id, listing_id, listing_type,
    item_description, category, quantity, unit, listing_price, payment_method
  } = req.body;

  if (!buyer_id || !seller_id || !listing_price)
    return res.status(400).json({ error: 'buyer_id, seller_id and listing_price are required' });

  try {
    const cat    = COMMISSION.getCategory(category || '');
    const c      = COMMISSION.calculate(parseFloat(listing_price), cat);
    const code   = genCode();

    // Create transaction
    const txResult = await db.query(`
      INSERT INTO transactions (
        buyer_id, seller_id, listing_id, listing_type, item_description,
        category, quantity, unit,
        listing_price, buyer_fee_rate, seller_fee_rate,
        buyer_fee_amount, seller_fee_amount,
        buyer_pays, seller_receives, sokoleo_commission,
        payment_method, status, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15,$16,
        $17,'pending',NOW()
      ) RETURNING *`,
      [
        buyer_id, seller_id, listing_id||null, listing_type||'produce',
        item_description||null, cat, quantity||1, unit||'kg',
        c.listing_price, c.buyer_rate, c.seller_rate,
        c.buyer_fee, c.seller_fee,
        c.buyer_pays, c.seller_receives, c.sokoleo_earns,
        payment_method||'M-PESA Escrow'
      ]
    );
    const tx = txResult.rows[0];

    // Create escrow record
    await db.query(`
      INSERT INTO escrow (
        transaction_id, amount_held, release_to_seller,
        release_to_sokoleo, status, confirmation_code, held_at
      ) VALUES ($1,$2,$3,$4,'holding',$5,NOW())`,
      [tx.id, c.buyer_pays, c.seller_receives, c.sokoleo_earns, code]
    );

    res.status(201).json({
      success:      true,
      transaction:  tx,
      commission:   c,
      confirmation_code: code,
      message: `Buyer should pay KES ${c.buyer_pays.toLocaleString()} to SokoLeo escrow`
    });
  } catch(err) {
    console.error('Escrow initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/escrow/:txId/mark-paid
// Mark that buyer has paid into escrow (after M-PESA confirmation)
// Body: { mpesa_ref }
// ══════════════════════════════════════════════════════════════════════════════
router.patch('/:txId/mark-paid', async (req, res) => {
  const { mpesa_ref } = req.body;
  try {
    const r = await db.query(`
      UPDATE transactions SET status='in_escrow', mpesa_ref=$1, paid_at=NOW()
      WHERE id=$2 AND status='pending' RETURNING *`,
      [mpesa_ref||null, req.params.txId]
    );
    if(!r.rows.length)
      return res.status(404).json({ error: 'Transaction not found or already paid' });
    res.json({ success: true, transaction: r.rows[0],
      message: 'Payment confirmed. Money held in escrow.' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/escrow/:txId/confirm-handover
// Buyer or seller confirms the goods were handed over
// Body: { confirmed_by, confirmation_code }
// ══════════════════════════════════════════════════════════════════════════════
router.patch('/:txId/confirm-handover', async (req, res) => {
  const { confirmed_by, confirmation_code } = req.body;
  try {
    // Verify escrow code
    const escrow = await db.query(
      `SELECT * FROM escrow WHERE transaction_id=$1 AND status='holding'`,
      [req.params.txId]
    );
    if(!escrow.rows.length)
      return res.status(404).json({ error: 'Escrow record not found' });

    const esc = escrow.rows[0];
    if(confirmation_code && esc.confirmation_code !== confirmation_code)
      return res.status(400).json({ error: 'Invalid confirmation code' });

    // Release escrow
    await db.query(
      `UPDATE escrow SET status='released', handover_confirmed_by=$1, released_at=NOW()
       WHERE id=$2`, [confirmed_by||'buyer', esc.id]
    );

    // Update transaction
    const tx = await db.query(`
      UPDATE transactions SET status='confirmed', confirmed_at=NOW()
      WHERE id=$1 RETURNING *`, [req.params.txId]
    );

    // Record commission in ledger
    const t = tx.rows[0];
    await db.query(`
      INSERT INTO commission_ledger (transaction_id, amount, source, category, description)
      VALUES ($1,$2,'buyer_fee',$3,'Buyer commission on '+$4),
             ($1,$5,'seller_fee',$3,'Seller commission on '+$4)`,
      [t.id, t.buyer_fee_amount, t.category, t.item_description||'transaction',
       t.seller_fee_amount]
    );

    // Create payout record for seller
    await db.query(`
      INSERT INTO payouts (transaction_id, seller_id, amount, status)
      VALUES ($1,$2,$3,'pending')`,
      [t.id, t.seller_id, t.seller_receives]
    );

    res.json({
      success:       true,
      transaction:   t,
      seller_payout: t.seller_receives,
      sokoleo_kept:  t.sokoleo_commission,
      message:       `KES ${t.seller_receives.toLocaleString()} will be sent to seller. SokoLeo earned KES ${t.sokoleo_commission.toLocaleString()}`
    });
  } catch(err) {
    console.error('Confirm handover error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/escrow/buyer/:buyerId — all transactions for a buyer
// ══════════════════════════════════════════════════════════════════════════════
router.get('/buyer/:buyerId', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.*, u.full_name AS seller_name, u.phone AS seller_phone
      FROM transactions t
      JOIN users u ON t.seller_id = u.id
      WHERE t.buyer_id=$1
      ORDER BY t.created_at DESC`, [req.params.buyerId]
    );
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/escrow/seller/:sellerId — all transactions for a seller
// ══════════════════════════════════════════════════════════════════════════════
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT t.*, u.full_name AS buyer_name, u.phone AS buyer_phone
      FROM transactions t
      JOIN users u ON t.buyer_id = u.id
      WHERE t.seller_id=$1
      ORDER BY t.created_at DESC`, [req.params.sellerId]
    );
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/escrow/admin/summary — admin earnings dashboard
// ══════════════════════════════════════════════════════════════════════════════
router.get('/admin/summary', async (req, res) => {
  try {
    const [totals, byCategory, recent, pending] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                    AS total_transactions,
          COUNT(*) FILTER (WHERE status='confirmed')  AS completed,
          COUNT(*) FILTER (WHERE status='in_escrow')  AS in_escrow,
          COUNT(*) FILTER (WHERE status='pending')    AS pending_payment,
          COALESCE(SUM(sokoleo_commission) FILTER (WHERE status='confirmed'),0) AS total_earned,
          COALESCE(SUM(sokoleo_commission) FILTER (WHERE status='in_escrow'),0) AS in_escrow_amount,
          COALESCE(SUM(listing_price) FILTER (WHERE status='confirmed'),0)      AS total_gmv,
          COALESCE(AVG(sokoleo_commission) FILTER (WHERE status='confirmed'),0) AS avg_commission
        FROM transactions`),

      db.query(`
        SELECT category,
          COUNT(*) AS deals,
          COALESCE(SUM(sokoleo_commission),0) AS earned,
          COALESCE(SUM(listing_price),0)      AS gmv
        FROM transactions WHERE status='confirmed'
        GROUP BY category ORDER BY earned DESC`),

      db.query(`
        SELECT t.*,
          b.full_name AS buyer_name, s.full_name AS seller_name
        FROM transactions t
        LEFT JOIN users b ON t.buyer_id=b.id
        LEFT JOIN users s ON t.seller_id=s.id
        ORDER BY t.created_at DESC LIMIT 10`),

      db.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
        FROM payouts WHERE status='pending'`),
    ]);

    res.json({
      totals:          totals.rows[0],
      by_category:     byCategory.rows,
      recent_transactions: recent.rows,
      pending_payouts: pending.rows[0],
    });
  } catch(err) {
    console.error('Admin summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/v1/escrow/:txId/dispute — raise a dispute
// ══════════════════════════════════════════════════════════════════════════════
router.patch('/:txId/dispute', async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE transactions SET status='disputed' WHERE id=$1 RETURNING *`,
      [req.params.txId]
    );
    res.json({ success: true, transaction: r.rows[0],
      message: 'Dispute raised. Admin will review within 24 hours.' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
