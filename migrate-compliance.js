require('dotenv').config();
const { query } = require('./src/db/pool');

async function migrate() {
  console.log('Running compliance migrations...');
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_date TIMESTAMP`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_last4 VARCHAR(4)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_photo_url TEXT`);
  console.log('Done.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
