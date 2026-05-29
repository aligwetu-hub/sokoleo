// node migrate-all.js
require('dotenv').config();
const { query } = require('./src/db/pool');

async function run() {
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    console.log('✅ uuid-ossp extension ready');

    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        buyer_id UUID REFERENCES users(id),
        seller_id UUID REFERENCES users(id),
        listing_id UUID,
        listing_type VARCHAR(30) DEFAULT 'produce',
        item_description TEXT,
        category VARCHAR(50),
        quantity DECIMAL(10,2),
        unit VARCHAR(20) DEFAULT 'kg',
        listing_price DECIMAL(12,2),
        buyer_fee_rate DECIMAL(5,4) DEFAULT 0.03,
        seller_fee_rate DECIMAL(5,4) DEFAULT 0.01,
        buyer_fee_amount DECIMAL(12,2) DEFAULT 0,
        seller_fee_amount DECIMAL(12,2) DEFAULT 0,
        buyer_pays DECIMAL(12,2),
        seller_receives DECIMAL(12,2),
        sokoleo_commission DECIMAL(12,2),
        payment_method VARCHAR(30) DEFAULT 'M-PESA Escrow',
        mpesa_ref VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        paid_at TIMESTAMP,
        confirmed_at TIMESTAMP,
        released_at TIMESTAMP
      )
    `);
    console.log('✅ transactions table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS escrow (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id UUID REFERENCES transactions(id),
        amount_held DECIMAL(12,2),
        release_to_seller DECIMAL(12,2),
        release_to_sokoleo DECIMAL(12,2),
        status VARCHAR(20) DEFAULT 'holding',
        handover_confirmed_by VARCHAR(20),
        confirmation_code VARCHAR(6),
        held_at TIMESTAMP DEFAULT NOW(),
        released_at TIMESTAMP
      )
    `);
    console.log('✅ escrow table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id UUID REFERENCES transactions(id),
        amount DECIMAL(12,2),
        source VARCHAR(30),
        category VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ commission_ledger table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id UUID REFERENCES transactions(id),
        seller_id UUID REFERENCES users(id),
        amount DECIMAL(12,2),
        mpesa_number VARCHAR(15),
        mpesa_ref VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP
      )
    `);
    console.log('✅ payouts table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS boosts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        listing_id UUID,
        farmer_id UUID REFERENCES users(id),
        amount_paid DECIMAL(8,2),
        duration_hrs INTEGER DEFAULT 24,
        started_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);
    console.log('✅ boosts table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reviewer_id UUID REFERENCES users(id),
        seller_id UUID REFERENCES users(id),
        transaction_id UUID,
        reviewer_role TEXT DEFAULT 'trader',
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ reviews table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS seller_stats (
        seller_id UUID PRIMARY KEY REFERENCES users(id),
        avg_rating NUMERIC(3,2) DEFAULT 0,
        total_reviews INT DEFAULT 0,
        total_sales INT DEFAULT 0,
        response_time_hrs NUMERIC(5,1),
        completion_rate NUMERIC(5,2),
        last_updated TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ seller_stats table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farmer_id UUID REFERENCES users(id),
        trader_id UUID REFERENCES users(id),
        listing_id UUID,
        last_message_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(farmer_id, trader_id)
      )
    `);
    console.log('✅ conversations table ready');

    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id),
        sender_id UUID REFERENCES users(id),
        body TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ messages table ready');

    console.log('\n🎉 All migrations complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
