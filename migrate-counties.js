// node migrate-counties.js
require('dotenv').config();
const { query } = require('./src/db/pool');

async function run() {
  try {
    await query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS county VARCHAR(50)`);
    console.log('✅ listings.county added');

    await query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS region VARCHAR(50)`);
    console.log('✅ listings.region added');

    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS county VARCHAR(50)`);
    console.log('✅ users.county added');

    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS region VARCHAR(50)`);
    console.log('✅ users.region added');

    await query(`CREATE INDEX IF NOT EXISTS idx_listings_county ON listings(county)`);
    console.log('✅ index on listings.county created');

    console.log('\n🎉 Counties migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
