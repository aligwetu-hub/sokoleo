const express  = require('express');
const router   = express.Router();
const { query } = require('../db/pool');
const COUNTIES  = require('../config/kenya-counties');

// In-memory conversation sessions keyed by WhatsApp number
const sessions = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle expiry

function getSession(phone) {
  const s = sessions.get(phone);
  if (s) { s.lastSeen = Date.now(); return s; }
  const fresh = { state: 'init', data: {}, lastSeen: Date.now() };
  sessions.set(phone, fresh);
  return fresh;
}

function clearSession(phone) {
  sessions.delete(phone);
}

// Purge idle sessions every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [phone, s] of sessions) {
    if (s.lastSeen < cutoff) sessions.delete(phone);
  }
}, 10 * 60 * 1000);

function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escXml(message)}</Message></Response>`;
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('254')) return '+' + digits;
  if (digits.startsWith('0'))   return '+254' + digits.slice(1);
  if (digits.length === 9)      return '+254' + digits;
  return '+' + digits;
}

const allCounties = COUNTIES.getAllCounties().map(c => c.toLowerCase());

function validateCounty(input) {
  const lower = input.trim().toLowerCase();
  return COUNTIES.getAllCounties().find(c => c.toLowerCase() === lower) || null;
}

function validateTown(countyName, input) {
  const towns = COUNTIES.getTowns(countyName);
  const lower = input.trim().toLowerCase();
  return towns.find(t => t.toLowerCase() === lower) || null;
}

// ── MAIN WEBHOOK ────────────────────────────────────────────────────────────────
// POST /api/whatsapp/webhook
router.post('/webhook', async (req, res) => {
  res.set('Content-Type', 'text/xml');

  const from = req.body.From || '';           // e.g. "whatsapp:+254712345678"
  const body = (req.body.Body || '').trim();
  const phone = from.replace('whatsapp:', ''); // "+254712345678"

  if (!phone) return res.send(twiml('Samahani, hatukupata nambari yako. Sorry, your number was not received.'));

  const s = getSession(phone);
  let reply;

  try {
    reply = await handleMessage(phone, s, body);
  } catch (err) {
    console.error('WhatsApp bot error:', err.message);
    reply = 'Kuna hitilafu. Tafadhali jaribu tena baadaye.\nAn error occurred. Please try again later.';
  }

  res.send(twiml(reply));
});

async function handleMessage(phone, s, body) {
  const input = body.toLowerCase().trim();

  // Global exit/reset commands
  if (['0', 'menu', 'main', 'back', 'nyumbani'].includes(input)) {
    s.state = 'init';
    s.data  = {};
    return mainMenu();
  }

  if (['stop', 'quit', 'unsubscribe'].includes(input)) {
    clearSession(phone);
    return 'Umefutwa. Karibu tena ukitaka!\nYou have been unsubscribed. Text us anytime to return!';
  }

  switch (s.state) {

    // ── MAIN MENU ────────────────────────────────────────────────────────────
    case 'init':
      return handleInit(phone, s, input);

    // ── ROLE SELECTION ───────────────────────────────────────────────────────
    case 'role_select':
      return handleRoleSelect(phone, s, input);

    // ── FARMER FLOWS ─────────────────────────────────────────────────────────
    case 'farmer_menu':
      return handleFarmerMenu(phone, s, input);

    case 'farmer_add_product':
    case 'farmer_add_qty':
    case 'farmer_add_price':
    case 'farmer_add_county':
    case 'farmer_add_town':
    case 'farmer_add_confirm':
      return handleFarmerAdd(phone, s, input, body);

    // ── TRADER FLOWS ─────────────────────────────────────────────────────────
    case 'trader_menu':
      return handleTraderMenu(phone, s, input);

    case 'trader_search_county':
    case 'trader_search_results':
      return handleTraderSearch(phone, s, input, body);

    case 'trader_offer_price':
    case 'trader_offer_confirm':
      return handleTraderOffer(phone, s, input, body);

    default:
      s.state = 'init';
      s.data  = {};
      return mainMenu();
  }
}

// ── MAIN MENU ──────────────────────────────────────────────────────────────────
function mainMenu() {
  return (
    '🌾 *SokoLeo* — Soko la Wakulima Kenya\n\n' +
    'Karibu! / Welcome!\n\n' +
    '1️⃣  Mkulima (Farmer)\n' +
    '2️⃣  Trader / Mfanyabiashara\n' +
    '3️⃣  Msaada (Help)\n\n' +
    'Jibu nambari / Reply with number'
  );
}

async function handleInit(phone, s, input) {
  // Check if user already exists in DB
  try {
    const res = await query(`SELECT id, name, role FROM users WHERE phone=$1`, [phone]);
    if (res.rows.length) {
      const user = res.rows[0];
      s.data.userId = user.id;
      s.data.name   = user.name;
      s.data.role   = user.role;
      if (user.role === 'farmer') {
        s.state = 'farmer_menu';
        return `Habari ${user.name}! 👋\n\n` + farmerMenu();
      }
      if (user.role === 'trader') {
        s.state = 'trader_menu';
        return `Habari ${user.name}! 👋\n\n` + traderMenu();
      }
    }
  } catch (_) { /* proceed to new user flow */ }

  s.state = 'role_select';
  return mainMenu();
}

async function handleRoleSelect(phone, s, input) {
  if (input === '1' || input.includes('farmer') || input.includes('mkulima')) {
    s.data.role = 'farmer';
    s.state     = 'farmer_menu';
    // Register minimal account
    await ensureUser(phone, s, 'farmer');
    return `Umechaguliwa kama *Mkulima* ✅\nYou are registered as a *Farmer*.\n\n` + farmerMenu();
  }
  if (input === '2' || input.includes('trader') || input.includes('biashara')) {
    s.data.role = 'trader';
    s.state     = 'trader_menu';
    await ensureUser(phone, s, 'trader');
    return `Umechaguliwa kama *Trader* ✅\nYou are registered as a *Trader*.\n\n` + traderMenu();
  }
  if (input === '3' || input.includes('help') || input.includes('msaada')) {
    return helpText();
  }
  return 'Jibu 1, 2, au 3.\nPlease reply 1, 2, or 3.\n\n' + mainMenu();
}

async function ensureUser(phone, s, role) {
  try {
    const existing = await query(`SELECT id FROM users WHERE phone=$1`, [phone]);
    if (existing.rows.length) {
      s.data.userId = existing.rows[0].id;
      return;
    }
    const res = await query(
      `INSERT INTO users (phone, name, role, is_verified, created_at)
       VALUES ($1, $2, $3, FALSE, NOW()) RETURNING id`,
      [phone, `WA-${phone.slice(-4)}`, role]
    );
    s.data.userId = res.rows[0].id;
  } catch (err) {
    console.error('ensureUser error:', err.message);
  }
}

// ── FARMER ────────────────────────────────────────────────────────────────────
function farmerMenu() {
  return (
    '🌱 *Menyu ya Mkulima*\n\n' +
    '1️⃣  Ongeza Mazao (Add Produce)\n' +
    '2️⃣  Mazao Yangu (My Listings)\n' +
    '3️⃣  Maagizo Yangu (My Orders)\n\n' +
    '0️⃣  Rudi Menyu / Main Menu'
  );
}

async function handleFarmerMenu(phone, s, input) {
  if (input === '1' || input.includes('ongeza') || input.includes('add')) {
    s.state = 'farmer_add_product';
    s.data.listing = {};
    return '🌾 Jina la zao lako ni nini?\nWhat is your produce? (e.g. Maize, Tomatoes, Beans)';
  }
  if (input === '2' || input.includes('mazao') || input.includes('listing')) {
    return await showFarmerListings(s);
  }
  if (input === '3' || input.includes('maagizo') || input.includes('order')) {
    return await showFarmerOrders(s);
  }
  return 'Jibu 1, 2, au 3.\n\n' + farmerMenu();
}

async function handleFarmerAdd(phone, s, input, body) {
  const listing = s.data.listing || {};

  if (s.state === 'farmer_add_product') {
    if (body.trim().length < 2) return '❌ Jina la zao ni fupi sana. Please enter a valid produce name.';
    listing.product = body.trim();
    s.data.listing  = listing;
    s.state         = 'farmer_add_qty';
    return `✅ Zao: *${listing.product}*\n\nKiasi gani? / What quantity?\n(e.g. 50 bags, 200 kg, 10 crates)`;
  }

  if (s.state === 'farmer_add_qty') {
    if (body.trim().length < 1) return '❌ Weka kiasi. Enter a quantity.';
    listing.quantity_text = body.trim();
    s.data.listing = listing;
    s.state        = 'farmer_add_price';
    return `✅ Kiasi: *${listing.quantity_text}*\n\nBei kwa kiasi kimoja? / Price per unit? (KES)\n(e.g. 3000 per bag, 50 per kg)`;
  }

  if (s.state === 'farmer_add_price') {
    const price = parseFloat(body.replace(/[^\d.]/g, ''));
    if (isNaN(price) || price <= 0) return '❌ Weka bei sahihi. Enter a valid price (numbers only). e.g. 3000';
    listing.price  = price;
    s.data.listing = listing;
    s.state        = 'farmer_add_county';
    const sample = COUNTIES.getAllCounties().slice(0, 5).join(', ');
    return `✅ Bei: *KES ${price}*\n\nUko kaunti gani? / Which county?\n(e.g. ${sample}, ...)\n\nAndika jina la kaunti yako.`;
  }

  if (s.state === 'farmer_add_county') {
    const county = validateCounty(body);
    if (!county) {
      const hint = COUNTIES.getAllCounties().slice(0, 8).join(', ');
      return `❌ Kaunti *${body.trim()}* haipatikani.\nCounty not found. Try: ${hint}...`;
    }
    listing.county = county;
    listing.region = COUNTIES.getRegion(county);
    s.data.listing = listing;
    s.state        = 'farmer_add_town';
    const towns = COUNTIES.getTowns(county).slice(0, 6).join(', ');
    return `✅ Kaunti: *${county}*\n\nMji gani? / Which town?\n(${towns})`;
  }

  if (s.state === 'farmer_add_town') {
    const town = validateTown(listing.county, body);
    const location = town || body.trim();
    listing.location = location;
    s.data.listing   = listing;
    s.state          = 'farmer_add_confirm';
    return (
      `📋 *Thibitisha orodha yako:*\n\n` +
      `🌾 Zao: ${listing.product}\n` +
      `📦 Kiasi: ${listing.quantity_text}\n` +
      `💰 Bei: KES ${listing.price}\n` +
      `📍 ${listing.location}, ${listing.county}\n\n` +
      `Jibu *YES* kuthibitisha au *NO* kufuta.\nReply *YES* to confirm or *NO* to cancel.`
    );
  }

  if (s.state === 'farmer_add_confirm') {
    if (['yes', 'ndio', 'y', '1'].includes(input)) {
      const result = await saveListing(s);
      s.state = 'farmer_menu';
      s.data.listing = {};
      if (result.success) {
        return `✅ Orodha imehifadhiwa!\nYour listing is live on SokoLeo! 🎉\n\nWabiashara watakuona hivi karibuni.\nTraders can now find your produce.\n\n` + farmerMenu();
      }
      return `❌ Hitilafu ya hifadhi. Jaribu tena.\nFailed to save listing. Please try again.\n\n` + farmerMenu();
    }
    if (['no', 'hapana', 'n', '0'].includes(input)) {
      s.state = 'farmer_menu';
      s.data.listing = {};
      return `❌ Imefutwa. Cancelled.\n\n` + farmerMenu();
    }
    return 'Jibu *YES* au *NO*.';
  }

  s.state = 'farmer_menu';
  return farmerMenu();
}

async function saveListing(s) {
  try {
    const l = s.data.listing;
    await query(
      `INSERT INTO listings (farmer_id, product, quantity_text, price, location, county, region, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())`,
      [s.data.userId, l.product, l.quantity_text, l.price, l.location, l.county, l.region]
    );
    return { success: true };
  } catch (err) {
    console.error('saveListing error:', err.message);
    return { success: false, error: err.message };
  }
}

async function showFarmerListings(s) {
  try {
    const res = await query(
      `SELECT product, quantity_text, price, location, county, status, created_at
       FROM listings WHERE farmer_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [s.data.userId]
    );
    if (!res.rows.length) return '📭 Huna orodha bado.\nYou have no listings yet.\n\n' + farmerMenu();
    const lines = res.rows.map((r, i) =>
      `${i + 1}. *${r.product}* — KES ${r.price} | ${r.quantity_text} | ${r.location || r.county} [${r.status}]`
    );
    return `📋 *Mazao Yako (${res.rows.length}):*\n\n${lines.join('\n')}\n\n` + farmerMenu();
  } catch (err) {
    return '❌ Hitilafu. Error fetching listings.\n\n' + farmerMenu();
  }
}

