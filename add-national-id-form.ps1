# Add National ID field to trader registration form
Write-Host "Adding National ID field to registration form..." -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText("$PWD\public\trader.html", [System.Text.Encoding]::UTF8)

# Add National ID field after Location field in the register form
$old = '<div class="form-group"><label>Location</label><input class="form-control" id="regLocation" placeholder="e.g. Chuka, Tharaka Nithi" /></div>
      <button class="btn-full" onclick="registerTrader()">Create Account →</button>'

$new = '<div class="form-group"><label>Location</label><input class="form-control" id="regLocation" placeholder="e.g. Chuka, Tharaka Nithi" /></div>
      <div class="form-group"><label>National ID Number <span style="color:#ef4444">*</span></label><input class="form-control" id="regNationalId" placeholder="e.g. 12345678" maxlength="12" /></div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:12px;color:#166534;margin-bottom:12px">&#128274; Your National ID is used only for identity verification by the admin. It is kept secure and private.</div>
      <button class="btn-full" onclick="registerTrader()">Create Account →</button>'

$content = $content.Replace($old, $new)

# Update registerTrader function to include national_id
$oldFn = "const res=await apiFetch('/api/v1/auth/register','POST',{name,phone,location,role:'trader'});"
$newFn = "const national_id=document.getElementById('regNationalId').value.trim();
  if(!national_id)return showError('regError','National ID number is required.');
  const res=await apiFetch('/api/v1/auth/register','POST',{name,phone,location,role:'trader',national_id});"

$content = $content.Replace($oldFn, $newFn)

[System.IO.File]::WriteAllText("$PWD\public\trader.html", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done! Refresh Chrome - no restart needed." -ForegroundColor Green
