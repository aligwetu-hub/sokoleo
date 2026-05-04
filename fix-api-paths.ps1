# Fix API paths in HTML files
Write-Host "Fixing API paths..." -ForegroundColor Yellow

# Fix index.html - change /api/admin to /api/v1/admin
$content = Get-Content "public\index.html" -Raw -Encoding UTF8
$content = $content -replace "/api/admin/", "/api/v1/admin/"
$content = $content -replace "/api/listings", "/api/v1/listings"
$content = $content -replace "/api/reservations", "/api/v1/reservations"
[System.IO.File]::WriteAllText("$PWD\public\index.html", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "index.html fixed" -ForegroundColor Green

# Fix trader.html - change /api/v1/auth to match old project
$content2 = Get-Content "public\trader.html" -Raw -Encoding UTF8
$content2 = $content2 -replace "'/api/auth", "'/api/v1/auth"
$content2 = $content2 -replace "'/api/listings", "'/api/v1/listings"  
$content2 = $content2 -replace "'/api/reservations", "'/api/v1/reservations"
[System.IO.File]::WriteAllText("$PWD\public\trader.html", $content2, [System.Text.UTF8Encoding]::new($false))
Write-Host "trader.html fixed" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Refresh Chrome - no restart needed." -ForegroundColor Green
