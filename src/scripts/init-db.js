const fs = require('fs');
const path = require('path');
const db = require('../db/client');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await db.query(sql);
  console.log('Database schema initialized successfully.');
}

main()
  .catch((error) => {
    console.error('Failed to initialize DB schema:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
