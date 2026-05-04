# SokoLeo Complete Setup Script
# Run from: C:\Users\User\OneDrive\Documents\sokoleo
# Command: powershell -ExecutionPolicy Bypass -File setup-sokoleo.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SokoLeo - Writing all source files" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Create folders
New-Item -ItemType Directory -Force -Path "public" | Out-Null
New-Item -ItemType Directory -Force -Path "src\middleware" | Out-Null
New-Item -ItemType Directory -Force -Path "src\routes" | Out-Null
New-Item -ItemType Directory -Force -Path "src\services" | Out-Null
Write-Host "[1/10] Folders ready" -ForegroundColor Cyan

# ── src\middleware\auth.js ─────────────────────────────────────────
@'
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'sokoleo_dev_secret_2024';

function signToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '72h' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access restricted to: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
'@ | Set-Content -Path "src\middleware\auth.js" -Encoding UTF8
Write-Host "[2/10] auth middleware written" -ForegroundColor Cyan

# ── src\services\smsService.js ────────────────────────────────────
@'
require('dotenv').config();

async function sendSMS(to, message) {
  const recipients = Array.isArray(to) ? to : [to];
  console.log(`[SMS] To: ${recipients.join(', ')}\nMessage: ${message}\n`);
  return { success: true, mock: true };
}

async function notifyListingCreated(phone, product, quantity, location) {
  return sendSMS(phone, `SokoLeo: Listing created!\nProduct: ${product}\nQty: ${quantity}\nLocation: ${location}`);
}
async function notifyReservationToFarmer(phone, traderName, product, quantity) {
  return sendSMS(phone, `SokoLeo: New reservation!\n${traderName} wants ${quantity} of your ${product}.`);
}
async function notifyReservationToTrader(phone, farmerName, farmerPhone, product, quantity) {
  return sendSMS(phone, `SokoLeo: Reservation confirmed!\nFarmer: ${farmerName} - ${farmerPhone}\nProduct: ${product}, Qty: ${quantity}`);
}
async function notifyPaymentConfirmed(phone, amount, ref) {
  return sendSMS(phone, `SokoLeo: Payment of KES ${amount} received. Ref: ${ref}`);
}
async function notifyNewProduce(phones, product, quantity, location, farmerPhone) {
  return sendSMS(phones, `SokoLeo Alert: New ${product} - ${quantity} in ${location}. Call: ${farmerPhone}`);
}
async function notifyTourBooked(phone, visitorName, date, count) {
  return sendSMS(phone, `SokoLeo: Farm tour booked!\nVisitor: ${visitorName}\nDate: ${date}\nGroup: ${count}`);
}

module.exports = { sendSMS, notifyListingCreated, notifyReservationToFarmer, notifyReservationToTrader, notifyPaymentConfirmed, notifyNewProduce, notifyTourBooked };
'@ | Set-Content -Path "src\services\smsService.js" -Encoding UTF8
Write-Host "[3/10] smsService written" -ForegroundColor Cyan

# ── src\services\paymentService.js ───────────────────────────────
@'
async function initiateSTKPush(phone, amount, accountRef, description) {
  console.log(`[M-Pesa MOCK] STK Push to ${phone} for KES ${amount} | Ref: ${accountRef}`);
  return { success: true, mock: true, CheckoutRequestID: `mock_${Date.now()}` };
}
function parseCallback(body) {
  const stk = body && body.Body && body.Body.stkCallback;
  if (!stk) return null;
  return { success: stk.ResultCode === 0, checkoutRequestId: stk.CheckoutRequestID, resultDesc: stk.ResultDesc };
}
module.exports = { initiateSTKPush, parseCallback };
'@ | Set-Content -Path "src\services\paymentService.js" -Encoding UTF8
Write-Host "[4/10] paymentService written" -ForegroundColor Cyan

# ── src\services\ussdService.js ───────────────────────────────────
@'
const db = require('../db');
const { notifyListingCreated } = require('./smsService');

const CON = t => `CON ${t}`;
const END = t => `END ${t}`;

