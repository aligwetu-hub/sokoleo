const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { sendSMS, SMS_TEMPLATES } = require('../services/smsService');
const fraudDetection = require('../middleware/fraudDetection');

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
  const ip = req.ip || req.connection.remoteAddress;
  if (!phone) return res.status(400).json({ error: 'Phone number required.' });

  let formatted = String(phone).replace(/\s/g, '');
  if (formatted.startsWith('0'))        formatted = '+254' + formatted.slice(1);
  else if (!formatted.startsWith('+'))  formatted = '+254' + formatted;

  try {
    // 1. Blacklist check
    const blacklisted = await fraudDetection.isBlacklisted(formatted);
    if (blacklisted) {
      return res.status(403).json({ error: 'This number is not allowed on SokoLeo.' });
    }

    // 2. Per-phone hourly limit (max 3 OTPs/hour)
    const hourlyCount = await query(
      `SELECT COUNT(*) FROM otp_log WHERE phone=$1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [formatted]
    );
    if (parseInt(hourlyCount.rows[0].count) >= 3) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please wait 1 hour before trying again.',
        retry_after: 3600,
      });
    }

    // 3. 60-second cooldown between OTPs
    const lastOTP = await query(
      `SELECT created_at FROM otp_log WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`,
      [formatted]
    );
    if (lastOTP.rows.length) {
      const elapsed = (Date.now() - new Date(lastOTP.rows[0].created_at).getTime()) / 1000;
      if (elapsed < 60) {
        return res.status(429).json({
          error: `Please wait ${Math.ceil(60 - elapsed)} seconds before requesting another OTP.`,
          retry_after: Math.ceil(60 - elapsed),
        });
      }
    }

    // 4. IP velocity (max 5 OTPs/hour per IP)
    const ipCount = fraudDetection.trackActivity(ip, 'otp_request');
    if (ipCount > 5) {
      return res.status(429).json({ error: 'Too many requests from this device.' });
    }

    // 5. Generate and persist OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(
      `INSERT INTO otp_log (phone, otp_code, ip_address, expires_at) VALUES ($1,$2,$3,$4)`,
      [formatted, otp, ip, expiresAt]
    );

    // 6. Send SMS
    await sendSMS(formatted,
      `SokoLeo: Nambari yako ya uthibitisho ni ${otp}. Itakwisha baada ya dakika 10. Usishiriki na mtu yeyote.`
    );

    console.log(`OTP sent to ${formatted} from IP ${ip}`);
    res.json({ success: true, message: 'OTP sent successfully.', expires_in: 600 });
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/auth/otp/verify
router.post('/otp/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required.' });

  let formatted = String(phone).replace(/\s/g, '');
  if (formatted.startsWith('0'))        formatted = '+254' + formatted.slice(1);
  else if (!formatted.startsWith('+'))  formatted = '+254' + formatted;

  try {
    const otpRecord = await query(
      `SELECT * FROM otp_log WHERE phone=$1 AND verified=false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [formatted]
    );
    if (!otpRecord.rows.length) {
      return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });
    }

    const record = otpRecord.rows[0];

    // Max 5 attempts to prevent brute-force
    if (record.attempts >= 5) {
      await query(`UPDATE otp_log SET verified=false WHERE id=$1`, [record.id]);
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    if (record.otp_code !== otp.toString()) {
      await query(`UPDATE otp_log SET attempts=attempts+1 WHERE id=$1`, [record.id]);
      const remaining = 4 - record.attempts;
      return res.status(400).json({ error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }

    // Mark verified
    await query(`UPDATE otp_log SET verified=true WHERE id=$1`, [record.id]);
    // Also mark user verified in users table if they exist
    await query(`UPDATE users SET is_verified=TRUE, otp_code=NULL, otp_expires_at=NULL WHERE phone=$1`, [formatted]);

    const user = await query(`SELECT id, name, phone, role FROM users WHERE phone=$1`, [formatted]);
    res.json({ success: true, message: 'Phone verified.', user: user.rows[0] || null });
  } catch (err) {
    console.error('OTP verify error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
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

// POST /api/auth/verify-id — farmer submits National ID for admin review
router.post('/verify-id', async (req, res) => {
  const { user_id, national_id, full_name } = req.body;
  if (!user_id || !national_id) {
    return res.status(400).json({ error: 'user_id and national_id are required.' });
  }
  if (national_id.length < 7) {
    return res.status(400).json({ error: 'Invalid National ID number.' });
  }
  try {
    // Ensure columns exist (idempotent)
    await query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS national_id VARCHAR(20),
        ADD COLUMN IF NOT EXISTS id_verification_status VARCHAR(20) DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS id_submitted_at TIMESTAMP
    `);
    await query(`
      UPDATE users SET
        national_id = $1,
        name = COALESCE($2, name),
        id_verification_status = 'pending',
        id_submitted_at = NOW()
      WHERE id = $3
    `, [national_id, full_name || null, user_id]);
    res.json({
      success: true,
      message: 'National ID submitted for verification. Admin will review within 24 hours.',
    });
  } catch (err) {
    console.error('verify-id error:', err.message);
    res.status(500).json({ error: 'Failed to submit ID. Please try again.' });
  }
});

module.exports = router;
