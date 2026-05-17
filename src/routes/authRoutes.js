const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { sendSMS, SMS_TEMPLATES } = require('../services/smsService');

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, phone, role, location, farm_size, crops, livestock, products_interest, purchase_capacity } = req.body;

  if (!name || !phone || !role) {
    return res.status(400).json({ error: 'name, phone, and role are required.' });
  }

  if (!['farmer', 'trader', 'visitor'].includes(role)) {
    return res.status(400).json({ error: 'role must be farmer, trader, or visitor.' });
  }

  try {
    // Check existing user
    const existing = await query(`SELECT id FROM users WHERE phone=$1`, [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Phone number already registered.' });
    }

    // Create user
    const userRes = await query(
      `INSERT INTO users (name, phone, role, location) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, role`,
      [name, phone, role, location]
    );
    const user = userRes.rows[0];

    // Create role profile
    if (role === 'farmer') {
      await query(
        `INSERT INTO farmers (user_id, farm_size, crops, livestock) VALUES ($1, $2, $3, $4)`,
        [user.id, farm_size || null, crops || [], livestock || []]
      );
    } else if (role === 'trader') {
      await query(
        `INSERT INTO traders (user_id, products_interest, purchase_capacity) VALUES ($1, $2, $3)`,
        [user.id, products_interest || [], purchase_capacity || null]
      );
    }

    // Send welcome SMS
    try {
      const welcomeMsg = role === 'farmer'
        ? SMS_TEMPLATES.welcomeFarmer(name)
        : SMS_TEMPLATES.welcomeTrader(name);
      await sendSMS(phone, welcomeMsg);
    } catch (smsErr) { console.error('SMS failed but continuing:', smsErr.message); }

    res.status(201).json({ message: 'Registration successful.', user });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/otp/send
router.post('/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required.' });

  const otp = generateOTP();
  const ttl = parseInt(process.env.OTP_TTL_MINUTES || 10);
  const expires = new Date(Date.now() + ttl * 60 * 1000);

  try {
    const result = await query(
      `UPDATE users SET otp_code=$1, otp_expires_at=$2 WHERE phone=$3 RETURNING id`,
      [otp, expires, phone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Phone not registered.' });
    }

    await sendSMS(phone, `SokoLeo verification code: ${otp}\nValid for ${ttl} minutes.`);
    res.json({ message: 'OTP sent.' });
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(500).json({ error: 'Could not send OTP.' });
  }
});

// POST /api/auth/otp/verify
router.post('/otp/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required.' });

  try {
    const result = await query(
      `SELECT id, otp_code, otp_expires_at FROM users WHERE phone=$1`, [phone]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const user = result.rows[0];
    if (user.otp_code !== otp) return res.status(401).json({ error: 'Invalid OTP.' });
    if (new Date() > new Date(user.otp_expires_at)) return res.status(401).json({ error: 'OTP expired.' });

    await query(`UPDATE users SET is_verified=TRUE, otp_code=NULL, otp_expires_at=NULL WHERE id=$1`, [user.id]);

    res.json({ message: 'Phone verified.', userId: user.id });
  } catch (err) {
    console.error('OTP verify error:', err.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// GET /api/auth/user/:phone
router.get('/user/:phone', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.phone, u.role, u.location, u.is_verified, u.created_at,
              f.farm_size, f.crops, f.livestock,
              t.subscription_tier, t.products_interest,
              (f.user_id IS NOT NULL) AS has_farmer_profile,
              (t.user_id IS NOT NULL) AS has_trader_profile
       FROM users u
       LEFT JOIN farmers f ON f.user_id = u.id
       LEFT JOIN traders t ON t.user_id = u.id
       WHERE u.phone=$1`,
      [req.params.phone]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// POST /api/auth/add-role
router.post('/add-role', async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json({ error: 'user_id and role are required.' });
  if (!['farmer', 'trader'].includes(role)) return res.status(400).json({ error: 'Role must be farmer or trader.' });

  try {
    const userRes = await query(`SELECT id, role FROM users WHERE id=$1`, [user_id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = userRes.rows[0];
    if (user.role === role) return res.status(400).json({ error: `You are already a ${role}.` });

    if (role === 'farmer') {
      const exists = await query(`SELECT user_id FROM farmers WHERE user_id=$1`, [user_id]);
      if (exists.rows.length) return res.status(400).json({ error: 'Already registered as a farmer.' });
      await query(`INSERT INTO farmers (user_id) VALUES ($1)`, [user_id]);
    } else {
      const exists = await query(`SELECT user_id FROM traders WHERE user_id=$1`, [user_id]);
      if (exists.rows.length) return res.status(400).json({ error: 'Already registered as a trader.' });
      await query(`INSERT INTO traders (user_id) VALUES ($1)`, [user_id]);
    }

    res.json({ success: true, message: `Registered as ${role} successfully.` });
  } catch (err) {
    console.error('Add role error:', err.message);
    res.status(500).json({ error: 'Failed to add role.' });
  }
});

module.exports = router;
