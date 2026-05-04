const db = require('./client');

async function createUser({ name, phone, role, location }) {
  const result = await db.query(
    `INSERT INTO users (name, phone, role, location)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, phone, role, location, created_at`,
    [name, phone, role, location || null]
  );
  return result.rows[0];
}

async function createFarmerProfile({ userId, farmSize, crops, livestock }) {
  const result = await db.query(
    `INSERT INTO farmers (user_id, farm_size, crops, livestock)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, farm_size, crops, livestock`,
    [userId, farmSize || null, crops || null, livestock || null]
  );
  return result.rows[0];
}

async function createTraderProfile({ userId, productsPurchased, purchaseCapacity }) {
  const result = await db.query(
    `INSERT INTO traders (user_id, products_purchased, purchase_capacity)
     VALUES ($1, $2, $3)
     RETURNING user_id, products_purchased, purchase_capacity`,
    [userId, productsPurchased || null, purchaseCapacity || null]
  );
  return result.rows[0];
}

async function findUserByPhone(phone) {
  const result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createOtpCode({ phone, code, expiresAt }) {
  const result = await db.query(
    `INSERT INTO otp_codes (phone, code, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, phone, code, expires_at, consumed_at, created_at`,
    [phone, code, expiresAt]
  );

  return result.rows[0];
}

async function findValidOtpCode({ phone, code }) {
  const result = await db.query(
    `SELECT *
     FROM otp_codes
     WHERE phone = $1
       AND code = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone, code]
  );

  return result.rows[0] || null;
}

async function markOtpConsumed(otpId) {
  const result = await db.query(
    `UPDATE otp_codes
     SET consumed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [otpId]
  );
  return result.rows[0] || null;
}

async function createSession({ userId, token, expiresAt }) {
  const result = await db.query(
    `INSERT INTO user_sessions (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token, expires_at, created_at`,
    [userId, token, expiresAt]
  );

  return result.rows[0];
}

async function findActiveSessionByToken(token) {
  const result = await db.query(
    `SELECT s.id, s.user_id, s.token, s.expires_at, s.created_at,
            u.name, u.phone, u.role, u.location
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  return result.rows[0] || null;
}

async function deleteSessionByToken(token) {
  const result = await db.query(
    `DELETE FROM user_sessions
     WHERE token = $1
     RETURNING id`,
    [token]
  );

  return Boolean(result.rows[0]);
}

async function createListing({ farmerId, product, quantity, location, availability }) {
  const result = await db.query(
    `INSERT INTO listings (farmer_id, product, quantity, location, availability)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [farmerId, product, quantity, location, availability]
  );
  return result.rows[0];
}

async function getListingById(id) {
  const result = await db.query('SELECT * FROM listings WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getListingWithFarmerContact(listingId) {
  const result = await db.query(
    `SELECT l.*, u.name AS farmer_name, u.phone AS farmer_phone
     FROM listings l
     JOIN users u ON u.id = l.farmer_id
     WHERE l.id = $1`,
    [listingId]
  );

  return result.rows[0] || null;
}

async function searchListings({ product, location }) {
  const params = [];
  const filters = ["l.status = 'active'"];

  if (product) {
    params.push(`%${product}%`);
    filters.push(`l.product ILIKE $${params.length}`);
  }

  if (location) {
    params.push(`%${location}%`);
    filters.push(`l.location ILIKE $${params.length}`);
  }

  const sql = `
    SELECT l.id, l.product, l.quantity, l.location, l.availability, l.created_at,
           u.name AS farmer_name, u.phone AS farmer_phone
    FROM listings l
    JOIN users u ON u.id = l.farmer_id
    WHERE ${filters.join(' AND ')}
    ORDER BY l.created_at DESC
    LIMIT 50
  `;

  const result = await db.query(sql, params);
  return result.rows;
}

async function createReservation({ listingId, traderId, status = 'pending', paymentStatus = 'unpaid' }) {
  const result = await db.query(
    `INSERT INTO reservations (listing_id, trader_id, status, payment_status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [listingId, traderId, status, paymentStatus]
  );
  return result.rows[0];
}

async function createFarmTour({ farmerId, farmType, price, capacity, location, availableDays, activities }) {
  const result = await db.query(
    `INSERT INTO farm_tours (farmer_id, farm_type, price, capacity, location, available_days, activities)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [farmerId, farmType, price, capacity, location, availableDays, activities || null]
  );
  return result.rows[0];
}

async function createPayment({ userId, amount, method, transactionId, status = 'pending' }) {
  const result = await db.query(
    `INSERT INTO payments (user_id, amount, method, transaction_id, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, amount, method, transactionId || null, status]
  );
  return result.rows[0];
}

async function createInboundSms({ fromPhone, toPhone, message, linkId, networkCode, atMessageId, rawPayload }) {
  const result = await db.query(
    `INSERT INTO inbound_sms (from_phone, to_phone, message, link_id, network_code, at_message_id, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fromPhone || null,
      toPhone || null,
      message || null,
      linkId || null,
      networkCode || null,
      atMessageId || null,
      rawPayload ? JSON.stringify(rawPayload) : null
    ]
  );

  return result.rows[0];
}

async function createSmsDeliveryReport({ phone, status, networkCode, failureReason, atMessageId, retryCount, rawPayload }) {
  const result = await db.query(
    `INSERT INTO sms_delivery_reports (phone, status, network_code, failure_reason, at_message_id, retry_count, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      phone || null,
      status || null,
      networkCode || null,
      failureReason || null,
      atMessageId || null,
      retryCount ?? null,
      rawPayload ? JSON.stringify(rawPayload) : null
    ]
  );

  return result.rows[0];
}

async function updateReservationPaymentStatus(id, paymentStatus) {
  const result = await db.query(
    `UPDATE reservations
     SET payment_status = $2
     WHERE id = $1
     RETURNING *`,
    [id, paymentStatus]
  );
  return result.rows[0] || null;
}

async function getAdminAnalytics() {
  const [farmers, traders, listings, reservations, revenue, popularCrops] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'farmer'`),
    db.query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'trader'`),
    db.query(`SELECT COUNT(*)::int AS total FROM listings WHERE status = 'active'`),
    db.query(`SELECT COUNT(*)::int AS total FROM reservations`),
    db.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments WHERE status = 'success'`),
    db.query(`
      SELECT product, COUNT(*)::int AS total
      FROM listings
      GROUP BY product
      ORDER BY total DESC
      LIMIT 5
    `)
  ]);

  return {
    farmers: farmers.rows[0].total,
    traders: traders.rows[0].total,
    activeListings: listings.rows[0].total,
    reservations: reservations.rows[0].total,
    revenueKes: revenue.rows[0].total,
    popularCrops: popularCrops.rows
  };
}

module.exports = {
  createUser,
  createFarmerProfile,
  createTraderProfile,
  findUserByPhone,
  findUserById,
  createOtpCode,
  findValidOtpCode,
  markOtpConsumed,
  createSession,
  findActiveSessionByToken,
  deleteSessionByToken,
  createListing,
  getListingById,
  getListingWithFarmerContact,
  searchListings,
  createReservation,
  createFarmTour,
  createPayment,
  createInboundSms,
  createSmsDeliveryReport,
  updateReservationPaymentStatus,
  getAdminAnalytics
};
