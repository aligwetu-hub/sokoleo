// migrate-dual-role.js
// Run: node migrate-dual-role.js
require('dotenv').config();
let pool;
const paths = ['./db/client','./src/db/client','./db','./src/db','./config/db','./src/config/db'];
for(const p of paths){ try{ pool = require(p); break; }catch(e){} }
if(!pool){ console.error('Cannot find db module'); process.exit(1); }
async function migrate() {
  console.log('🚀 Adding dual-role support...');
  try {
    // Add secondary_role column to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS secondary_role VARCHAR(20) DEFAULT NULL
      CHECK (secondary_role IN ('farmer','trader', NULL));
    `);
    console.log('✅ secondary_role column added to users table');

    // Add role_switched_at for tracking
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role_switched_at TIMESTAMP DEFAULT NULL;
    `);
    console.log('✅ role_switched_at column added');

    console.log('\n🎉 Dual-role migration complete!');
    console.log('Farmers can now also register as Traders and vice versa.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
