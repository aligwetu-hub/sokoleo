const express = require('express');
const router = express.Router();
const db = require('../db/client');
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
