require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS negotiations (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER,
        trader_id INTEGER,
        farmer_id INTEGER,
        initial_price NUMERIC(10,2),
        current_offer NUMERIC(10,2) NOT NULL,
        offered_by VARCHAR(20) DEFAULT 'trader',
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS negotiation_messages (
        id SERIAL PRIMARY KEY,
        negotiation_id INTEGER REFERENCES negotiations(id) ON DELETE CASCADE,
        sender_role VARCHAR(20),
        amount NUMERIC(10,2) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Negotiation tables created!');
  } finally { client.release(); await pool.end(); }
}
migrate().catch(e => { console.error(e.message); process.exit(1); });
