const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('DB pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };