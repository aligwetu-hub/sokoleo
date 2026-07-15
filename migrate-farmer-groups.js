cat /tmp/sokoleo/migrate-farmer-groups.js
Output

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running farmer groups migration...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS farmer_groups (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(150) NOT NULL,
        county VARCHAR(50),
        town VARCHAR(50),
        physical_address TEXT,
        contact_person VARCHAR(100),
        contact_phone VARCHAR(20),
        is_verified BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ farmer_groups created');

    // A farmer's standing affiliation with a group (nullable — most farmers have none)
    await client.query(`
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES farmer_groups(id);
    `);
    console.log('✅ farmers.group_id added');

    // Per-listing choice: only set when produce is actually stored/sold through the group.
    // A farmer who belongs to a group can still list independently by leaving this null.
    await client.query(`
      ALTER TABLE listings ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES farmer_groups(id);
    `);
    console.log('✅ listings.group_id added');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_farmers_group ON farmers(group_id);
      CREATE INDEX IF NOT EXISTS idx_listings_group ON listings(group_id);
    `);
    console.log('✅ Indexes created');

    // Seed the first real group
    await client.query(`
      INSERT INTO farmer_groups (name, county, town, physical_address, contact_person, contact_phone, is_verified)
      VALUES ('Tunyai Farmers Association', 'Tharaka Nithi', 'Tunyai', 'Tunyai Trading Centre', NULL, NULL, FALSE)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Tunyai Farmers Association seeded (unverified — mark verified once contact/address confirmed)');

    console.log('\n✅ Farmer groups migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
Done
Commit directly to main. Now the second new file — open https://github.com/aligwetu-hub/sokoleo/new/main?filename=src/routes/groupRoutes.js and paste:


Ran a command
Ran a command

Ran command
bash

cat /tmp/sokoleo/src/routes/groupRoutes.js
Output

const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');

// GET /api/groups?county= - list/search farmer groups
router.get('/', async (req, res) => {
  try {
    const { county } = req.query;
    const conditions = [`status='active'`];
    const params = [];
    if (county) { params.push(county); conditions.push(`LOWER(county)=LOWER($${params.length})`); }
    const result = await query(
      `SELECT * FROM farmer_groups WHERE ${conditions.join(' AND ')} ORDER BY is_verified DESC, name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List groups error:', err.message);
    res.status(500).json({ error: 'Failed to fetch groups.' });
  }
});

// GET /api/groups/:id - single group detail
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM farmer_groups WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group.' });
  }
});

// POST /api/groups/register - register a new farmer group
router.post('/register', async (req, res) => {
  const { name, county, town, physical_address, contact_person, contact_phone } = req.body;
  if (!name || !county || !town) {
    return res.status(400).json({ error: 'name, county, and town are required.' });
  }
  try {
    const result = await query(
      `INSERT INTO farmer_groups (name, county, town, physical_address, contact_person, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, county, town, physical_address || null, contact_person || null, contact_phone || null]
    );
    res.status(201).json({ success: true, group: result.rows[0] });
  } catch (err) {
    console.error('Register group error:', err.message);
    res.status(500).json({ error: 'Failed to register group.' });
  }
});

// PATCH /api/groups/assign/:user_id - set (or clear) a farmer's group affiliation
// Body: { group_id } — pass group_id: null to remove a farmer from a group.
router.patch('/assign/:user_id', async (req, res) => {
  const { group_id } = req.body;
  try {
    if (group_id) {
      const groupRes = await query(`SELECT id FROM farmer_groups WHERE id=$1 AND status='active'`, [group_id]);
      if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    }
    const result = await query(
      `UPDATE farmers SET group_id=$1 WHERE user_id=$2 RETURNING *`,
      [group_id || null, req.params.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Farmer profile not found.' });
    res.json({ success: true, farmer: result.rows[0] });
  } catch (err) {
    console.error('Assign group error:', err.message);
    res.status(500).json({ error: 'Failed to update group affiliation.' });
  }
});

// GET /api/groups/:id/summary?product= - aggregate active listings for a group
// e.g. { product: 'Maize', total_quantity: 340, unit: 'bags', farmer_count: 12 }
router.get('/:id/summary', async (req, res) => {
  try {
    const { product } = req.query;
    const conditions = [`l.group_id = $1`, `l.status = 'active'`, `l.expires_at > NOW()`];
    const params = [req.params.id];
    if (product) { params.push(product); conditions.push(`LOWER(l.product) = LOWER($${params.length})`); }

    const result = await query(
      `SELECT l.product, l.unit,
              SUM(l.quantity) AS total_quantity,
              COUNT(DISTINCT l.farmer_id) AS farmer_count,
              COUNT(*) AS listing_count
       FROM listings l
       WHERE ${conditions.join(' AND ')}
       GROUP BY l.product, l.unit
       ORDER BY total_quantity DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Group summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch group summary.' });
  }
});

module.exports = router;
Done
Commit that directly to main too.

Step 2 — two one-line additions.

In public/api-config.js (https://github.com/aligwetu-hub/sokoleo/edit/main/public/api-config.js), find:

  pickup:         '/api/pickup',
and add this line right after it:

  groups:         '/api/groups',
In src/app.js (https://github.com/aligwetu-hub/sokoleo/edit/main/src/app.js), find:

const pickupRoutes      = require('./routes/pickupRoutes');
add right after it:

const groupRoutes       = require('./routes/groupRoutes');
then further down find:

app.use('/api/pickup',      pickupRoutes);
and add right after it:

app.use('/api/groups',       groupRoutes);
Commit both directly to main.

Step 3 — src/routes/authRoutes.js (https://github.com/aligwetu-hub/sokoleo/edit/main/src/routes/authRoutes.js). Find this block:


Ran a command, updated tasks
Ran a command, updated tasks

Ran command
bash

cd /tmp/sokoleo && git show main:src/routes/authRoutes.js | sed -n '185,196p'
Output

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

Added task

Result
Done
Replace it with:


Ran a command
Ran a command
Commit that directly to main.

Step 4 — src/routes/listingRoutes.js (https://github.com/aligwetu-hub/sokoleo/edit/main/src/routes/listingRoutes.js). Three separate find-and-replace edits in this one file:

4a. Find:

js
router.get('/', async (req, res) => {
  const { product, location, availability, county, town, page = 1, limit = 20 } = req.query;
Replace with:

js
router.get('/', async (req, res) => {
  const { product, location, availability, county, town, group_id, page = 1, limit = 20 } = req.query;
4b. Find:

js
    if (availability) { conditions.push(`l.availability = $${i++}`); params.push(availability); }
Add this line right after it:

js
    if (group_id)     { conditions.push(`l.group_id = $${i++}`);     params.push(group_id); }
Then a bit further down, find:


Ran a command
Ran a command
Replace this whole block with:


Ran a command
Ran a command
4c. Further down, find:


Ran a command
Ran a command
Replace lines 73-95 (from router.post('/'... down through the INSERT INTO listings... closing );) with:


Ran a command, updated tasks
Ran a command, updated tasks
Commit that, and listingRoutes.js is done. Step 5 — public/farmer.html (https://github.com/aligwetu-hub/sokoleo/edit/main/public/farmer.html) — three separate edits in this one file.

5a. Find this (in the Add Listing form, right after the Town/Sub-county dropdown):


Ran a command
Ran a command
Right after the closing </div> of that Town/Sub-county block (before <div class="form-group full"><label>Description...), insert this new block:


Ran a command
Ran a command
So the full new block to paste in (right before the Description field's <div>) is:

html
<div class="form-group full" id="lGroupWrap" style="display:none">
  <label>Sell through your group?</label>
  <select id="lGroup">
    <option value="">No — sell independently</option>
  </select>
  <p style="font-size:12px;color:var(--muted);margin-top:4px;">
    If your produce is stored at your group's collection point, select it here so buyers can find it alongside other members' listings.
  </p>
</div>
5b. Find:

js
    loadFarmerCounties();
    loadOverview();
  }
Replace with:

js
    loadFarmerCounties();
    loadFarmerGroupInfo();
    loadOverview();
  }

  // ── Farmer group affiliation ────────────────────────────────────────
  let farmerGroupId = null;
  async function loadFarmerGroupInfo() {
    if (isDemoMode || !currentUser || !currentUser.phone) return;
    try {
      const u = await apiFetch(`${SOKOLEO_API.auth}/user/${currentUser.phone}`);
      farmerGroupId = u.group_id || null;
      const wrap = document.getElementById('lGroupWrap');
      const sel  = document.getElementById('lGroup');
      if (farmerGroupId && u.group_name) {
        sel.innerHTML = `
          <option value="">No — sell independently</option>
          <option value="${farmerGroupId}">Yes — ${u.group_name}${u.group_verified ? ' ✅' : ''}</option>
        `;
        wrap.style.display = 'block';
      } else {
        wrap.style.display = 'none';
      }
    } catch { /* not fatal — just keep the group field hidden */ }
  }
5c. Find:


Ran 3 commands
Ran 3 commands
Find this block (in the submitListing function):

js
    const desc     = document.getElementById('lDescription').value.trim();

    if (!product || !qty || !county || !location)
      return showMsg('listingMsg', 'Product, quantity, county and town are required.', 'error');

    try {
      const r = await fetch(`${BASE}${SOKOLEO_API.listings}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: currentUser.id, product, quantity: qty, unit,
          price_per_unit: price || null, availability: avail,
          location, county, region, description: desc,
          photo_url: listingPhotoBase64 || null,
        })
      });
Replace with:


Ran a command
Ran a command
Commit that, and farmer.html is done. Step 6 — public/trader.html (https://github.com/aligwetu-hub/sokoleo/edit/main/public/trader.html) — four edits in this file.

6a. Find:


Ran a command
Ran a command
Replace with:

html
        <select id="filterTown" onchange="searchListings()" disabled>
          <option value="">All Towns</option>
        </select>
        <select id="filterGroup" onchange="searchListings()">
          <option value="">All Sellers (Groups + Independent)</option>
        </select>
      </div>
      <div id="groupSummaryBar" style="display:none;margin-bottom:12px;"></div>
      <div class="market-grid" id="marketGrid">
        <div class="loading"><span class="spinner"></span> Loading produce...</div>
      </div>
    </div>
6b. Find:


Ran a command
Ran a command
Replace with:

js
    document.getElementById('sidebarName').textContent = n;
    document.getElementById('sidebarAvatar').textContent = n[0].toUpperCase();
    document.getElementById('topbarName').textContent = n;
    document.getElementById('topbarAvatar').textContent = n[0].toUpperCase();
    loadCountiesData();
    loadGroupsFilter();
    loadMarket();
  }

  // ── Farmer Groups ─────────────────────────────────────────────────────────
  let TRADER_GROUPS = [];
  async function loadGroupsFilter() {
    try {
      TRADER_GROUPS = await apiFetch(SOKOLEO_API.groups);
      const sel = document.getElementById('filterGroup');
      TRADER_GROUPS.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = `${g.name}${g.is_verified ? ' ✅' : ''} — ${g.town || g.county || ''}`;
        sel.appendChild(opt);
      });
    } catch { /* filter just stays empty if this fails */ }
  }

  // ── Kenya Counties ────────────────────────────────────────────────────────
  let KENYA_DATA = null;

  async function loadCountiesData() {
6c. Find:


Ran 2 commands
Ran 2 commands
Find this (the start of loadMarket() through the if (!data.length) line):

js
  async function loadMarket() {
    const q      = document.getElementById('searchQuery').value.trim();
    const avail  = document.getElementById('filterAvail').value;
    const county = document.getElementById('filterCounty').value;
    const town   = document.getElementById('filterTown').value;
    let url = `/api/listings?status=active`;
    if (q)      url += `&product=${encodeURIComponent(q)}`;
    if (avail)  url += `&availability=${avail}`;
    if (county) url += `&county=${encodeURIComponent(county)}`;
    if (town)   url += `&town=${encodeURIComponent(town)}`;
    const el = document.getElementById('marketGrid');
    el.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    try {
      const data = await apiFetch(url);
      if (!data.length) { el.innerHTML = emptyState('No produce found matching your search.'); return; }
Replace with:


Ran a command
Ran a command
js
  async function loadMarket() {
    const q       = document.getElementById('searchQuery').value.trim();
    const avail   = document.getElementById('filterAvail').value;
    const county  = document.getElementById('filterCounty').value;
    const town    = document.getElementById('filterTown').value;
    const groupId = document.getElementById('filterGroup').value;
    let url = `/api/listings?status=active`;
    if (q)       url += `&product=${encodeURIComponent(q)}`;
    if (avail)   url += `&availability=${avail}`;
    if (county)  url += `&county=${encodeURIComponent(county)}`;
    if (town)    url += `&town=${encodeURIComponent(town)}`;
    if (groupId) url += `&group_id=${encodeURIComponent(groupId)}`;
    const el = document.getElementById('marketGrid');
    el.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
    updateGroupSummaryBar(groupId, q);
    try {
      const data = await apiFetch(url);
      if (!data.length) { el.innerHTML = emptyState('No produce found matching your search.'); return; }
6d. Two smaller finds in the same file. First, find:

js
            <span>🌾 ${l.farmer_name || 'Farmer'} &nbsp;${(() => {
Add this line right before it:

js
            ${l.group_name ? `<span>👥 <strong>${l.group_name}</strong></span>` : ''}
Then find:

js
  function searchListings() { clearTimeout(window._searchTimer); window._searchTimer = setTimeout(loadMarket, 400); }
Replace with:


Ran a command
Ran a command
js
  async function updateGroupSummaryBar(groupId, product) {
    const bar = document.getElementById('groupSummaryBar');
    if (!groupId) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    try {
      let url = `${SOKOLEO_API.groups}/${groupId}/summary`;
      if (product) url += `?product=${encodeURIComponent(product)}`;
      const rows = await apiFetch(url);
      if (!rows.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
      const group = TRADER_GROUPS.find(g => g.id === groupId);
      const groupLabel = group ? group.name : 'Group';
      bar.innerHTML = `
        <div class="card" style="padding:12px 16px;background:rgba(74,222,128,.06);border-color:rgba(74,222,128,.25);">
          <strong>👥 ${groupLabel}:</strong>
          ${rows.map(r => `${Number(r.total_quantity).toLocaleString()} ${r.unit || 'units'} ${r.product} across ${r.farmer_count} farmer${r.farmer_count == 1 ? '' : 's'}`).join(' &nbsp;·&nbsp; ')}
        </div>`;
      bar.style.display = 'block';
    } catch { bar.style.display = 'none'; bar.innerHTML = ''; }
  }

  function searchListings() { clearTimeout(window._searchTimer); window._searchTimer = setTimeout(loadMarket, 400); }
That's all 8 files. Last step — run the database migration. This one can't be done through GitHub since it needs to run against your live Neon database. On your own machine (or anywhere with DATABASE_URL set to your production database), run:

node migrate-farmer-groups.js
That creates the farmer_groups table, adds the two group_id columns, and seeds Tunyai Farmers Association. Once Render redeploys and that migration has run, the feature is live — let me know when both are done and I'll verify it end-to-end the same way I checked the last deploy.


Updated tasks
Updated tasks
All 8 files and the migration command are laid out above — that completes the walkthrough for the farmer groups feature (Tunyai Farmers Association seeded, group filter, aggregate summary, everything we scoped).

Once you've applied the edits, committed to main, and run node migrate-farmer-groups.js against your production database, let me know and I'll check the live site the same way I verified the mobile nav and cache fixes earlier.

''GitHub personal access token into a session so I can authenticate the sandbox, or install a GitHub connector if one becomes available — either would let me commit and push directly instead of walking you through GitHub's web UI each time.'' Guide me through


Thought process
Thought process
Here's the full walkthrough for creating a scoped token — it only takes about a minute.

Go to https://github.com/settings/personal-access-tokens/new (make sure you're logged into the GitHub account that owns the sokoleo repo).
Token name — type something like "SokoLeo Claude access" so you remember what it's for later.
Expiration — pick 30 or 90 days. Shorter is safer; you can always generate a new one later.
Resource owner — leave it on your account (the one that owns aligwetu-hub/sokoleo).
Repository access — select "Only select repositories", then in the dropdown that appears, pick sokoleo. This is the important part — it means the token can't touch any of your other repos, only this one.
Scroll down to "Repository permissions", find "Contents" in the list, and change it from "No access" to "Read and write". You can leave everything else as-is.
Scroll to the bottom and click "Generate token".
GitHub shows you the token exactly once — it starts with github_pat_.... Copy it now.
Paste it here in the chat.
A couple of honest notes: treat it like a password — don't post it anywhere public. Because it's scoped to just this one repo with read/write on contents, even in the worst case the damage is contained to sokoleo. You can revoke it anytime from that same settings page if you ever want to cut off access. Also, since my sandbox here doesn't persist between sessions, you'd need to paste a token again next time you start a new conversation and want me to push directly — this isn't a one-time permanent grant.

Once I have it, I can push the farmer-groups branch we already built directly (if you haven't finished applying it by hand yet), and handle future changes the same way instead of walking through GitHub's UI each time.



