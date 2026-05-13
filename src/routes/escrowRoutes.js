const express    = require('express');
const router     = express.Router();
const { query }  = require('../db/pool');
const COMMISSION = require('../config/commission');

function genCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// POST /api/escrow/calculate
router.post('/calculate', (req, res) => {
  const { amount, category } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ error: 'amount is required and must be > 0' });
  const cat    = COMMISSION.getCategory(category);
  const result = COMMISSION.calculate(parseFloat(amount), cat);
  res.json({ success: true, category: cat, commission: result });
});

// POST /api/escrow/initiate
router.post('/initiate', async (req, res) => {
  const {
    buyer_id, seller_id, listing_id, listing_type,
    item_description, category, quantity, unit, listing_price, payment_method
  } = req.body;

  if (!buyer_id || !seller_id || !listing_price)
    return res.status(400).json({ error: 'buyer_id, seller_id and listing_price are required' });

  try {
    const cat  = COMMISSION.getCategory(category);
    const c    = COMMISSION.calculate(parseFloat(listing_price), cat);
    const code = genCode();

    const txRes = await query(`
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
        buyer_id, seller_id, listing_id || null, listing_type || 'produce',
        item_description || null, cat, quantity || 1, unit || 'kg',
        c.listing_price, c.buyer_rate, c.seller_rate,
        c.buyer_fee, c.seller_fee,
        c.buyer_pays, c.seller_receives, c.sokoleo_earns,
        payment_method || 'M-PESA Escrow'
      ]
    );
    const tx = txRes.rows[0];

    await query(`
      INSERT INTO escrow (transaction_id, amount_held, release_to_seller, release_to_sokoleo, status, confirmation_code, held_at)
      VALUES ($1,$2,$3,$4,'holding',$5,NOW())`,
      [tx.id, c.buyer_pays, c.seller_receives, c.sokoleo_earns, code]
    );

    res.status(201).json({
      success: true,
      transaction: tx,
      commission: c,
      confirmation_code: code,
      message: `Buyer should pay KES ${c.buyer_pays.toLocaleString()} to SokoLeo escrow`,
    });
  } catch (err) {
    console.error('Escrow initiate error:', err.message);
    res.status(500).json({ error: 'Failed to initiate escrow' });
  }
});

// PATCH /api/escrow/:txId/mark-paid
router.patch('/:txId/mark-paid', async (req, res) => {
  const { mpesa_ref } = req.body;
  try {
    const r = await query(`
      UPDATE transactions SET status='in_escrow', mpesa_ref=$1, paid_at=NOW()
      WHERE id=$2 AND status='pending' RETURNING *`,
      [mpesa_ref || null, req.params.txId]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'Transaction not found or already processed' });
    res.json({ success: true, transaction: r.rows[0], message: 'Payment confirmed. Funds held in escrow.' });
  } catch (err) {
    console.error('Mark-paid error:', err.message);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// PATCH /api/escrow/:txId/confirm-handover
router.patch('/:txId/confirm-handover', async (req, res) => {
  const { confirmed_by, confirmation_code } = req.body;
  try {
    const escRes = await query(
      `SELECT * FROM escrow WHERE transaction_id=$1 AND status='holding'`,
      [req.params.txId]
    );
    if (!escRes.rows.length)
      return res.status(404).json({ error: 'Escrow record not found or already released' });

    const esc = escRes.rows[0];
    if (confirmation_code && esc.confirmation_code !== confirmation_code)
      return res.status(400).json({ error: 'Invalid confirmation code' });

    await query(
      `UPDATE escrow SET status='released', handover_confirmed_by=$1, released_at=NOW() WHERE id=$2`,
      [confirmed_by || 'buyer', esc.id]
    );

    const txRes = await query(
      `UPDATE transactions SET status='confirmed', confirmed_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.txId]
    );
    const t = txRes.rows[0];

    await query(`
      INSERT INTO commission_ledger (transaction_id, amount, source, category, description)
      VALUES ($1,$2,'buyer_fee',$3,$4),
             ($1,$5,'seller_fee',$3,$6)`,
      [
        t.id, t.buyer_fee_amount, t.category,
        `Buyer commission on ${t.item_description || 'transaction'}`,
        t.seller_fee_amount,
        `Seller commission on ${t.item_description || 'transaction'}`
      ]
    );

    await query(
      `INSERT INTO payouts (transaction_id, seller_id, amount, status) VALUES ($1,$2,$3,'pending')`,
      [t.id, t.seller_id, t.seller_receives]
    );

    res.json({
      success: true,
      transaction: t,
      seller_payout: t.seller_receives,
      sokoleo_kept: t.sokoleo_commission,
      message: `KES ${Number(t.seller_receives).toLocaleString()} queued for payout to seller. SokoLeo earned KES ${Number(t.sokoleo_commission).toLocaleString()}.`,
    });
  } catch (err) {
    console.error('Confirm handover error:', err.message);
    res.status(500).json({ error: 'Failed to confirm handover' });
  }
});

