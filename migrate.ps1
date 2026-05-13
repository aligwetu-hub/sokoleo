# Add missing database columns
Write-Host "Adding missing database columns..." -ForegroundColor Yellow

$migrate = @'
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Adding missing columns...');

    // Add is_verified to users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE
    `).catch(e => console.log('is_verified:', e.message));

    // Add national_id to users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30)
    `).catch(e => console.log('national_id:', e.message));

    // Add verification_note to users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT
    `).catch(e => console.log('verification_note:', e.message));

    // Add is_active to users if missing
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
    `).catch(e => console.log('is_active:', e.message));

    // Verify columns added
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='users' ORDER BY column_name
    `);
    console.log('\nUsers table columns:');
    result.rows.forEach(r => console.log(' -', r.column_name));

    console.log('\nMigration complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
'@

[System.IO.File]::WriteAllText("$PWD\migrate.js", $migrate, [System.Text.UTF8Encoding]::new($false))
Write-Host "migrate.js written" -ForegroundColor Green
Write-Host "Running migration..." -ForegroundColor Yellow
node migrate.js
Write-Host ""
Write-Host "Done! Restart server: npm run dev" -ForegroundColor Green
