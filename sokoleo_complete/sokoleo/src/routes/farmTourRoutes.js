const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { notifyTourBooked } = require('../services/smsService');
const { initiateSTKPush } = require('../services/paymentService');

// GET /api/tours
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT ft.*, u.name as farmer_name, u.phone as farmer_phone
       FROM farm_tours ft JOIN users u ON ft.farmer_id = u.id
       WHERE ft.status='active' ORDER BY ft.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tours.' });
  }
});

// POST /api/tours - list a farm tour
router.post('/', async (req, res) => {
  const { farmer_phone, farm_type, price, min_visitors, max_visitors, location, available_days, activities, description } = req.body;

  if (!farmer_phone || !farm_type || !price || !max_visitors || !location) {
    return res.status(400).json({ error: 'farmer_phone, farm_type, price, max_visitors, location are required.' });
  }

  try {
    const userRes = await query(`SELECT id FROM users WHERE phone=$1 AND role='farmer'`, [farmer_phone]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Farmer not found.' });

    const result = await query(
      `INSERT INTO farm_tours (farmer_id, farm_type, price, min_visitors, max_visitors, location, available_days, activities, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userRes.rows[0].id, farm_type, price, min_visitors || 1, max_visitors, location, available_days || [], activities || [], description || null]
    );

    res.status(201).json({ message: 'Farm tour listed.', tour: result.rows[0] });
  } catch (err) {
    console.error('Create tour error:', err.message);
    res.status(500).json({ error: 'Failed to create tour.' });
  }
});

// POST /api/tours/:id/book
router.post('/:id/book', async (req, res) => {
  const { visitor_phone, visitor_count, visit_date } = req.body;

  if (!visitor_phone || !visit_date) {
    return res.status(400).json({ error: 'visitor_phone and visit_date are required.' });
  }

  try {
    const tourRes = await query(
      `SELECT ft.*, u.name as farmer_name, u.phone as farmer_phone
       FROM farm_tours ft JOIN users u ON ft.farmer_id = u.id
       WHERE ft.id=$1 AND ft.status='active'`,
      [req.params.id]
    );
    if (tourRes.rows.length === 0) return res.status(404).json({ error: 'Tour not found.' });
    const tour = tourRes.rows[0];

    const count = parseInt(visitor_count) || 1;
    const totalAmount = tour.price * count;

    // Get or create visitor
    let visitorRes = await query(`SELECT id, name FROM users WHERE phone=$1`, [visitor_phone]);
    let visitorId, visitorName;
    if (visitorRes.rows.length === 0) {
      const newUser = await query(
        `INSERT INTO users (phone, name, role) VALUES ($1,$2,'visitor') RETURNING id, name`,
        [visitor_phone, `Visitor ${visitor_phone.slice(-4)}`]
      );
      visitorId = newUser.rows[0].id;
      visitorName = newUser.rows[0].name;
    } else {
      visitorId = visitorRes.rows[0].id;
      visitorName = visitorRes.rows[0].name;
    }

    const booking = await query(
      `INSERT INTO tour_bookings (tour_id, visitor_id, visitor_count, visit_date, total_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tour.id, visitorId, count, visit_date, totalAmount]
    );

    await notifyTourBooked(tour.farmer_phone, visitorName, visit_date, count);

    res.status(201).json({
      message: 'Tour booked! Please pay to confirm.',
      booking: booking.rows[0],
      total_amount: totalAmount,
      farmer_contact: tour.farmer_phone,
    });
  } catch (err) {
    console.error('Book tour error:', err.message);
    res.status(500).json({ error: 'Failed to book tour.' });
  }
});

module.exports = router;
