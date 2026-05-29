// node migrate-security.js
require('dotenv').config();
const { query } = require('./src/db/pool');

async function run() {
  await query(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone VARCHAR(20) NOT NULL,
      reason TEXT,
      reported_by UUID,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON blacklist(phone)`);
  console.log('✅ blacklist table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS fraud_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reporter_id UUID REFERENCES users(id),
      reported_user_id UUID REFERENCES users(id),
      listing_id UUID,
      reason TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      admin_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✅ fraud_reports table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS otp_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone VARCHAR(20) NOT NULL,
      otp_code VARCHAR(10),
      attempts INTEGER DEFAULT 0,
      verified BOOLEAN DEFAULT false,
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes'
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_otp_phone    ON otp_log(phone)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_otp_expires  ON otp_log(expires_at)`);
  console.log('✅ otp_log table ready');

  await query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      type VARCHAR(50),
      details JSONB,
      severity VARCHAR(20) DEFAULT 'info',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✅ system_logs table ready');

  console.log('\n🎉 Security migration complete!');
  process.exit(0);
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
