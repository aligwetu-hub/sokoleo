require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running pickup point migrations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pickup_points (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        owner_name VARCHAR(100) NOT NULL,
        owner_phone VARCHAR(20) NOT NULL,
        owner_id_number VARCHAR(20),
        county VARCHAR(50),
        town VARCHAR(50),
        physical_address TEXT,
        status VARCHAR(20) DEFAULT 'active',
        rating NUMERIC(3,2) DEFAULT 5.0,
        total_transactions INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ pickup_points created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS pickup_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        deal_code VARCHAR(20) UNIQUE NOT NULL,
        escrow_id UUID,
        transaction_id UUID,
        farmer_id UUID REFERENCES users(id),
        trader_id UUID REFERENCES users(id),
        pickup_point_id UUID REFERENCES pickup_points(id),
        produce_name VARCHAR(100),
        quantity DECIMAL(10,2),
        unit VARCHAR(20) DEFAULT 'kg',
        agreed_price DECIMAL(12,2),
        total_amount DECIMAL(12,2),

        drop_pin VARCHAR(6),
        drop_pin_expires_at TIMESTAMP,
        drop_confirmed_at TIMESTAMP,
        drop_confirmed_by VARCHAR(50),
        drop_photo_url TEXT,
        drop_gps_lat DECIMAL(10,7),
        drop_gps_lng DECIMAL(10,7),

        collection_pin VARCHAR(6),
        collection_pin_expires_at TIMESTAMP,
        collection_confirmed_at TIMESTAMP,
        collection_confirmed_by VARCHAR(50),
        collection_photo_url TEXT,
        collection_gps_lat DECIMAL(10,7),
        collection_gps_lng DECIMAL(10,7),

        dispute_raised BOOLEAN DEFAULT FALSE,
        dispute_reason TEXT,
        dispute_raised_at TIMESTAMP,
        dispute_raised_by UUID REFERENCES users(id),
        dispute_resolved_at TIMESTAMP,
        dispute_resolution TEXT,
        dispute_resolved_by UUID REFERENCES users(id),

        status VARCHAR(30) DEFAULT 'pending_drop',
        escrow_released_at TIMESTAMP,
        auto_release_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ pickup_transactions created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pickup_deal_code ON pickup_transactions(deal_code);
      CREATE INDEX IF NOT EXISTS idx_pickup_farmer ON pickup_transactions(farmer_id);
      CREATE INDEX IF NOT EXISTS idx_pickup_trader ON pickup_transactions(trader_id);
      CREATE INDEX IF NOT EXISTS idx_pickup_status ON pickup_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_pickup_drop_pin ON pickup_transactions(drop_pin);
      CREATE INDEX IF NOT EXISTS idx_pickup_collection_pin ON pickup_transactions(collection_pin);
    `);
    console.log('✅ Indexes created');

    // Seed 3 test pickup points for Tharaka Nithi
    await client.query(`
      INSERT INTO pickup_points (name, owner_name, owner_phone, county, town, physical_address, is_verified)
      VALUES
        ('Mama Njeri''s Shop', 'Grace Njeri', '+254722000001', 'Tharaka Nithi', 'Chuka', 'Chuka Main Market, Stall 12', TRUE),
        ('Kamau Agrovet', 'Peter Kamau', '+254722000002', 'Tharaka Nithi', 'Maara', 'Maara Market Centre', TRUE),
        ('Chuka Fresh Produce', 'Ann Wanjiku', '+254722000003', 'Tharaka Nithi', 'Chuka', 'Opposite Chuka Bus Stage', TRUE)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Test pickup points seeded');

    console.log('\n✅ Pickup Point migration complete!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