async function handleUSSD({ sessionId, phoneNumber, text }) {
  const phone = phoneNumber.replace(/^\+/, '');
  const parts = (text || '').split('*');

  if (!text) {
    return CON(`Welcome to SokoLeo\n1. Sell Produce\n2. Buy Produce\n3. Farm Tours\n4. My Listings\n5. Help`);
  }

  // SELL
  if (parts[0] === '1') {
    if (parts.length === 1) return CON(`Select product:\n1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats`);
    if (parts.length === 2) return CON(`Enter quantity (e.g. 10 bags):`);
    if (parts.length === 3) return CON(`Enter your location:`);
    if (parts.length === 4) return CON(`Availability?\n1. Today\n2. Tomorrow\n3. This Week`);
    if (parts.length === 5) {
      const products = ['Maize','Beans','Green Grams','Millet','Mangoes','Goats'];
      const product = products[parseInt(parts[1])-1] || 'Other';
      const quantity = parts[2];
      const location = parts[3];
      const avMap = {'1':'today','2':'tomorrow','3':'this_week'};
      const availability = avMap[parts[4]] || 'this_week';
      try {
        let u = await db.query('SELECT id FROM users WHERE phone=$1',[phone]);
        let userId;
        if (!u.rows.length) {
          const nu = await db.query(`INSERT INTO users (phone,name,role,location) VALUES ($1,$2,'farmer',$3) RETURNING id`,[phone,`Farmer${phone.slice(-4)}`,location]);
          userId = nu.rows[0].id;
          await db.query('INSERT INTO farmers (user_id) VALUES ($1)',[userId]);
        } else { userId = u.rows[0].id; }
        await db.query(`INSERT INTO listings (farmer_id,product,quantity,location,availability) VALUES ($1,$2,$3,$4,$5)`,[userId,product,quantity,location,availability]);
        await notifyListingCreated(phone, product, quantity, location);
        return END(`Listing saved!\n${product} - ${quantity}\nLocation: ${location}\nBuyers will contact you.`);
      } catch(e) { return END('Error saving listing. Try again.'); }
    }
  }

  // BUY
  if (parts[0] === '2') {
    if (parts.length === 1) return CON(`What to buy?\n1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats`);
    if (parts.length === 2) {
      const products = ['Maize','Beans','Green Grams','Millet','Mangoes','Goats'];
      const product = products[parseInt(parts[1])-1];
      if (!product) return END('Invalid choice. Dial *789# again.');
      const r = await db.query(`SELECT l.id,l.quantity,l.location,u.name,u.phone FROM listings l JOIN users u ON l.farmer_id=u.id WHERE LOWER(l.product)=LOWER($1) AND l.status='active' LIMIT 5`,[product]);
      if (!r.rows.length) return END(`No ${product} available now.`);
      let menu = `Available ${product}:\n`;
      r.rows.forEach((l,i) => menu += `${i+1}. ${l.name} - ${l.quantity} - ${l.location}\n`);
      return CON(menu + '\nSelect:');
    }
    return END('Thank you for using SokoLeo!');
  }

  // HELP
  if (parts[0] === '5') return END(`SokoLeo Help\nSell: *789*1#\nBuy: *789*2#\nSupport: 0700000000`);

  return END('Invalid option. Dial *789# to start.');
}

module.exports = { handleUSSD };
'@ | Set-Content -Path "src\services\ussdService.js" -Encoding UTF8
Write-Host "[5/10] ussdService written" -ForegroundColor Cyan

# ── src\routes\authRoutes.js ──────────────────────────────────────
@'
const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendSMS } = require('../services/smsService');
const { signToken, requireAuth } = require('../middleware/auth');

function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

