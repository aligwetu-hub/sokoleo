require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    throw new Error('phone argument is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    'SELECT code FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone]
  );
  await client.end();

  if (!result.rows[0]) {
    throw new Error('no otp found');
  }

  console.log(result.rows[0].code);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
