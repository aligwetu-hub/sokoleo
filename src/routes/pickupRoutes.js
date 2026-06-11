const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { sendSMS } = require('../services/smsService');

function generateDealCode() {
  return 'SK-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function addHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// POST /api/pickup/points/register
router.post('/points/register', async (req, res) => {
  const { name, owner_name, owner_phone, owner_id_number, county, town, physical_address } = req.body;
  if (!name || !owner_name || !owner_phone || !county || !town)
    return res.status(400).json({ error: 'name, owner_name, owner_phone, county, and town are required.' });
  try {
    const result = await query(
      `INSERT INTO pickup_points (name, owner_name, owner_phone, owner_id_number, county, town, physical_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, owner_name, owner_phone, owner_id_number || null, county, town, physical_address || null]
    );
    res.json({ success: true, pickup_point: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickup/points?county=&town=
router.get('/points', async (req, res) => {
  try {
    const { county, town } = req.query;
    const conditions = [`status='active'`];
    const params = [];
    if (county) { params.push(county); conditions.push(`county=$${params.length}`); }
    if (town)   { params.push(town);   conditions.push(`town=$${params.length}`); }
    const result = await query(
      `SELECT * FROM pickup_points WHERE ${conditions.join(' AND ')} ORDER BY rating DESC, total_transactions DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/initiate
router.post('/initiate', async (req, res) => {
  const {
    escrow_id, transaction_id, farmer_id, trader_id,
    pickup_point_id, produce_name, quantity, unit, agreed_price, total_amount,
  } = req.body;
  if (!farmer_id || !trader_id || !pickup_point_id || !produce_name)
    return res.status(400).json({ error: 'farmer_id, trader_id, pickup_point_id, and produce_name are required.' });

  try {
    const deal_code = generateDealCode();
    const drop_pin = generatePIN();
    const collection_pin = generatePIN();
    const drop_pin_expires_at = addHours(48);
    const collection_pin_expires_at = addHours(96);
    const auto_release_at = addHours(120);

    const [farmerRes, traderRes, pointRes] = await Promise.all([
      query(`SELECT name, phone FROM users WHERE id=$1`, [farmer_id]),
      query(`SELECT name, phone FROM users WHERE id=$1`, [trader_id]),
      query(`SELECT * FROM pickup_points WHERE id=$1`, [pickup_point_id]),
    ]);

    if (!farmerRes.rows.length) return res.status(404).json({ error: 'Farmer not found.' });
    if (!traderRes.rows.length) return res.status(404).json({ error: 'Trader not found.' });
    if (!pointRes.rows.length)  return res.status(404).json({ error: 'Pickup point not found.' });

    const f = farmerRes.rows[0];
    const t = traderRes.rows[0];
    const p = pointRes.rows[0];

    const pickup = await query(
      `INSERT INTO pickup_transactions (
        deal_code, escrow_id, transaction_id, farmer_id, trader_id,
        pickup_point_id, produce_name, quantity, unit, agreed_price,
        total_amount, drop_pin, drop_pin_expires_at, collection_pin,
        collection_pin_expires_at, auto_release_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending_drop')
       RETURNING *`,
      [
        deal_code, escrow_id || null, transaction_id || null, farmer_id, trader_id,
        pickup_point_id, produce_name, quantity || null, unit || 'kg', agreed_price || null,
        total_amount || null, drop_pin, drop_pin_expires_at, collection_pin,
        collection_pin_expires_at, auto_release_at,
      ]
    );

    // SMS to farmer with Drop PIN
    try {
      await sendSMS(f.phone,
        `SokoLeo Deal ${deal_code}\n` +
        `Wasilisha: ${produce_name} ${quantity || ''}${unit || 'kg'}\n` +
        `Mahali: ${p.name}, ${p.town}\n` +
        `Kwa: ${p.owner_name} (${p.owner_phone})\n` +
        `DROP PIN yako: ${drop_pin}\n` +
        `Toa PIN hii kwa duka baada ya kutoa bidhaa.\n` +
        `PIN inaisha: masaa 48. Soko Kila Siku!`
      );
    } catch (smsErr) { console.error('SMS to farmer failed:', smsErr.message); }

    // SMS to trader with Collection PIN
    try {
      await sendSMS(t.phone,
        `SokoLeo Deal ${deal_code}\n` +
        `Kuchukua: ${produce_name} ${quantity || ''}${unit || 'kg'}\n` +
        `Mahali: ${p.name}, ${p.town}, ${p.county}\n` +
        `Anwani: ${p.physical_address || p.town}\n` +
        `COLLECTION PIN yako: ${collection_pin}\n` +
        `Toa PIN hii ukifika kuchukua bidhaa.\n` +
        `Kumbuka kuchukua ndani ya masaa 48. Soko Kila Siku!`
      );
    } catch (smsErr) { console.error('SMS to trader failed:', smsErr.message); }

    // SMS to shop owner
    try {
      await sendSMS(p.owner_phone,
        `SokoLeo: Bidhaa inakuja!\n` +
        `Deal: ${deal_code}\n` +
        `Bidhaa: ${produce_name} ${quantity || ''}${unit || 'kg'}\n` +
        `Mkulima: ${f.name}\n` +
        `Mfanyabiashara: ${t.name}\n` +
        `Pokea na uthibitishe DROP PIN.\n` +
        `Maswali? WhatsApp SokoLeo.`
      );
    } catch (smsErr) { console.error('SMS to shop owner failed:', smsErr.message); }

    res.json({
      success: true,
      deal_code,
      pickup_transaction: pickup.rows[0],
      pickup_point: p,
      message: 'PINs sent to farmer and trader via SMS.',
    });
  } catch (err) {
    console.error('Pickup initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/confirm-drop
router.post('/confirm-drop', async (req, res) => {
  const { drop_pin, photo_url, gps_lat, gps_lng, confirmed_by } = req.body;
  if (!drop_pin) return res.status(400).json({ error: 'drop_pin required.' });

  try {
    const result = await query(
      `SELECT pt.*, pp.owner_name, pp.name as point_name,
              u1.name as farmer_name, u1.phone as farmer_phone,
              u2.name as trader_name, u2.phone as trader_phone
       FROM pickup_transactions pt
       JOIN pickup_points pp ON pt.pickup_point_id = pp.id
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.drop_pin=$1 AND pt.status='pending_drop'`,
      [drop_pin]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Invalid PIN or already confirmed.' });

    const pt = result.rows[0];

    if (new Date() > new Date(pt.drop_pin_expires_at))
      return res.status(400).json({ error: 'Drop PIN has expired. Contact SokoLeo admin.' });

    await query(
      `UPDATE pickup_transactions SET
        drop_confirmed_at=NOW(), drop_confirmed_by=$1,
        drop_photo_url=$2, drop_gps_lat=$3, drop_gps_lng=$4,
        status='pending_collection'
       WHERE id=$5`,
      [confirmed_by || 'shop_owner', photo_url || null, gps_lat || null, gps_lng || null, pt.id]
    );

    try {
      await sendSMS(pt.trader_phone,
        `SokoLeo: ${pt.produce_name} iko tayari!\n` +
        `Deal: ${pt.deal_code}\n` +
        `Mahali: ${pt.point_name}\n` +
        `Bidhaa zimepokelewa: ${new Date().toLocaleString('en-KE')}\n` +
        `Kumbuka collection PIN yako ukifika.\n` +
        `Kumbuka kuchukua ndani ya masaa 48!`
      );
    } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

    try {
      await sendSMS(pt.farmer_phone,
        `SokoLeo: Bidhaa zako zimepokewa!\n` +
        `Deal: ${pt.deal_code}\n` +
        `${pt.produce_name} zimewasilishwa salama.\n` +
        `Ukichukua na mfanyabiashara, malipo yatatumwa kwa M-PESA yako. Asante!`
      );
    } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

    res.json({
      success: true,
      message: 'Drop confirmed! Trader notified to collect.',
      deal_code: pt.deal_code,
      produce: pt.produce_name,
      quantity: pt.quantity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/confirm-collection
router.post('/confirm-collection', async (req, res) => {
  const { collection_pin, photo_url, gps_lat, gps_lng } = req.body;
  if (!collection_pin) return res.status(400).json({ error: 'collection_pin required.' });

  try {
    const result = await query(
      `SELECT pt.*,
              u1.name as farmer_name, u1.phone as farmer_phone,
              u2.name as trader_name, u2.phone as trader_phone
       FROM pickup_transactions pt
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.collection_pin=$1 AND pt.status='pending_collection'`,
      [collection_pin]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Invalid PIN or goods not yet dropped.' });

    const pt = result.rows[0];

    if (new Date() > new Date(pt.collection_pin_expires_at))
      return res.status(400).json({ error: 'Collection PIN expired. Contact SokoLeo admin.' });

    const dispute_window_ends = addHours(24);
    await query(
      `UPDATE pickup_transactions SET
        collection_confirmed_at=NOW(), collection_confirmed_by='trader',
        collection_photo_url=$1, collection_gps_lat=$2, collection_gps_lng=$3,
        status='dispute_window', auto_release_at=$4
       WHERE id=$5`,
      [photo_url || null, gps_lat || null, gps_lng || null, dispute_window_ends, pt.id]
    );

    try {
      await sendSMS(pt.farmer_phone,
        `SokoLeo: Bidhaa zimechukuliwa!\n` +
        `Deal: ${pt.deal_code}\n` +
        `${pt.trader_name} amechukua ${pt.produce_name}.\n` +
        `Malipo yatatumwa kwa M-PESA yako baada ya masaa 24 kama hakuna tatizo.\n` +
        `Soko Kila Siku!`
      );
    } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

    try {
      await sendSMS(pt.trader_phone,
        `SokoLeo: Umechukua ${pt.produce_name}!\n` +
        `Deal: ${pt.deal_code}\n` +
        `Una masaa 24 kuripoti tatizo lolote.\n` +
        `Kama hakuna tatizo, malipo yatatumwa kwa mkulima automatically.\n` +
        `Ripoti tatizo: sokoleo.onrender.com/trader.html`
      );
    } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

    res.json({
      success: true,
      message: 'Collection confirmed! 24-hour dispute window started.',
      deal_code: pt.deal_code,
      auto_release_at: dispute_window_ends,
      dispute_window_hours: 24,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/raise-dispute
router.post('/raise-dispute', async (req, res) => {
  const { deal_code, trader_id, reason } = req.body;
  if (!deal_code || !reason)
    return res.status(400).json({ error: 'deal_code and reason required.' });

  try {
    const result = await query(
      `SELECT pt.*,
              u1.name as farmer_name, u1.phone as farmer_phone,
              u2.name as trader_name, u2.phone as trader_phone
       FROM pickup_transactions pt
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.deal_code=$1 AND pt.status='dispute_window'`,
      [deal_code]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Deal not found or dispute window closed.' });

    const pt = result.rows[0];

    await query(
      `UPDATE pickup_transactions SET
        dispute_raised=TRUE, dispute_reason=$1,
        dispute_raised_at=NOW(), dispute_raised_by=$2,
        status='disputed'
       WHERE deal_code=$3`,
      [reason, trader_id || null, deal_code]
    );

    try {
      await sendSMS(pt.farmer_phone,
        `SokoLeo TAHADHARI: ${pt.trader_name} amewasilisha malalamiko!\n` +
        `Deal: ${deal_code}\n` +
        `Sababu: ${reason}\n` +
        `Admin wa SokoLeo atawasiliana nawe ndani ya masaa 48.\n` +
        `Malipo yamezuiwa mpaka tatizo litatatuliwe.`
      );
    } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      try {
        await sendSMS(adminPhone,
          `SokoLeo DISPUTE: Deal ${deal_code}\n` +
          `Trader: ${pt.trader_name}\n` +
          `Mkulima: ${pt.farmer_name}\n` +
          `Bidhaa: ${pt.produce_name} ${pt.quantity}kg\n` +
          `Sababu: ${reason}\n` +
          `Tatua ndani ya masaa 48!`
        );
      } catch (smsErr) { console.error('Admin SMS failed:', smsErr.message); }
    }

    res.json({ success: true, message: 'Dispute raised. Admin will contact both parties within 48 hours.', deal_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/auto-release (called by server scheduler)
router.post('/auto-release', async (req, res) => {
  try {
    const expired = await query(
      `SELECT pt.*, u1.name as farmer_name, u1.phone as farmer_phone
       FROM pickup_transactions pt
       JOIN users u1 ON pt.farmer_id = u1.id
       WHERE pt.status='dispute_window' AND pt.auto_release_at < NOW()`
    );

    let released = 0;
    for (const pt of expired.rows) {
      await query(
        `UPDATE pickup_transactions SET status='completed', escrow_released_at=NOW() WHERE id=$1`,
        [pt.id]
      );
      if (pt.escrow_id) {
        await query(
          `UPDATE escrow SET status='released', released_at=NOW() WHERE id=$1`,
          [pt.escrow_id]
        ).catch(() => {});
      }
      try {
        await sendSMS(pt.farmer_phone,
          `SokoLeo: Malipo yametumwa!\n` +
          `Deal: ${pt.deal_code}\n` +
          `KES ${pt.total_amount} inatumwa kwa M-PESA yako.\n` +
          `Asante kwa kutumia SokoLeo. Soko Kila Siku!`
        );
      } catch (smsErr) { console.error('SMS failed:', smsErr.message); }
      released++;
    }

    res.json({ success: true, released, message: `${released} escrows auto-released.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/resolve-dispute (admin only)
router.post('/resolve-dispute', async (req, res) => {
  const { deal_code, resolution, release_to, admin_id } = req.body;
  if (!deal_code || !resolution || !release_to)
    return res.status(400).json({ error: 'deal_code, resolution, and release_to required.' });
  if (!['farmer', 'trader'].includes(release_to))
    return res.status(400).json({ error: 'release_to must be farmer or trader.' });

  try {
    const result = await query(
      `SELECT pt.*,
              u1.name as farmer_name, u1.phone as farmer_phone,
              u2.name as trader_name, u2.phone as trader_phone
       FROM pickup_transactions pt
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.deal_code=$1 AND pt.status='disputed'`,
      [deal_code]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Disputed deal not found.' });

    const pt = result.rows[0];
    const newStatus = release_to === 'farmer' ? 'completed' : 'refunded';

    await query(
      `UPDATE pickup_transactions SET
        status=$1, dispute_resolved_at=NOW(), dispute_resolution=$2,
        dispute_resolved_by=$3,
        escrow_released_at=CASE WHEN $4='farmer' THEN NOW() ELSE NULL END
       WHERE deal_code=$5`,
      [newStatus, resolution, admin_id || null, release_to, deal_code]
    );

    if (release_to === 'farmer') {
      try {
        await sendSMS(pt.farmer_phone,
          `SokoLeo: Tatizo limetatuliwa!\nDeal: ${deal_code}\n` +
          `Uamuzi: Malipo yatatolewa kwako.\n` +
          `KES ${pt.total_amount} inatumwa kwa M-PESA yako. Asante!`
        );
        await sendSMS(pt.trader_phone,
          `SokoLeo: Tatizo limetatuliwa.\nDeal: ${deal_code}\n` +
          `Uamuzi: Malipo yatatolewa kwa mkulima.\n${resolution}`
        );
      } catch (smsErr) { console.error('SMS failed:', smsErr.message); }
    } else {
      try {
        await sendSMS(pt.trader_phone,
          `SokoLeo: Tatizo limetatuliwa!\nDeal: ${deal_code}\n` +
          `Uamuzi: Pesa itarudishwa kwako.\n` +
          `KES ${pt.total_amount} itarudishwa. Asante!`
        );
        await sendSMS(pt.farmer_phone,
          `SokoLeo: Tatizo limetatuliwa.\nDeal: ${deal_code}\n` +
          `Uamuzi: Pesa itarudishwa kwa trader.\n${resolution}`
        );
      } catch (smsErr) { console.error('SMS failed:', smsErr.message); }
    }

    res.json({ success: true, message: `Dispute resolved. Escrow released to ${release_to}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickup/status/:deal_code
router.get('/status/:deal_code', async (req, res) => {
  try {
    const result = await query(
      `SELECT pt.*, pp.name as point_name, pp.town, pp.county,
              pp.owner_name, pp.owner_phone, pp.physical_address,
              u1.name as farmer_name,
              u2.name as trader_name
       FROM pickup_transactions pt
       JOIN pickup_points pp ON pt.pickup_point_id = pp.id
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.deal_code=$1`,
      [req.params.deal_code]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Deal not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickup/farmer/:farmer_id
router.get('/farmer/:farmer_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT pt.*, pp.name as point_name, pp.town, pp.owner_phone,
              u2.name as trader_name
       FROM pickup_transactions pt
       JOIN pickup_points pp ON pt.pickup_point_id = pp.id
       JOIN users u2 ON pt.trader_id = u2.id
       WHERE pt.farmer_id=$1
       ORDER BY pt.created_at DESC LIMIT 20`,
      [req.params.farmer_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickup/trader/:trader_id
router.get('/trader/:trader_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT pt.*, pp.name as point_name, pp.town, pp.county, pp.physical_address, pp.owner_phone,
              u1.name as farmer_name
       FROM pickup_transactions pt
       JOIN pickup_points pp ON pt.pickup_point_id = pp.id
       JOIN users u1 ON pt.farmer_id = u1.id
       WHERE pt.trader_id=$1
       ORDER BY pt.created_at DESC LIMIT 20`,
      [req.params.trader_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pickup/admin/all
router.get('/admin/all', async (req, res) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const params = [];
    if (status) { params.push(status); conditions.push(`pt.status=$${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(
      `SELECT pt.*, pp.name as point_name, pp.town,
              u1.name as farmer_name, u1.phone as farmer_phone,
              u2.name as trader_name, u2.phone as trader_phone
       FROM pickup_transactions pt
       JOIN pickup_points pp ON pt.pickup_point_id = pp.id
       JOIN users u1 ON pt.farmer_id = u1.id
       JOIN users u2 ON pt.trader_id = u2.id
       ${where}
       ORDER BY pt.created_at DESC LIMIT 50`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pickup/whatsapp-confirm (called from WhatsApp bot)
router.post('/whatsapp-confirm', async (req, res) => {
  const { type, pin } = req.body;

  if (type === 'drop') {
    try {
      const result = await query(
        `SELECT pt.*,
                u1.name as farmer_name,
                u2.name as trader_name, u2.phone as trader_phone
         FROM pickup_transactions pt
         JOIN users u1 ON pt.farmer_id = u1.id
         JOIN users u2 ON pt.trader_id = u2.id
         WHERE pt.drop_pin=$1 AND pt.status='pending_drop'`,
        [pin]
      );
      if (!result.rows.length)
        return res.json({ success: false, message: 'PIN batili au tayari imetumika.' });

      const pt = result.rows[0];
      if (new Date() > new Date(pt.drop_pin_expires_at))
        return res.json({ success: false, message: 'PIN imeisha muda. Wasiliana na SokoLeo admin.' });

      await query(
        `UPDATE pickup_transactions SET drop_confirmed_at=NOW(), drop_confirmed_by='shop_owner_whatsapp', status='pending_collection' WHERE id=$1`,
        [pt.id]
      );
      try {
        await sendSMS(pt.trader_phone,
          `SokoLeo: ${pt.produce_name} iko tayari kukusanywa!\nDeal: ${pt.deal_code}\nKumbuka collection PIN yako.`
        );
      } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

      return res.json({
        success: true,
        message: `✅ Imethibitishwa! ${pt.produce_name} ${pt.quantity}kg imepokelewa kutoka ${pt.farmer_name}. Trader ${pt.trader_name} amearifiwa kuja kuchukua.`,
      });
    } catch (err) {
      return res.json({ success: false, message: 'Kuna tatizo la mfumo.' });
    }
  }

  if (type === 'collect') {
    try {
      const result = await query(
        `SELECT pt.*,
                u1.name as farmer_name, u1.phone as farmer_phone,
                u2.name as trader_name
         FROM pickup_transactions pt
         JOIN users u1 ON pt.farmer_id = u1.id
         JOIN users u2 ON pt.trader_id = u2.id
         WHERE pt.collection_pin=$1 AND pt.status='pending_collection'`,
        [pin]
      );
      if (!result.rows.length)
        return res.json({ success: false, message: 'PIN batili au bidhaa bado hazijawasilishwa.' });

      const pt = result.rows[0];

      await query(
        `UPDATE pickup_transactions SET collection_confirmed_at=NOW(), collection_confirmed_by='trader_whatsapp', status='dispute_window', auto_release_at=$1 WHERE id=$2`,
        [addHours(24), pt.id]
      );
      try {
        await sendSMS(pt.farmer_phone,
          `SokoLeo: Bidhaa zimechukuliwa!\nDeal: ${pt.deal_code}\nMalipo yatatumwa baada ya masaa 24. Asante!`
        );
      } catch (smsErr) { console.error('SMS failed:', smsErr.message); }

      return res.json({
        success: true,
        message: `✅ Ukusanyaji imethibitishwa! Malipo yatatumwa kwa ${pt.farmer_name} ndani ya masaa 24 kama hakuna tatizo.`,
      });
    } catch (err) {
      return res.json({ success: false, message: 'Kuna tatizo la mfumo.' });
    }
  }

  res.json({ success: false, message: 'Aina ya ombi haijulikani.' });
});

module.exports = router;
