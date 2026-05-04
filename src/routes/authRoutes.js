const express = require('express');
const router = express.Router();
const db = require('../db/client');
const { sendSMS } = require('../services/smsService');
const { signToken, requireAuth } = require('../middleware/auth');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/register', async (req, res) => {
  const { name, phone, role, location, national_id, farm_size, crops, livestock } = req.body;

  if (!name || !phone || !role) {
    return res.status(400).json({ error: 'name, phone, and role are required.' });
  }
  if (!['farmer','trader','visitor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Phone number already registered.' });
    }

    // Add columns if missing
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30)").catch(()=>{});
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE").catch(()=>{});
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT").catch(()=>{});

    const userRes = await db.query(
      'INSERT INTO users (name,phone,role,location,national_id) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,phone,role',
      [name, phone, role, location||null, national_id||null]
    );
    const user = userRes.rows[0];

    // Create role profile - check columns first
    if (role === 'farmer') {
      await db.query('INSERT INTO farmers (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]).catch(()=>{});
    }
    if (role === 'trader') {
      await db.query('INSERT INTO traders (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]).catch(()=>{});
    }

    // Send OTP
    const otp = generateOTP();
    const exp = new Date(Date.now() + 10*60*1000);
    await db.query('UPDATE users SET otp_code=$1,otp_expires_at=$2 WHERE id=$3', [otp, exp, user.id]);
    await sendSMS(phone, `Welcome to SokoLeo, ${name}! Your OTP: ${otp}. Valid 10 mins.`);

    res.status(201).json({
      message: national_id
        ? 'Registered! OTP sent. Admin will verify your ID within 24 hours.'
        : 'Registered! OTP sent. Please provide your National ID to the admin for verification.',
      user
    });
  } catch(e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Registration failed: ' + e.message });
  }
});

router.post('/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required.' });
  const otp = generateOTP();
  const exp = new Date(Date.now() + 10*60*1000);
  try {
    const r = await db.query('UPDATE users SET otp_code=$1,otp_expires_at=$2 WHERE phone=$3 RETURNING id', [otp,exp,phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'Phone not registered.' });
    await sendSMS(phone, `SokoLeo login code: ${otp}. Valid 10 mins.`);
    res.json({ message: 'OTP sent.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/otp/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required.' });
  try {
    const r = await db.query('SELECT id,name,phone,role,otp_code,otp_expires_at FROM users WHERE phone=$1', [phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = r.rows[0];
    if (user.otp_code !== otp) return res.status(401).json({ error: 'Invalid OTP.' });
    if (new Date() > new Date(user.otp_expires_at)) return res.status(401).json({ error: 'OTP expired.' });
    await db.query('UPDATE users SET otp_code=NULL,otp_expires_at=NULL WHERE id=$1', [user.id]);
    const token = signToken(user);
    res.json({ message: 'Login successful.', token, user: { id:user.id, name:user.name, phone:user.phone, role:user.role } });
  } catch(e) { res.status(500).json({ error: 'Verification failed.' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT u.*,f.farm_size,f.crops,t.subscription_tier FROM users u LEFT JOIN farmers f ON f.user_id=u.id LEFT JOIN traders t ON t.user_id=u.id WHERE u.id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/user/:phone', async (req, res) => {
  try {
    const r = await db.query('SELECT id,name,phone,role,location,is_verified,created_at FROM users WHERE phone=$1', [req.params.phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Add secondary role (farmer ↔ trader)
router.post('/add-role', async (req, res) => {
  const { user_id, secondary_role } = req.body;
  if (!user_id || !secondary_role)
    return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await db.query(
      `UPDATE users SET secondary_role=$1, role_switched_at=NOW()
       WHERE id=$2 RETURNING id, full_name, phone, role, secondary_role`,
      [secondary_role, user_id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
