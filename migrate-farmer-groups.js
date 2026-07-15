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