async function showFarmerOrders(s) {
  try {
    const res = await query(
      `SELECT r.id, u.name as trader_name, l.product, r.quantity, r.status, r.created_at
       FROM reservations r
       JOIN listings l ON r.listing_id = l.id
       JOIN users u ON r.trader_id = u.id
       WHERE l.farmer_id=$1 ORDER BY r.created_at DESC LIMIT 5`,
      [s.data.userId]
    );
    if (!res.rows.length) return '📭 Hakuna maagizo bado.\nNo orders yet.\n\n' + farmerMenu();
    const lines = res.rows.map((r, i) =>
      `${i + 1}. *${r.product}* — Trader: ${r.trader_name} | Qty: ${r.quantity} | [${r.status}]`
    );
    return `📦 *Maagizo Yako (${res.rows.length}):*\n\n${lines.join('\n')}\n\n` + farmerMenu();
  } catch (err) {
    return '❌ Hitilafu. Error fetching orders.\n\n' + farmerMenu();
  }
}

// ── TRADER ────────────────────────────────────────────────────────────────────
function traderMenu() {
  return (
    '🛒 *Menyu ya Trader*\n\n' +
    '1️⃣  Tafuta kwa Kaunti (Search by County)\n' +
    '2️⃣  Tafuta Zao (Search by Produce)\n' +
    '3️⃣  Maombi Yangu (My Offers)\n\n' +
    '0️⃣  Rudi Menyu / Main Menu'
  );
}

