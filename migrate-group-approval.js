require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running group approval migration...');

    // NULL = no request, 'pending' = requested but not yet reviewed, 'approved' = live.
    // A farmer's listings only show the group badge once this is 'approved' —
    // this is what keeps group affiliation a real trust signal instead of a self-declared one.
    await client.query(`
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS group_status VARCHAR(20)
        CHECK (group_status IN ('pending','approved'));
    `);
    console.log('✅ farmers.group_status added');

    console.log('\n✅ Group approval migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
