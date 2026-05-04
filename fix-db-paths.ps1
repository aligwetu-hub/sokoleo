# Fix db module path in all route files
Write-Host "Fixing db module paths..." -ForegroundColor Yellow

$files = @(
    "src\routes\authRoutes.js",
    "src\routes\listingRoutes.js", 
    "src\routes\reservationRoutes.js",
    "src\routes\farmTourRoutes.js",
    "src\routes\adminRoutes.js",
    "src\services\ussdService.js"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = [System.IO.File]::ReadAllText("$PWD\$file", [System.Text.Encoding]::UTF8)
        $content = $content.Replace("require('../db')", "require('../db/client')")
        $content = $content.Replace("require('../db/index')", "require('../db/client')")
        [System.IO.File]::WriteAllText("$PWD\$file", $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Fixed: $file" -ForegroundColor Cyan
    }
}

# Write the db client file that works with old project
$dbClient = @'
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('DB pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
'@

[System.IO.File]::WriteAllText("$PWD\src\db\client.js", $dbClient, [System.Text.UTF8Encoding]::new($false))
Write-Host "src\db\client.js written" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Now run: npm run dev" -ForegroundColor Green