async function handleTraderMenu(phone, s, input) {
  if (input === '1' || input.includes('kaunti') || input.includes('county')) {
    s.state = 'trader_search_county';
    s.data.searchMode = 'county';
    const sample = COUNTIES.getAllCounties().slice(0, 5).join(', ');
    return `🔍 Tafuta kwa kaunti.\nSearch by county.\n\nAndika jina la kaunti: (e.g. ${sample})`;
  }
  if (input === '2' || input.includes('zao') || input.includes('produce')) {
    s.state = 'trader_search_county';
    s.data.searchMode = 'product';
    return '🔍 Andika jina la zao unalotaka:\nEnter the produce name you want: (e.g. Maize, Tomatoes)';
  }
  if (input === '3' || input.includes('maombi') || input.includes('offer')) {
    return await showTraderOffers(s);
  }
  return 'Jibu 1, 2, au 3.\n\n' + traderMenu();
}

async function handleTraderSearch(phone, s, input, body) {
  if (s.state === 'trader_search_county') {
    if (s.data.searchMode === 'county') {
      const county = validateCounty(body);
      if (!county) {
        const hint = COUNTIES.getAllCounties().slice(0, 8).join(', ');
        return `❌ Kaunti *${body.trim()}* haipatikani.\nTry: ${hint}...`;
      }
      s.data.searchCounty = county;
      s.state = 'trader_search_results';
      return await searchListingsByCounty(s, county, null);
    }
    // product search
    s.data.searchProduct = body.trim();
    s.state = 'trader_search_results';
    return await searchListingsByProduct(s, body.trim());
  }

  if (s.state === 'trader_search_results') {
    // User picks a listing number to make an offer
    const idx = parseInt(input) - 1;
    const results = s.data.searchResults || [];
    if (idx >= 0 && idx < results.length) {
      s.data.selectedListing = results[idx];
      s.state = 'trader_offer_price';
      const l = results[idx];
      return (
        `📦 *${l.product}*\n` +
        `📍 ${l.location || l.county}\n` +
        `💰 Bei ya mkulima: KES ${l.price} / ${l.quantity_text}\n` +
        `👤 Mkulima: ${l.farmer_name}\n\n` +
        `Toa bei yako (KES):\nEnter your offer price (KES):`
      );
    }
    if (['0', 'back'].includes(input)) {
      s.state = 'trader_menu';
      return traderMenu();
    }
    return `Chagua nambari 1-${results.length}, au 0 kurudi.\nPick 1-${results.length}, or 0 to go back.`;
  }
}

