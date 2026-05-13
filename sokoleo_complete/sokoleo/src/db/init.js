const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
require('dotenv').config();

async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../../schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ SokoLeo database schema created successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ DB init failed:', err.message);
    process.exit(1);
  }
}

initDB();
