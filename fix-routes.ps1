# Fix API routes to use /api/v1/ prefix
Write-Host "Fixing API routes..." -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText("$PWD\src\app.js", [System.Text.Encoding]::UTF8)

$content = $content.Replace("app.use('/api/auth'", "app.use('/api/v1/auth'")
$content = $content.Replace("app.use('/api/listings'", "app.use('/api/v1/listings'")
$content = $content.Replace("app.use('/api/reservations'", "app.use('/api/v1/reservations'")
$content = $content.Replace("app.use('/api/tours'", "app.use('/api/v1/tours'")
$content = $content.Replace("app.use('/api/admin'", "app.use('/api/v1/admin'")
$content = $content.Replace("app.use('/api',", "app.use('/api/v1',")

[System.IO.File]::WriteAllText("$PWD\src\app.js", $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Done! Now run: npm run dev" -ForegroundColor Green