async function searchListingsByCounty(s, county, product) {
  try {
    let sql = `SELECT l.id, l.product, l.quantity_text, l.price, l.location, l.county, u.name as farmer_name
               FROM listings l JOIN users u ON l.farmer_id = u.id
               WHERE l.status='active' AND l.county ILIKE $1`;
    const params = [county];
    if (product) { sql += ` AND l.product ILIKE $2`; params.push(`%${product}%`); }
    sql += ` ORDER BY l.created_at DESC LIMIT 8`;
    const res = await query(sql, params);
    return formatListingResults(s, res.rows, `kaunti ya ${county}`);
  } catch (err) {
    return '❌ Hitilafu. Error searching.\n\n' + traderMenu();
  }
}

async function searchListingsByProduct(s, product) {
  try {
    const res = await query(
      `SELECT l.id, l.product, l.quantity_text, l.price, l.location, l.county, u.name as farmer_name
       FROM listings l JOIN users u ON l.farmer_id = u.id
       WHERE l.status='active' AND l.product ILIKE $1
       ORDER BY l.created_at DESC LIMIT 8`,
      [`%${product}%`]
    );
    return formatListingResults(s, res.rows, product);
  } catch (err) {
    return '❌ Hitilafu. Error searching.\n\n' + traderMenu();
  }
}

