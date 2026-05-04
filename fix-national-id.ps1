# Fix National ID display - replaces broken dash with "Not submitted"
Write-Host "Fixing National ID display..." -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText("$PWD\public\index.html", [System.Text.Encoding]::UTF8)

# Replace all variations of the dash/empty national ID display
$content = $content -replace "u\.national_id \? [^`n]*id-chip[^`n]*: [^`}]*\}", 'u.national_id ? `<span class="id-chip">${u.national_id}</span>` : `<span style="color:#ef4444;font-size:11px;font-weight:600">Not submitted</span>`}'

# Replace any remaining "Not provided" text
$content = $content.Replace("Not provided", "Not submitted")
$content = $content.Replace(">&#8212;<", '><span style="color:#ef4444;font-size:11px">Not submitted</span><')

[System.IO.File]::WriteAllText("$PWD\public\index.html", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done! Refresh Chrome." -ForegroundColor Green
