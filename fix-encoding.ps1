# Fix UTF-8 encoding for emoji display
Write-Host "Fixing encoding..." -ForegroundColor Yellow

# Read app.js
$content = Get-Content "src\app.js" -Raw -Encoding UTF8

# Replace static serving with charset-aware version
if ($content -match "express.static") {
    $content = $content -replace "app\.use\(express\.static\(path\.join\(__dirname, '\.\.\/public'\)\)\);", "app.use(express.static(path.join(__dirname, '../public'), { setHeaders: (res) => res.setHeader('Content-Type', 'text/html; charset=utf-8') }));"
    Set-Content "src\app.js" -Value $content -Encoding UTF8
    Write-Host "Charset header added!" -ForegroundColor Green
} else {
    Write-Host "Static serving not found - skipping" -ForegroundColor Yellow
}

Write-Host "Done! Restart server with: npm run dev" -ForegroundColor Green