function formatListingResults(s, rows, label) {
  if (!rows.length) {
    s.state = 'trader_menu';
    return `😔 Hakuna matokeo ya *${label}*.\nNo listings found for *${label}*.\n\n` + traderMenu();
  }
  s.data.searchResults = rows;
  const lines = rows.map((r, i) =>
    `${i + 1}. *${r.product}* — KES ${r.price} | ${r.quantity_text} | ${r.location || r.county}`
  );
  return (
    `🔍 *Matokeo (${rows.length}):*\n\n` +
    lines.join('\n') +
    `\n\nChagua nambari kufanya ombi / Pick a number to make an offer.\n0 = Rudi / Back`
  );
}

async function handleTraderOffer(phone, s, input, body) {
  if (s.state === 'trader_offer_price') {
    const price = parseFloat(body.replace(/[^\d.]/g, ''));
    if (isNaN(price) || price <= 0) return '❌ Weka bei sahihi. Enter a valid price. e.g. 2500';
    s.data.offerPrice = price;
    s.state = 'trader_offer_confirm';
    const l = s.data.selectedListing;
    return (
      `📋 *Thibitisha Ombi Lako:*\n\n` +
      `🌾 ${l.product} — ${l.quantity_text}\n` +
      `💰 Bei yako: KES ${price}\n` +
      `👤 Mkulima: ${l.farmer_name}\n\n` +
      `Jibu *YES* kuthibitisha au *NO* kufuta.\nReply *YES* to confirm or *NO* to cancel.`
    );
  }

  if (s.state === 'trader_offer_confirm') {
    if (['yes', 'ndio', 'y', '1'].includes(input)) {
      const result = await saveReservation(s);
      s.state = 'trader_menu';
      if (result.success) {
        return `✅ Ombi limetumwa kwa mkulima!\nOffer sent to farmer! 🎉\n\nWatawasiliana nawe hivi karibuni.\nThey will contact you soon.\n\n` + traderMenu();
      }
      return `❌ Hitilafu. Failed to send offer.\n\n` + traderMenu();
    }
    if (['no', 'hapana', 'n', '0'].includes(input)) {
      s.state = 'trader_menu';
      return `❌ Ombi limefutwa. Cancelled.\n\n` + traderMenu();
    }
    return 'Jibu *YES* au *NO*.';
  }
}

async function saveReservation(s) {
  try {
    const l = s.data.selectedListing;
    await query(
      `INSERT INTO reservations (listing_id, trader_id, quantity, price_offered, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [l.id, s.data.userId, l.quantity_text, s.data.offerPrice]
    );
    return { success: true };
  } catch (err) {
    console.error('saveReservation error:', err.message);
    return { success: false };
  }
}

async function showTraderOffers(s) {
  try {
    const res = await query(
      `SELECT r.id, l.product, l.county, r.price_offered, r.status, r.created_at
       FROM reservations r
       JOIN listings l ON r.listing_id = l.id
       WHERE r.trader_id=$1 ORDER BY r.created_at DESC LIMIT 5`,
      [s.data.userId]
    );
    if (!res.rows.length) return '📭 Huna maombi bado.\nNo offers yet.\n\n' + traderMenu();
    const lines = res.rows.map((r, i) =>
      `${i + 1}. *${r.product}* — KES ${r.price_offered} | ${r.county} | [${r.status}]`
    );
    return `📋 *Maombi Yako (${res.rows.length}):*\n\n${lines.join('\n')}\n\n` + traderMenu();
  } catch (err) {
    return '❌ Hitilafu. Error fetching offers.\n\n' + traderMenu();
  }
}

function helpText() {
  return (
    '❓ *SokoLeo Msaada / Help*\n\n' +
    '• Andika *1* kwa Mkulima (Farmer)\n' +
    '• Andika *2* kwa Trader\n' +
    '• Andika *0* au *menu* kurudi menyu kuu\n' +
    '• Andika *STOP* kujiondoa\n\n' +
    '📞 Maswali: WhatsApp hii nambari\n' +
    '🌐 sokoleo.onrender.com'
  );
}

module.exports = router;