// PATCH /api/escrow/:txId/dispute
router.patch('/:txId/dispute', async (req, res) => {
  const { reason } = req.body;
  try {
    const r = await query(
      `UPDATE transactions SET status='disputed' WHERE id=$1 AND status='in_escrow' RETURNING *`,
      [req.params.txId]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'Transaction not found or cannot be disputed' });
    res.json({ success: true, transaction: r.rows[0], message: 'Dispute raised. Admin will review within 24 hours.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to raise dispute' });
  }
});

// GET /api/escrow/buyer/:buyerId
router.get('/buyer/:buyerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, u.name AS seller_name, u.phone AS seller_phone
      FROM transactions t
      JOIN users u ON t.seller_id = u.id
      WHERE t.buyer_id=$1
      ORDER BY t.created_at DESC`,
      [req.params.buyerId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch transactions' }); }
});

// GET /api/escrow/seller/:sellerId
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, u.name AS buyer_name, u.phone AS buyer_phone
      FROM transactions t
      JOIN users u ON t.buyer_id = u.id
      WHERE t.seller_id=$1
      ORDER BY t.created_at DESC`,
      [req.params.sellerId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch transactions' }); }
});

// GET /api/escrow/admin/summary
router.get('/admin/summary', async (req, res) => {
  try {
    const [totals, byCategory, recent, pendingPayouts] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                      AS total_transactions,
          COUNT(*) FILTER (WHERE status='confirmed')    AS completed,
          COUNT(*) FILTER (WHERE status='in_escrow')    AS in_escrow,
          COUNT(*) FILTER (WHERE status='pending')      AS pending_payment,
          COUNT(*) FILTER (WHERE status='disputed')     AS disputed,
          COALESCE(SUM(sokoleo_commission) FILTER (WHERE status='confirmed'),0)  AS total_earned,
          COALESCE(SUM(sokoleo_commission) FILTER (WHERE status='in_escrow'),0)  AS in_escrow_amount,
          COALESCE(SUM(listing_price)      FILTER (WHERE status='confirmed'),0)  AS total_gmv
        FROM transactions`),
      query(`
        SELECT category,
          COUNT(*)                                    AS deals,
          COALESCE(SUM(sokoleo_commission),0)         AS earned,
          COALESCE(SUM(listing_price),0)             AS gmv
        FROM transactions WHERE status='confirmed'
        GROUP BY category ORDER BY earned DESC`),
      query(`
        SELECT t.*, b.name AS buyer_name, s.name AS seller_name
        FROM transactions t
        LEFT JOIN users b ON t.buyer_id=b.id
        LEFT JOIN users s ON t.seller_id=s.id
        ORDER BY t.created_at DESC LIMIT 10`),
      query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM payouts WHERE status='pending'`),
    ]);
    res.json({
      totals: totals.rows[0],
      by_category: byCategory.rows,
      recent_transactions: recent.rows,
      pending_payouts: pendingPayouts.rows[0],
    });
  } catch (err) {
    console.error('Admin escrow summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch escrow summary' });
  }
});

module.exports = router;