router.post('/register', async (req, res) => {
  const { name, phone, role, location, farm_size, crops, livestock, products_interest } = req.body;
  if (!name || !phone || !role) return res.status(400).json({ error: 'name, phone, role required.' });
  if (!['farmer','trader','visitor'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  try {
    const ex = await db.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (ex.rows.length) return res.status(409).json({ error: 'Phone already registered.' });
    const u = await db.query(`INSERT INTO users (name,phone,role,location) VALUES ($1,$2,$3,$4) RETURNING id,name,phone,role`, [name,phone,role,location||null]);
    const user = u.rows[0];
    if (role==='farmer') await db.query('INSERT INTO farmers (user_id,farm_size,crops,livestock) VALUES ($1,$2,$3,$4)', [user.id,farm_size||null,crops||[],livestock||[]]);
    if (role==='trader') await db.query('INSERT INTO traders (user_id,products_interest) VALUES ($1,$2)', [user.id,products_interest||[]]);
    const otp = genOTP();
    const exp = new Date(Date.now() + 10*60*1000);
    await db.query('UPDATE users SET otp_code=$1,otp_expires_at=$2 WHERE id=$3', [otp,exp,user.id]);
    await sendSMS(phone, `Welcome to SokoLeo, ${name}! Your OTP: ${otp}`);
    res.status(201).json({ message: 'Registered. OTP sent.', user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Registration failed.' }); }
});

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
  } catch(e) { res.status(500).json({ error: 'Failed to send OTP.' }); }
});

router.post('/otp/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required.' });
  try {
    const r = await db.query('SELECT id,name,phone,role,otp_code,otp_expires_at,is_active FROM users WHERE phone=$1', [phone]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = r.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated.' });
    if (user.otp_code !== otp) return res.status(401).json({ error: 'Invalid OTP.' });
    if (new Date() > new Date(user.otp_expires_at)) return res.status(401).json({ error: 'OTP expired.' });
    await db.query('UPDATE users SET is_verified=TRUE,otp_code=NULL,otp_expires_at=NULL WHERE id=$1', [user.id]);
    const token = signToken(user);
    res.json({ message: 'Login successful.', token, user: { id:user.id, name:user.name, phone:user.phone, role:user.role } });
  } catch(e) { res.status(500).json({ error: 'Verification failed.' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`SELECT u.*,f.farm_size,f.crops,f.livestock,t.subscription_tier,t.products_interest FROM users u LEFT JOIN farmers f ON f.user_id=u.id LEFT JOIN traders t ON t.user_id=u.id WHERE u.id=$1`, [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

module.exports = router;
'@ | Set-Content -Path "src\routes\authRoutes.js" -Encoding UTF8
Write-Host "[6/10] authRoutes written" -ForegroundColor Cyan

# ── src\routes\listingRoutes.js ───────────────────────────────────
@'
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyListingCreated, notifyNewProduce } = require('../services/smsService');

router.get('/', async (req, res) => {
  const { product, location, availability, page=1, limit=20 } = req.query;
  const offset = (parseInt(page)-1)*parseInt(limit);
  try {
    let conds = ["l.status='active'","l.expires_at > NOW()"], params=[], i=1;
    if (product) { conds.push(`LOWER(l.product) LIKE LOWER($${i++})`); params.push(`%${product}%`); }
    if (location) { conds.push(`LOWER(l.location) LIKE LOWER($${i++})`); params.push(`%${location}%`); }
    if (availability) { conds.push(`l.availability=$${i++}`); params.push(availability); }
    params.push(parseInt(limit), offset);
    const sql = `SELECT l.*,u.name as farmer_name,u.phone as farmer_phone,u.location as farmer_location FROM listings l JOIN users u ON l.farmer_id=u.id WHERE ${conds.join(' AND ')} ORDER BY l.created_at DESC LIMIT $${i++} OFFSET $${i}`;
    const r = await db.query(sql, params);
    res.json({ listings: r.rows, page: parseInt(page), count: r.rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to fetch listings.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`SELECT l.*,u.name as farmer_name,u.phone as farmer_phone FROM listings l JOIN users u ON l.farmer_id=u.id WHERE l.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', async (req, res) => {
  const { farmer_phone, product, quantity, unit, price_per_unit, location, availability, description } = req.body;
  if (!farmer_phone||!product||!quantity||!location||!availability) return res.status(400).json({ error: 'Missing required fields.' });
  try {
    const u = await db.query(`SELECT id FROM users WHERE phone=$1 AND role='farmer'`, [farmer_phone]);
    if (!u.rows.length) return res.status(404).json({ error: 'Farmer not found.' });
    const l = await db.query(`INSERT INTO listings (farmer_id,product,quantity,unit,price_per_unit,location,availability,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [u.rows[0].id,product,quantity,unit||'bags',price_per_unit||null,location,availability,description||null]);
    await notifyListingCreated(farmer_phone, product, quantity, location);
    res.status(201).json({ message: 'Listing created.', listing: l.rows[0] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create listing.' }); }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active','reserved','sold','expired'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  try {
    const r = await db.query('UPDATE listings SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

module.exports = router;
'@ | Set-Content -Path "src\routes\listingRoutes.js" -Encoding UTF8
Write-Host "[7/10] listingRoutes written" -ForegroundColor Cyan

# ── src\routes\reservationRoutes.js ──────────────────────────────
@'
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyReservationToFarmer, notifyReservationToTrader } = require('../services/smsService');
const { initiateSTKPush } = require('../services/paymentService');

router.post('/', async (req, res) => {
  const { listing_id, trader_phone, quantity_reserved, notes } = req.body;
  if (!listing_id||!trader_phone) return res.status(400).json({ error: 'listing_id and trader_phone required.' });
  try {
    let t = await db.query('SELECT id,name FROM users WHERE phone=$1', [trader_phone]);
    if (!t.rows.length) return res.status(404).json({ error: 'Trader not found. Please register first.' });
    const trader = t.rows[0];
    const l = await db.query(`SELECT l.*,u.name as farmer_name,u.phone as farmer_phone FROM listings l JOIN users u ON l.farmer_id=u.id WHERE l.id=$1 AND l.status='active'`, [listing_id]);
    if (!l.rows.length) return res.status(404).json({ error: 'Listing not found or not active.' });
    const listing = l.rows[0];
    const r = await db.query(`INSERT INTO reservations (listing_id,trader_id,quantity_reserved,notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [listing_id, trader.id, quantity_reserved||listing.quantity, notes||null]);
    await db.query("UPDATE listings SET status='reserved' WHERE id=$1", [listing_id]);
    await notifyReservationToFarmer(listing.farmer_phone, trader.name, listing.product, quantity_reserved||listing.quantity);
    await notifyReservationToTrader(trader_phone, listing.farmer_name, listing.farmer_phone, listing.product, quantity_reserved||listing.quantity);
    res.status(201).json({ message: 'Reservation placed.', reservation: r.rows[0] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/trader/:phone', async (req, res) => {
  try {
    const r = await db.query(`SELECT r.*,l.product,l.quantity,l.location,u.name as farmer_name,u.phone as farmer_phone FROM reservations r JOIN listings l ON r.listing_id=l.id JOIN users u ON l.farmer_id=u.id WHERE r.trader_id=(SELECT id FROM users WHERE phone=$1) ORDER BY r.created_at DESC`, [req.params.phone]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/:id/pay', async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone||!amount) return res.status(400).json({ error: 'phone and amount required.' });
  try {
    const mpesaPhone = phone.replace(/^0/,'254').replace(/^\+/,'');
    const result = await initiateSTKPush(mpesaPhone, amount, `RES-${req.params.id.slice(0,8)}`, 'SokoLeo Reservation');
    res.json({ message: 'Payment initiated. Check your phone.', result });
  } catch(e) { res.status(500).json({ error: 'Payment failed.' }); }
});

module.exports = router;
'@ | Set-Content -Path "src\routes\reservationRoutes.js" -Encoding UTF8
Write-Host "[8/10] reservationRoutes written" -ForegroundColor Cyan

# ── src\routes\farmTourRoutes.js ──────────────────────────────────
@'
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyTourBooked } = require('../services/smsService');

router.get('/', async (req, res) => {
  try {
    const r = await db.query(`SELECT ft.*,u.name as farmer_name,u.phone as farmer_phone FROM farm_tours ft JOIN users u ON ft.farmer_id=u.id WHERE ft.status='active' ORDER BY ft.created_at DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', async (req, res) => {
  const { farmer_phone, farm_type, price, max_visitors, location, available_days, activities, description } = req.body;
  if (!farmer_phone||!farm_type||!price||!max_visitors||!location) return res.status(400).json({ error: 'Missing required fields.' });
  try {
    const u = await db.query(`SELECT id FROM users WHERE phone=$1 AND role='farmer'`, [farmer_phone]);
    if (!u.rows.length) return res.status(404).json({ error: 'Farmer not found.' });
    const r = await db.query(`INSERT INTO farm_tours (farmer_id,farm_type,price,max_visitors,location,available_days,activities,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [u.rows[0].id, farm_type, price, max_visitors, location, available_days||[], activities||[], description||null]);
    res.status(201).json({ message: 'Tour listed.', tour: r.rows[0] });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/:id/book', async (req, res) => {
  const { visitor_phone, visitor_count, visit_date } = req.body;
  if (!visitor_phone||!visit_date) return res.status(400).json({ error: 'visitor_phone and visit_date required.' });
  try {
    const t = await db.query(`SELECT ft.*,u.name as farmer_name,u.phone as farmer_phone FROM farm_tours ft JOIN users u ON ft.farmer_id=u.id WHERE ft.id=$1 AND ft.status='active'`, [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Tour not found.' });
    const tour = t.rows[0];
    const count = parseInt(visitor_count)||1;
    const total = tour.price * count;
    let v = await db.query('SELECT id,name FROM users WHERE phone=$1', [visitor_phone]);
    let visitorId, visitorName;
    if (!v.rows.length) {
      const nv = await db.query(`INSERT INTO users (phone,name,role) VALUES ($1,$2,'visitor') RETURNING id,name`, [visitor_phone,`Visitor${visitor_phone.slice(-4)}`]);
      visitorId=nv.rows[0].id; visitorName=nv.rows[0].name;
    } else { visitorId=v.rows[0].id; visitorName=v.rows[0].name; }
    const b = await db.query(`INSERT INTO tour_bookings (tour_id,visitor_id,visitor_count,visit_date,total_amount) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tour.id, visitorId, count, visit_date, total]);
    await notifyTourBooked(tour.farmer_phone, visitorName, visit_date, count);
    res.status(201).json({ message: 'Tour booked!', booking: b.rows[0], total_amount: total, farmer_contact: tour.farmer_phone });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed.' }); }
});

module.exports = router;
'@ | Set-Content -Path "src\routes\farmTourRoutes.js" -Encoding UTF8
Write-Host "[9/10] farmTourRoutes written" -ForegroundColor Cyan

# ── src\routes\adminRoutes.js ─────────────────────────────────────
@'
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/stats', async (req, res) => {
  try {
    const [farmers,traders,listings,reservations,payments,crops] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE role='farmer'"),
      db.query("SELECT COUNT(*) FROM users WHERE role='trader'"),
      db.query("SELECT COUNT(*) FROM listings WHERE status='active'"),
      db.query("SELECT COUNT(*) FROM reservations"),
      db.query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='completed'"),
      db.query("SELECT product,COUNT(*) as count FROM listings GROUP BY product ORDER BY count DESC LIMIT 5"),
    ]);
    res.json({
      farmers: parseInt(farmers.rows[0].count),
      traders: parseInt(traders.rows[0].count),
      active_listings: parseInt(listings.rows[0].count),
      total_reservations: parseInt(reservations.rows[0].count),
      total_revenue_kes: parseFloat(payments.rows[0].total),
      top_crops: crops.rows,
    });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/users', async (req, res) => {
  const { role } = req.query;
  try {
    let sql = 'SELECT id,name,phone,role,location,is_verified,created_at FROM users';
    const params = [];
    if (role) { sql += ' WHERE role=$1'; params.push(role); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.patch('/users/:id/verify', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_verified=TRUE WHERE id=$1', [req.params.id]);
    res.json({ message: 'User verified.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/listings', async (req, res) => {
  try {
    const r = await db.query(`SELECT l.*,u.name as farmer_name,u.phone as farmer_phone FROM listings l JOIN users u ON l.farmer_id=u.id ORDER BY l.created_at DESC LIMIT 100`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

module.exports = router;
'@ | Set-Content -Path "src\routes\adminRoutes.js" -Encoding UTF8

# ── Stub missing routes the old app.js expects ────────────────────
@'
const express = require('express');
const router = express.Router();
router.post('/mpesa/callback', (req, res) => res.json({ ResultCode: 0 }));
module.exports = router;
'@ | Set-Content -Path "src\routes\paymentRoutes.js" -Encoding UTF8

@'
const express = require('express');
const router = express.Router();
const { handleUSSD } = require('../services/ussdService');
router.post('/', async (req, res) => {
  try {
    const response = await handleUSSD(req.body);
    res.set('Content-Type','text/plain').send(response);
  } catch(e) { res.set('Content-Type','text/plain').send('END Service error. Try again.'); }
});
module.exports = router;
'@ | Set-Content -Path "src\routes\ussdRoutes.js" -Encoding UTF8

@'
const express = require('express');
const router = express.Router();
module.exports = router;
'@ | Set-Content -Path "src\routes\smsRoutes.js" -Encoding UTF8

Write-Host "[10/10] All route files written" -ForegroundColor Cyan

# ── Install jsonwebtoken if missing ───────────────────────────────
Write-Host ""
Write-Host "Installing jsonwebtoken..." -ForegroundColor Yellow
npm install jsonwebtoken --save --silent 2>$null
Write-Host "jsonwebtoken installed" -ForegroundColor Cyan

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ALL FILES WRITTEN SUCCESSFULLY!" -ForegroundColor Green
Write-Host "  Now run: npm run dev" -ForegroundColor Green
Write-Host "  Then open: http://localhost:4000" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
