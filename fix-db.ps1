# Fix db module path for SokoLeo
Write-Host "Fixing database module..." -ForegroundColor Yellow

# Check what's in src\db
$dbFiles = Get-ChildItem -Path "src\db" -ErrorAction SilentlyContinue
Write-Host "Files in src\db:" -ForegroundColor Cyan
$dbFiles | ForEach-Object { Write-Host "  - $($_.Name)" }

# Check src\config
$configFiles = Get-ChildItem -Path "src\config" -ErrorAction SilentlyContinue
Write-Host "Files in src\config:" -ForegroundColor Cyan
$configFiles | ForEach-Object { Write-Host "  - $($_.Name)" }

# Check src\utils
$utilFiles = Get-ChildItem -Path "src\utils" -ErrorAction SilentlyContinue
Write-Host "Files in src\utils:" -ForegroundColor Cyan
$utilFiles | ForEach-Object { Write-Host "  - $($_.Name)" }

# Write a db index file that works with the existing project structure
@'
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('DB pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
'@ | Set-Content -Path "src\db\index.js" -Encoding UTF8
Write-Host "src\db\index.js written" -ForegroundColor Green

# Also write it at src\db.js for safety
@'
module.exports = require('./db/index');
'@ | Set-Content -Path "src\db.js" -Encoding UTF8
Write-Host "src\db.js written" -ForegroundColor Green

Write-Host ""
Write-Host "Fix applied! Now run: npm run dev" -ForegroundColor Green
Write-Host ""
