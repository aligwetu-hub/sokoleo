// routes/livestockRoutes.js
const express = require('express');
const router  = express.Router();
const pool = require('../db/client');

// ═══════════════════════════════════════════════════════
// ANIMALS
// ═══════════════════════════════════════════════════════

// GET /api/livestock/animals — all active animals for sale (trader view)
router.get('/animals', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.full_name AS farmer_name, u.phone AS farmer_phone
      FROM animals a
      JOIN users u ON a.owner_id = u.id
      WHERE a.status IN ('active','for_sale')
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/livestock/animals/farmer/:farmerId — farmer's own herd
router.get('/animals/farmer/:farmerId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM animals WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.params.farmerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/livestock/animals — register new animal
router.post('/animals', async (req, res) => {
  const {
    owner_id, species, breed, sub_species, name, sex, dob, weight,
    rfid_tag, chip_location, production_stage, pedigree_no, kennel_no,
    dog_category, bcs, last_deworm, withholding_expiry, vet_cert,
    health_notes, vaccinations, sub_county, landmark, gps_lat, gps_lng,
    purchase_price, market_value, insurer, policy_no, ai_weight,
    ai_bcs, ai_age_estimate, lameness_risk, passport_id
  } = req.body;

  if (!owner_id || !species || !breed) {
    return res.status(400).json({ error: 'owner_id, species and breed are required' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO animals (
        owner_id, species, breed, sub_species, name, sex, dob, weight,
        rfid_tag, chip_location, production_stage, pedigree_no, kennel_no,
        dog_category, bcs, last_deworm, withholding_expiry, vet_cert,
        health_notes, vaccinations, sub_county, landmark, gps_lat, gps_lng,
        purchase_price, market_value, insurer, policy_no,
        ai_weight, ai_bcs, ai_age_estimate, lameness_risk,
        passport_id, status, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,'active',NOW()
      ) RETURNING *`,
      [
        owner_id, species, breed, sub_species||null, name, sex, dob||null, weight||null,
        rfid_tag||null, chip_location||null, production_stage||null,
        pedigree_no||null, kennel_no||null, dog_category||null,
        bcs||null, last_deworm||null, withholding_expiry||null, vet_cert||null,
        health_notes||null, JSON.stringify(vaccinations||[]),
        sub_county||null, landmark||null, gps_lat||null, gps_lng||null,
        purchase_price||null, market_value||null, insurer||null, policy_no||null,
        ai_weight||null, ai_bcs||null, ai_age_estimate||null, lameness_risk||null,
        passport_id||('DHP-KE-'+Date.now().toString(36).toUpperCase())
      ]
    );
    res.status(201).json({ success: true, animal: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/livestock/animals/:id/status — update status (active/for_sale/sold)
router.patch('/animals/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active','for_sale','sold','reserved'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    const r = await pool.query(
      `UPDATE animals SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]
    );
    res.json({ success: true, animal: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/livestock/animals/:id
router.delete('/animals/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM animals WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════
// LIVESTOCK SALE LISTINGS
// ═══════════════════════════════════════════════════════

// GET /api/livestock/sale — all animals listed for sale (trader browse)
router.get('/sale', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ls.*, a.species, a.breed, a.sub_species, a.name AS animal_name,
             a.sex, a.dob, a.weight, a.ai_weight, a.bcs, a.ai_bcs,
             a.ai_age_estimate, a.lameness_risk, a.passport_id,
             a.vaccinations, a.health_notes, a.production_stage,
             a.dog_category, a.rfid_tag, a.kennel_no,
             u.full_name AS farmer_name, u.phone AS farmer_phone,
             ls.sub_county AS location
      FROM livestock_sale_listings ls
      JOIN animals a ON ls.animal_id = a.id
      JOIN users u ON ls.farmer_id = u.id
      WHERE ls.status = 'active'
      ORDER BY ls.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/livestock/sale — farmer lists animal for sale
router.post('/sale', async (req, res) => {
  const { animal_id, farmer_id, price, payment_method, sub_county, description } = req.body;
  if (!animal_id || !farmer_id || !price)
    return res.status(400).json({ error: 'animal_id, farmer_id and price required' });
  try {
    // Update animal status
    await pool.query(`UPDATE animals SET status='for_sale' WHERE id=$1`, [animal_id]);
    const r = await pool.query(`
      INSERT INTO livestock_sale_listings
        (animal_id, farmer_id, price, payment_method, sub_county, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'active',NOW()) RETURNING *`,
      [animal_id, farmer_id, price, payment_method||'M-PESA Escrow', sub_county||null, description||null]
    );
    res.status(201).json({ success: true, listing: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/livestock/sale/:id — remove sale listing
router.delete('/sale/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM livestock_sale_listings WHERE id=$1 RETURNING animal_id`, [req.params.id]
    );
    if (r.rows[0])
      await pool.query(`UPDATE animals SET status='active' WHERE id=$1`, [r.rows[0].animal_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════
// BARTER / SWAP
// ═══════════════════════════════════════════════════════

// GET /api/livestock/barter
router.get('/barter', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, a.species, a.breed, a.name AS animal_name, a.passport_id,
             a.vaccinations, u.full_name AS farmer_name
      FROM livestock_barter b
      JOIN animals a ON b.animal_id = a.id
      JOIN users u ON b.farmer_id = u.id
      WHERE b.status = 'open'
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/livestock/barter
router.post('/barter', async (req, res) => {
  const { animal_id, farmer_id, my_value, want_description, want_value, notes, location } = req.body;
  if (!animal_id || !farmer_id || !want_description)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const r = await pool.query(`
      INSERT INTO livestock_barter
        (animal_id, farmer_id, my_value, want_description, want_value, notes, location, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'open',NOW()) RETURNING *`,
      [animal_id, farmer_id, my_value||0, want_description, want_value||0, notes||null, location||null]
    );
    res.status(201).json({ success: true, barter: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// SIRE HIRE
// ═══════════════════════════════════════════════════════

// GET /api/livestock/sires
router.get('/sires', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sh.*, a.species, a.breed, a.name AS animal_name, a.weight,
             a.ai_weight, a.bcs, a.vaccinations, a.passport_id,
             u.full_name AS farmer_name, u.phone AS farmer_phone
      FROM sire_hire sh
      JOIN animals a ON sh.animal_id = a.id
      JOIN users u ON sh.farmer_id = u.id
      WHERE sh.available = true
      ORDER BY sh.proven_offspring DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/livestock/sires
router.post('/sires', async (req, res) => {
  const { animal_id, farmer_id, fee, breed_description, vet_cert, notes, location } = req.body;
  if (!animal_id || !farmer_id || !fee)
    return res.status(400).json({ error: 'animal_id, farmer_id and fee required' });
  try {
    const r = await pool.query(`
      INSERT INTO sire_hire
        (animal_id, farmer_id, fee, breed_description, vet_cert, notes, location, proven_offspring, available, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,true,NOW()) RETURNING *`,
      [animal_id, farmer_id, fee, breed_description||null, vet_cert||null, notes||null, location||null]
    );
    res.status(201).json({ success: true, sire: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// FODDER MARKET
// ═══════════════════════════════════════════════════════

// GET /api/livestock/fodder
router.get('/fodder', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, u.full_name AS seller_name, u.phone AS seller_phone
      FROM fodder_listings f
      JOIN users u ON f.farmer_id = u.id
      WHERE f.status = 'active'
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/livestock/fodder
router.post('/fodder', async (req, res) => {
  const { farmer_id, fodder_type, quantity, unit, price_per_unit, location, delivery_option, notes } = req.body;
  if (!farmer_id || !fodder_type || !quantity || !price_per_unit)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const r = await pool.query(`
      INSERT INTO fodder_listings
        (farmer_id, fodder_type, quantity, unit, price_per_unit, location, delivery_option, notes, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW()) RETURNING *`,
      [farmer_id, fodder_type, quantity, unit||'kg', price_per_unit, location||null, delivery_option||'Pickup only', notes||null]
    );
    res.status(201).json({ success: true, fodder: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// LIVESTOCK OFFERS (between traders and farmers)
// ═══════════════════════════════════════════════════════

// POST /api/livestock/offers
router.post('/offers', async (req, res) => {
  const { listing_id, trader_id, farmer_id, offered_price, message, listing_type } = req.body;
  // listing_type: 'sale' | 'barter' | 'sire' | 'fodder'
  if (!listing_id || !trader_id || !farmer_id || !offered_price)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const r = await pool.query(`
      INSERT INTO livestock_offers
        (listing_id, listing_type, trader_id, farmer_id, offered_price, message, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW()) RETURNING *`,
      [listing_id, listing_type||'sale', trader_id, farmer_id, offered_price, message||null]
    );
    res.status(201).json({ success: true, offer: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/livestock/offers/farmer/:farmerId
router.get('/offers/farmer/:farmerId', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT lo.*, u.full_name AS trader_name, u.phone AS trader_phone
      FROM livestock_offers lo
      JOIN users u ON lo.trader_id = u.id
      WHERE lo.farmer_id = $1
      ORDER BY lo.created_at DESC`,
      [req.params.farmerId]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/livestock/offers/trader/:traderId
router.get('/offers/trader/:traderId', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT lo.*, u.full_name AS farmer_name
      FROM livestock_offers lo
      JOIN users u ON lo.farmer_id = u.id
      WHERE lo.trader_id = $1
      ORDER BY lo.created_at DESC`,
      [req.params.traderId]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/livestock/offers/:id/respond
router.patch('/offers/:id/respond', async (req, res) => {
  const { status, counter_price, response_message } = req.body;
  if (!['accepted','rejected','countered'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    const r = await pool.query(`
      UPDATE livestock_offers
      SET status=$1, counter_price=$2, response_message=$3, responded_at=NOW()
      WHERE id=$4 RETURNING *`,
      [status, counter_price||null, response_message||null, req.params.id]
    );
    // If accepted, mark the animal as sold
    if (status === 'accepted') {
      const offer = r.rows[0];
      if (offer && offer.listing_type === 'sale') {
        await pool.query(
          `UPDATE livestock_sale_listings SET status='sold' WHERE id=$1`, [offer.listing_id]
        );
        const ls = await pool.query(
          `SELECT animal_id FROM livestock_sale_listings WHERE id=$1`, [offer.listing_id]
        );
        if (ls.rows[0])
          await pool.query(`UPDATE animals SET status='sold' WHERE id=$1`, [ls.rows[0].animal_id]);
      }
    }
    res.json({ success: true, offer: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
