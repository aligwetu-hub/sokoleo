# Add National ID verification system to SokoLeo
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Adding Verification System" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# ── 1. Update authRoutes.js ───────────────────────────────────────
Write-Host "[1/4] Updating auth routes..." -ForegroundColor Cyan
$auth = @'
const express = require('express');
const router = express.Router();
const db = require('../db/client');
const { sendSMS } = require('../services/smsService');
const { signToken, requireAuth } = require('../middleware/auth');

function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// POST /register
router.post('/register', async (req, res) => {
  const { name, phone, role, location, national_id, farm_size, crops, livestock, products_interest } = req.body;
  if (!name || !phone || !role) return res.status(400).json({ error: 'name, phone, role required.' });
  if (!['farmer','trader','visitor'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if ((role === 'farmer' || role === 'trader') && !national_id) {
    return res.status(400).json({ error: 'National ID is required for farmers and traders.' });
  }
  try {
    const ex = await db.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (ex.rows.length) return res.status(409).json({ error: 'Phone already registered.' });

    // Check if national ID already used
    if (national_id) {
      const idEx = await db.query('SELECT id FROM users WHERE national_id=$1', [national_id]).catch(() => ({ rows: [] }));
      if (idEx.rows.length) return res.status(409).json({ error: 'National ID already registered.' });
    }

    // Check if national_id column exists, add if not
    const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
    const colNames = cols.rows.map(r => r.column_name);
    if (!colNames.includes('national_id')) {
      await db.query("ALTER TABLE users ADD COLUMN national_id VARCHAR(20)");
    }
    if (!colNames.includes('is_verified')) {
      await db.query("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE");
    }
    if (!colNames.includes('verification_note')) {
      await db.query("ALTER TABLE users ADD COLUMN verification_note TEXT");
    }

    const u = await db.query(
      'INSERT INTO users (name,phone,role,location,national_id) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,phone,role',
      [name, phone, role, location||null, national_id||null]
    );
    const user = u.rows[0];

    if (role === 'farmer') {
      await db.query('INSERT INTO farmers (user_id,farm_size,crops,livestock) VALUES ($1,$2,$3,$4)',
        [user.id, farm_size||null, crops||[], livestock||[]]);
    }
    if (role === 'trader') {
      await db.query('INSERT INTO traders (user_id,products_interest) VALUES ($1,$2)',
        [user.id, products_interest||[]]);
    }

    // Send OTP
    const otp = genOTP();
    const exp = new Date(Date.now() + 10*60*1000);
    await db.query('UPDATE users SET otp_code=$1,otp_expires_at=$2 WHERE id=$3', [otp,exp,user.id]);
    await sendSMS(phone, `Welcome to SokoLeo! Your OTP: ${otp}\nValid 10 mins.\nAdmin will verify your ID within 24hrs.`);

    res.status(201).json({
      message: role === 'visitor'
        ? 'Registered successfully.'
        : 'Registered! OTP sent. Your National ID will be verified by admin within 24 hours.',
      user
    });
  } catch(e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Registration failed: ' + e.message });
  }
});

// POST /otp/send
router.post('/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required.' });
  const otp = genOTP();
  const exp = new Date(Date.now() + 10*60*1000);
  try {
    const r = await db.query('UPDATE users SET otp_code=$1,otp_expires_at=$2 WHERE phone=$3 RETURNING id', [otp,exp,phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'Phone not registered.' });
    await sendSMS(phone, `SokoLeo login code: ${otp}. Valid 10 mins.`);
    res.json({ message: 'OTP sent.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// POST /otp/verify -> returns JWT
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

// GET /me
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

module.exports = router;
'@
[System.IO.File]::WriteAllText("$PWD\src\routes\authRoutes.js", $auth, [System.Text.UTF8Encoding]::new($false))
Write-Host "  authRoutes.js updated" -ForegroundColor Green

# ── 2. Update adminRoutes.js ──────────────────────────────────────
Write-Host "[2/4] Updating admin routes..." -ForegroundColor Cyan
$admin = @'
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
'@
[System.IO.File]::WriteAllText("$PWD\src\routes\adminRoutes.js", $admin, [System.Text.UTF8Encoding]::new($false))
Write-Host "  adminRoutes.js updated" -ForegroundColor Green

# ── 3. Update listingRoutes.js to block unverified farmers ────────
Write-Host "[3/4] Adding verification check to listings..." -ForegroundColor Cyan
$listings = @'
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
    const sql = `SELECT l.*,u.name as farmer_name,u.phone as farmer_phone,u.location as farmer_location,u.is_verified as farmer_verified FROM listings l JOIN users u ON l.farmer_id=u.id WHERE ${conds.join(' AND ')} ORDER BY l.created_at DESC LIMIT $${i++} OFFSET $${i}`;
    const r = await db.query(sql, params);
    res.json({ listings: r.rows, page: parseInt(page), count: r.rows.length });
  } catch(e) { res.status(500).json({ error: 'Failed: ' + e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT l.*,u.name as farmer_name,u.phone as farmer_phone,u.is_verified as farmer_verified FROM listings l JOIN users u ON l.farmer_id=u.id WHERE l.id=$1', [req.params.id]);
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
    const u = await db.query('SELECT id, is_verified, role FROM users WHERE phone=$1', [farmer_phone]);
    if (!u.rows.length) return res.status(404).json({ error: 'Farmer not found.' });

    const farmer = u.rows[0];

    // Block unverified farmers from listing
    if (!farmer.is_verified) {
      return res.status(403).json({
        error: 'Your account is not yet verified. Please wait for admin to verify your National ID. You will receive an SMS when verified.'
      });
    }

    const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='listings'");
    const colNames = cols.rows.map(r => r.column_name);
    const hasUnit = colNames.includes('unit');

    let sql, values;
    if (hasUnit) {
      sql = 'INSERT INTO listings (farmer_id,product,quantity,unit,price_per_unit,location,availability,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *';
      values = [farmer.id, product, quantity, unit||'bags', price_per_unit||null, location, availability, description||null];
    } else {
      sql = 'INSERT INTO listings (farmer_id,product,quantity,location,availability) VALUES ($1,$2,$3,$4,$5) RETURNING *';
      values = [farmer.id, product, quantity, location, availability];
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
[System.IO.File]::WriteAllText("$PWD\src\routes\listingRoutes.js", $listings, [System.Text.UTF8Encoding]::new($false))
Write-Host "  listingRoutes.js updated with verification check" -ForegroundColor Green

# ── 4. Update admin dashboard to show verification panel ──────────
Write-Host "[4/4] Updating admin dashboard..." -ForegroundColor Cyan

$dashboard = @'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SokoLeo Admin Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root{--green:#2d6a4f;--green2:#40916c;--green-pale:#d8f3dc;--amber:#f4a261;--dark:#1b1b2f;--muted:#6b7280;--border:#e5e7eb;--white:#fff;--red:#ef4444;--blue:#3b82f6}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Outfit',sans-serif;background:#f3f4f6;color:#1b1b2f;min-height:100vh}
    .sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:var(--dark);display:flex;flex-direction:column;padding:0 0 24px;z-index:100}
    .logo{padding:28px 24px 20px;border-bottom:1px solid rgba(255,255,255,0.08)}
    .logo h1{font-size:22px;font-weight:700;color:#fff}.logo h1 span{color:var(--amber)}
    .logo p{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:1px}
    .nav{flex:1;padding:16px 12px}
    .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:rgba(255,255,255,0.55);font-size:14px;font-weight:500;cursor:pointer;transition:all 0.15s;margin-bottom:2px}
    .nav-item:hover{background:rgba(255,255,255,0.06);color:#fff}.nav-item.active{background:var(--green);color:#fff}
    .badge-count{background:var(--red);color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:auto}
    .main{margin-left:240px;padding:32px;min-height:100vh}
    .page{display:none}.page.active{display:block}
    .page-header{margin-bottom:28px}
    .page-header h2{font-size:26px;font-weight:700}
    .page-header p{color:var(--muted);font-size:14px;margin-top:4px}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:28px}
    .stat-card{background:#fff;border-radius:14px;padding:20px;border:1px solid var(--border);position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
    .stat-card.green::before{background:var(--green2)}.stat-card.amber::before{background:var(--amber)}.stat-card.blue::before{background:var(--blue)}.stat-card.red::before{background:var(--red)}
    .stat-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
    .stat-value{font-size:32px;font-weight:700;margin-top:8px;font-family:'DM Mono',monospace}
    .stat-icon{position:absolute;top:18px;right:18px;font-size:26px;opacity:0.12}
    .table-card{background:#fff;border-radius:14px;border:1px solid var(--border);overflow:hidden;margin-bottom:24px}
    .table-header{padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .table-header h3{font-size:15px;font-weight:600}
    table{width:100%;border-collapse:collapse}
    th{padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:600;background:#fafafa;border-bottom:1px solid var(--border)}
    td{padding:12px 16px;font-size:13px;border-bottom:1px solid #f3f4f6}
    tr:last-child td{border-bottom:none}tr:hover td{background:#fafafa}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .badge.green{background:var(--green-pale);color:var(--green)}.badge.amber{background:#fef3c7;color:#92400e}.badge.red{background:#fee2e2;color:#991b1b}.badge.blue{background:#dbeafe;color:#1e40af}.badge.gray{background:#f3f4f6;color:#374151}
    .btn{padding:8px 16px;border-radius:8px;font-size:13px;font-family:'Outfit',sans-serif;font-weight:500;cursor:pointer;border:none;transition:all 0.15s}
    .btn-primary{background:var(--green);color:#fff}.btn-primary:hover{background:var(--green2)}
    .btn-danger{background:#fee2e2;color:var(--red)}.btn-danger:hover{background:#fecaca}
    .btn-sm{padding:4px 10px;font-size:12px;border-radius:6px}
    .btn-ghost{background:transparent;border:1px solid var(--border);color:#374151}.btn-ghost:hover{background:#f3f4f6}
    .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
    .last-updated{font-size:12px;color:var(--muted)}
    .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    .chart-card{background:#fff;border-radius:14px;border:1px solid var(--border);padding:20px}
    .chart-card h3{font-size:14px;font-weight:600;margin-bottom:16px;color:#374151}
    .bar-chart{display:flex;flex-direction:column;gap:10px}
    .bar-row{display:flex;align-items:center;gap:12px}
    .bar-label{font-size:12px;color:var(--muted);width:90px;flex-shrink:0}
    .bar-track{flex:1;height:10px;background:#f3f4f6;border-radius:99px;overflow:hidden}
    .bar-fill{height:100%;border-radius:99px;background:var(--green2);transition:width 0.6s ease}
    .bar-count{font-size:12px;font-family:'DM Mono',monospace;color:#374151;width:30px;text-align:right}
    .loading{text-align:center;padding:40px;color:var(--muted);font-size:14px}
    .spinner{display:inline-block;width:20px;height:20px;border:2px solid #e5e7eb;border-top-color:var(--green);border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}
    .empty{text-align:center;padding:48px 20px;color:var(--muted)}
    .alert-banner{background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;font-size:14px;color:#92400e}
    .filter-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:999;padding:20px}
    .modal-overlay.open{display:flex}
    .modal{background:#fff;border-radius:20px;padding:32px;width:100%;max-width:420px}
    .modal h3{font-size:18px;font-weight:700;margin-bottom:8px}
    .modal p{font-size:13px;color:var(--muted);margin-bottom:16px}
    .modal input{width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'Outfit',sans-serif;font-size:14px;outline:none;margin-bottom:16px}
    .modal input:focus{border-color:var(--green2)}
    .modal-actions{display:flex;gap:10px}
    .toast{position:fixed;bottom:24px;right:24px;background:var(--dark);color:#fff;border-radius:12px;padding:14px 20px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.2);transform:translateY(80px);opacity:0;transition:all 0.3s;z-index:9999}
    .toast.show{transform:translateY(0);opacity:1}
    .id-chip{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:2px 8px;font-family:'DM Mono',monospace;font-size:12px;color:#166534}
  </style>
</head>
<body>
<div class="sidebar">
  <div class="logo"><h1>Soko<span>Leo</span></h1><p>Admin Dashboard</p></div>
  <nav class="nav">
    <div class="nav-item active" onclick="showPage('overview',this)">&#128202; Overview</div>
    <div class="nav-item" onclick="showPage('verify',this)" id="navVerify">&#9989; Verify Users <span class="badge-count" id="pendingCount">0</span></div>
    <div class="nav-item" onclick="showPage('listings',this)">&#127807; Listings</div>
    <div class="nav-item" onclick="showPage('users',this)">&#128101; All Users</div>
    <div class="nav-item" onclick="showPage('ussd',this)">&#128241; USSD Flow</div>
  </nav>
  <div style="padding:0 12px;font-size:12px;color:rgba(255,255,255,0.25);text-align:center">SokoLeo v1.0 &middot; Tharaka Nithi</div>
</div>

<div class="main">

  <!-- OVERVIEW -->
  <div class="page active" id="page-overview">
    <div class="page-header"><h2>Dashboard Overview</h2><p>SokoLeo marketplace &middot; Tharaka Nithi County, Kenya</p></div>
    <div class="topbar"><span class="last-updated" id="lastUpdated">Loading...</span><button class="btn btn-primary" onclick="loadStats()">&#8635; Refresh</button></div>
    <div id="pendingBanner"></div>
    <div class="stats-grid" id="statsGrid"><div class="loading"><span class="spinner"></span>Loading...</div></div>
    <div class="charts-grid">
      <div class="chart-card"><h3>&#127807; Top Crops Listed</h3><div class="bar-chart" id="cropsChart"><div class="loading">Loading...</div></div></div>
      <div class="chart-card"><h3>&#128203; Recent Activity</h3><div id="summaryBox"><div class="loading">Loading...</div></div></div>
    </div>
  </div>

  <!-- VERIFY USERS -->
  <div class="page" id="page-verify">
    <div class="page-header"><h2>&#9989; Verify Users</h2><p>Check National IDs and approve farmers and traders</p></div>
    <div class="table-card">
      <div class="table-header"><h3>Pending Verification</h3><button class="btn btn-ghost btn-sm" onclick="loadPending()">&#8635; Refresh</button></div>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Location</th><th>National ID</th><th>Registered</th><th>Action</th></tr></thead>
        <tbody id="pendingTable"><tr><td colspan="7" class="loading"><span class="spinner"></span>Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- LISTINGS -->
  <div class="page" id="page-listings">
    <div class="page-header"><h2>Produce Listings</h2><p>All active and recent listings</p></div>
    <div class="table-card">
      <div class="table-header"><h3>All Listings</h3><button class="btn btn-ghost btn-sm" onclick="loadListings()">&#8635; Refresh</button></div>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Location</th><th>Availability</th><th>Farmer</th><th>Phone</th><th>Verified</th><th>Status</th><th>Date</th></tr></thead>
        <tbody id="listingsTable"><tr><td colspan="9" class="loading"><span class="spinner"></span>Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- ALL USERS -->
  <div class="page" id="page-users">
    <div class="page-header"><h2>All Users</h2><p>Registered farmers, traders and visitors</p></div>
    <div class="filter-row">
      <button class="btn btn-primary btn-sm" onclick="loadUsers()">All</button>
      <button class="btn btn-ghost btn-sm" onclick="loadUsers('farmer')">&#127806; Farmers</button>
      <button class="btn btn-ghost btn-sm" onclick="loadUsers('trader')">&#128722; Traders</button>
      <button class="btn btn-ghost btn-sm" onclick="loadUsers('visitor')">&#128100; Visitors</button>
    </div>
    <div class="table-card">
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Location</th><th>National ID</th><th>Verified</th><th>Joined</th><th>Action</th></tr></thead>
        <tbody id="usersTable"><tr><td colspan="8" class="loading"><span class="spinner"></span>Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- USSD -->
  <div class="page" id="page-ussd">
    <div class="page-header"><h2>USSD Flow *789#</h2><p>How farmers and traders use SokoLeo on any phone</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px">
      <div style="text-align:center">
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px;font-weight:600">MAIN MENU</p>
        <div style="background:#1b1b2f;border-radius:24px;padding:20px;font-family:'DM Mono',monospace;font-size:13px;color:#a3e635;border:6px solid #374151">
          <div style="text-align:center;color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:8px;text-transform:uppercase;letter-spacing:2px">*789#</div>
          <div style="background:#111827;border-radius:12px;padding:16px;white-space:pre-line;line-height:1.7">Welcome to SokoLeo

1. Sell Produce
2. Buy Produce
3. Farm Tours
4. My Listings
5. Help</div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- Reject Modal -->
<div class="modal-overlay" id="rejectModal">
  <div class="modal">
    <h3>&#10060; Reject User</h3>
    <p>The user will be notified by SMS with the reason.</p>
    <input type="text" id="rejectReason" placeholder="Reason (e.g. ID could not be verified)" />
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" style="flex:2" onclick="confirmReject()">Reject & Notify</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const API = '';
let rejectUserId = null;

function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  el.classList.add('active');
  if (name === 'overview') loadStats();
  if (name === 'verify') loadPending();
  if (name === 'listings') loadListings();
  if (name === 'users') loadUsers();
}

function badge(s) {
  const m = { active:'green', reserved:'amber', sold:'blue', expired:'gray', farmer:'green', trader:'amber', visitor:'blue', today:'green', tomorrow:'amber', this_week:'blue' };
  return `<span class="badge ${m[s]||'gray'}">${s}</span>`;
}

function fmt(d) { return new Date(d).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' }); }

async function api(path, method='GET', body=null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    return await r.json();
  } catch { return null; }
}

async function loadStats() {
  document.getElementById('lastUpdated').textContent = 'Refreshing...';
  const d = await api('/api/v1/admin/stats');
  document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  if (!d) return;

  // Show pending banner
  if (d.pending_verification > 0) {
    document.getElementById('pendingBanner').innerHTML = `
      <div class="alert-banner">
        &#9888;&#65039; <strong>${d.pending_verification} user(s) waiting for verification.</strong>
        &nbsp;<button class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none" onclick="showPage('verify', document.querySelectorAll('.nav-item')[1])">Review Now</button>
      </div>`;
    document.getElementById('pendingCount').textContent = d.pending_verification;
  } else {
    document.getElementById('pendingBanner').innerHTML = '';
    document.getElementById('pendingCount').textContent = '0';
  }

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card green"><span class="stat-icon">&#127806;</span><div class="stat-label">Farmers</div><div class="stat-value">${d.farmers}</div></div>
    <div class="stat-card amber"><span class="stat-icon">&#128722;</span><div class="stat-label">Traders</div><div class="stat-value">${d.traders}</div></div>
    <div class="stat-card blue"><span class="stat-icon">&#128203;</span><div class="stat-label">Active Listings</div><div class="stat-value">${d.active_listings}</div></div>
    <div class="stat-card red"><span class="stat-icon">&#128230;</span><div class="stat-label">Reservations</div><div class="stat-value">${d.total_reservations}</div></div>
    <div class="stat-card green"><span class="stat-icon">&#128176;</span><div class="stat-label">Revenue (KES)</div><div class="stat-value">${Number(d.total_revenue_kes||0).toLocaleString()}</div></div>
    <div class="stat-card amber"><span class="stat-icon">&#9203;</span><div class="stat-label">Pending Verify</div><div class="stat-value">${d.pending_verification}</div></div>`;

  const max = Math.max(...(d.top_crops||[]).map(c=>c.count), 1);
  document.getElementById('cropsChart').innerHTML = (d.top_crops||[]).map(c =>
    `<div class="bar-row"><span class="bar-label">${c.product}</span><div class="bar-track"><div class="bar-fill" style="width:${c.count/max*100}%"></div></div><span class="bar-count">${c.count}</span></div>`
  ).join('') || '<div class="empty">No crop data yet.</div>';

  document.getElementById('summaryBox').innerHTML = `
    <div style="font-size:13px;color:#6b7280;line-height:2.2">
      <div>&#9989; ${d.farmers} farmers registered</div>
      <div>&#128722; ${d.traders} traders active</div>
      <div>&#128203; ${d.active_listings} listings live</div>
      <div>&#128230; ${d.total_reservations} reservations placed</div>
      <div>&#128176; KES ${Number(d.total_revenue_kes||0).toLocaleString()} revenue</div>
      <div>&#9203; ${d.pending_verification} awaiting verification</div>
    </div>`;
}

async function loadPending() {
  document.getElementById('pendingTable').innerHTML = '<tr><td colspan="7" class="loading"><span class="spinner"></span>Loading...</td></tr>';
  const d = await api('/api/v1/admin/users?verified=false');
  if (!d || !d.length) {
    document.getElementById('pendingTable').innerHTML = '<tr><td colspan="7"><div class="empty">&#9989; All users are verified!</div></td></tr>';
    return;
  }
  document.getElementById('pendingTable').innerHTML = d.filter(u => u.role !== 'visitor').map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-family:monospace;font-size:12px">${u.phone}</td>
      <td>${badge(u.role)}</td>
      <td>${u.location||'—'}</td>
      <td>${u.national_id ? `<span class="id-chip">${u.national_id}</span>` : '<span style="color:#9ca3af">Not provided</span>'}</td>
      <td style="color:#9ca3af;font-size:12px">${fmt(u.created_at)}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="verifyUser('${u.id}', '${u.name}')">&#9989; Verify</button>
        <button class="btn btn-danger btn-sm" onclick="openReject('${u.id}')">&#10060; Reject</button>
      </td>
    </tr>`).join('');
}

async function verifyUser(id, name) {
  const r = await api('/api/v1/admin/users/' + id + '/verify', 'PATCH', { note: 'National ID verified by admin' });
  if (r && r.message) {
    showToast('&#9989; ' + name + ' verified! SMS sent.');
    loadPending();
    loadStats();
  }
}

function openReject(id) {
  rejectUserId = id;
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectModal').classList.add('open');
}

function closeModal() {
  document.getElementById('rejectModal').classList.remove('open');
  rejectUserId = null;
}

async function confirmReject() {
  const reason = document.getElementById('rejectReason').value || 'ID could not be verified';
  const r = await api('/api/v1/admin/users/' + rejectUserId + '/reject', 'PATCH', { reason });
  closeModal();
  if (r) { showToast('User rejected and notified.'); loadPending(); }
}

async function loadListings() {
  document.getElementById('listingsTable').innerHTML = '<tr><td colspan="9" class="loading"><span class="spinner"></span>Loading...</td></tr>';
  const d = await api('/api/v1/admin/listings');
  if (!d || !d.length) { document.getElementById('listingsTable').innerHTML = '<tr><td colspan="9"><div class="empty">No listings yet.</div></td></tr>'; return; }
  document.getElementById('listingsTable').innerHTML = d.map(l => `
    <tr>
      <td><strong>${l.product}</strong></td>
      <td>${l.quantity}</td>
      <td>${l.location}</td>
      <td>${badge(l.availability?.replace('_',' '))}</td>
      <td>${l.farmer_name}</td>
      <td style="font-family:monospace;font-size:12px">${l.farmer_phone}</td>
      <td>${l.farmer_verified ? '<span class="badge green">&#9989; Yes</span>' : '<span class="badge amber">Pending</span>'}</td>
      <td>${badge(l.status)}</td>
      <td style="color:#9ca3af;font-size:12px">${fmt(l.created_at)}</td>
    </tr>`).join('');
}

async function loadUsers(role) {
  document.getElementById('usersTable').innerHTML = '<tr><td colspan="8" class="loading"><span class="spinner"></span>Loading...</td></tr>';
  const url = role ? '/api/v1/admin/users?role=' + role : '/api/v1/admin/users';
  const d = await api(url);
  if (!d || !d.length) { document.getElementById('usersTable').innerHTML = '<tr><td colspan="8"><div class="empty">No users yet.</div></td></tr>'; return; }
  document.getElementById('usersTable').innerHTML = d.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-family:monospace;font-size:12px">${u.phone}</td>
      <td>${badge(u.role)}</td>
      <td>${u.location||'—'}</td>
      <td>${u.national_id ? `<span class="id-chip">${u.national_id}</span>` : '—'}</td>
      <td>${u.is_verified ? '<span class="badge green">&#9989; Verified</span>' : '<span class="badge amber">Pending</span>'}</td>
      <td style="color:#9ca3af;font-size:12px">${fmt(u.created_at)}</td>
      <td>${!u.is_verified && u.role !== 'visitor' ? `<button class="btn btn-primary btn-sm" onclick="verifyUser('${u.id}','${u.name}')">Verify</button>` : ''}</td>
    </tr>`).join('');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

loadStats();
</script>
</body>
</html>
'@

[System.IO.File]::WriteAllText("$PWD\public\index.html", $dashboard, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Admin dashboard updated with verification panel" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Verification system ready!" -ForegroundColor Green
Write-Host "  Restart server: npm run dev" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
