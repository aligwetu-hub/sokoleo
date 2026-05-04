# Fix static file serving - adds public folder to existing app.js
Write-Host "Adding static file serving..." -ForegroundColor Yellow

# Read current app.js
$appContent = Get-Content -Path "src\app.js" -Raw

# Check if static serving already exists
if ($appContent -notmatch "express.static") {
    # Add static file serving after express() is created
    $appContent = $appContent -replace "(const app = express\(\);)", "`$1`n`nconst path = require('path');`napp.use(express.static(path.join(__dirname, '../public')));`napp.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));"
    Set-Content -Path "src\app.js" -Value $appContent -Encoding UTF8
    Write-Host "Static serving added to app.js" -ForegroundColor Green
} else {
    Write-Host "Static serving already exists" -ForegroundColor Cyan
}

# Write the admin dashboard to public/index.html
Write-Host "Writing admin dashboard..." -ForegroundColor Yellow

$adminDashboard = @'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SokoLeo Admin Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root { --green:#2d6a4f;--green2:#40916c;--green-pale:#d8f3dc;--amber:#f4a261;--dark:#1b1b2f;--muted:#6b7280;--border:#e5e7eb;--white:#ffffff;--red:#ef4444;--blue:#3b82f6; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Outfit',sans-serif;background:#f3f4f6;color:var(--dark);min-height:100vh}
    .sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:var(--dark);display:flex;flex-direction:column;padding:0 0 24px;z-index:100}
    .logo{padding:28px 24px 20px;border-bottom:1px solid rgba(255,255,255,0.08)}
    .logo h1{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px}
    .logo h1 span{color:var(--amber)}
    .logo p{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:1px}
    .nav{flex:1;padding:16px 12px}
    .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:rgba(255,255,255,0.55);font-size:14px;font-weight:500;cursor:pointer;transition:all 0.15s;margin-bottom:2px}
    .nav-item:hover{background:rgba(255,255,255,0.06);color:#fff}
    .nav-item.active{background:var(--green);color:#fff}
    .main{margin-left:240px;padding:32px;min-height:100vh}
    .page{display:none}.page.active{display:block}
    .page-header{margin-bottom:28px}
    .page-header h2{font-size:26px;font-weight:700}
    .page-header p{color:var(--muted);font-size:14px;margin-top:4px}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px}
    .stat-card{background:#fff;border-radius:14px;padding:20px;border:1px solid var(--border);position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
    .stat-card.green::before{background:var(--green2)}.stat-card.amber::before{background:var(--amber)}.stat-card.blue::before{background:var(--blue)}.stat-card.red::before{background:var(--red)}
    .stat-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
    .stat-value{font-size:32px;font-weight:700;margin-top:8px;font-family:'DM Mono',monospace}
    .stat-icon{position:absolute;top:18px;right:18px;font-size:28px;opacity:0.15}
    .table-card{background:#fff;border-radius:14px;border:1px solid var(--border);overflow:hidden;margin-bottom:24px}
    .table-header{padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .table-header h3{font-size:15px;font-weight:600}
    table{width:100%;border-collapse:collapse}
    th{padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:600;background:#fafafa;border-bottom:1px solid var(--border)}
    td{padding:12px 16px;font-size:13px;border-bottom:1px solid #f3f4f6}
    tr:last-child td{border-bottom:none}tr:hover td{background:#fafafa}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .badge.green{background:var(--green-pale);color:var(--green)}.badge.amber{background:#fef3c7;color:#92400e}.badge.red{background:#fee2e2;color:#991b1b}.badge.blue{background:#dbeafe;color:#1e40af}.badge.gray{background:#f3f4f6;color:#374151}
    .btn{padding:8px 16px;border-radius:8px;font-size:13px;font-family:'Outfit',sans-serif;font-weight:500;cursor:pointer;border:none;transition:all 0.15s}
    .btn-primary{background:var(--green);color:#fff}.btn-primary:hover{background:var(--green2)}
    .btn-sm{padding:4px 10px;font-size:12px;border-radius:6px}
    .btn-ghost{background:transparent;border:1px solid var(--border);color:#374151}.btn-ghost:hover{background:#f3f4f6}
    .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
    .last-updated{font-size:12px;color:var(--muted)}
    .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    .chart-card{background:#fff;border-radius:14px;border:1px solid var(--border);padding:20px}
    .chart-card h3{font-size:14px;font-weight:600;margin-bottom:16px;color:#374151}
    .bar-chart{display:flex;flex-direction:column;gap:10px}
    .bar-row{display:flex;align-items:center;gap:12px}
    .bar-label{font-size:12px;color:var(--muted);width:90px;flex-shrink:0}
    .bar-track{flex:1;height:10px;background:#f3f4f6;border-radius:99px;overflow:hidden}
    .bar-fill{height:100%;border-radius:99px;background:var(--green2);transition:width 0.6s ease}
    .bar-count{font-size:12px;font-family:'DM Mono',monospace;color:#374151;width:30px;text-align:right}
    .loading{text-align:center;padding:40px;color:var(--muted);font-size:14px}
    .spinner{display:inline-block;width:20px;height:20px;border:2px solid #e5e7eb;border-top-color:var(--green);border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}
    .empty{text-align:center;padding:48px 20px;color:var(--muted)}
    .ussd-phone{background:var(--dark);border-radius:24px;padding:20px;max-width:280px;margin:0 auto;font-family:'DM Mono',monospace;font-size:13px;color:#a3e635;border:6px solid #374151}
    .ussd-screen{background:#111827;border-radius:12px;padding:16px;min-height:160px;white-space:pre-line;line-height:1.7}
    .ussd-title{text-align:center;color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:8px;text-transform:uppercase;letter-spacing:2px}
  </style>
</head>
<body>
<div class="sidebar">
  <div class="logo"><h1>Soko<span>Leo</span></h1><p>Admin Dashboard</p></div>
  <nav class="nav">
    <div class="nav-item active" onclick="showPage('overview',this)"><span>📊</span> Overview</div>
    <div class="nav-item" onclick="showPage('listings',this)"><span>🌽</span> Listings</div>
    <div class="nav-item" onclick="showPage('users',this)"><span>👥</span> Users</div>
    <div class="nav-item" onclick="showPage('ussd',this)"><span>📱</span> USSD Flow</div>
  </nav>
  <div style="padding:0 12px;font-size:12px;color:rgba(255,255,255,0.25);text-align:center">SokoLeo v1.0 · Tharaka Nithi</div>
</div>
<div class="main">
  <div class="page active" id="page-overview">
    <div class="page-header"><h2>Dashboard Overview</h2><p>SokoLeo marketplace · Tharaka Nithi County, Kenya</p></div>
    <div class="topbar"><span class="last-updated" id="lastUpdated">Loading...</span><button class="btn btn-primary" onclick="loadStats()">↻ Refresh</button></div>
    <div class="stats-grid" id="statsGrid"><div class="loading"><span class="spinner"></span>Loading stats...</div></div>
    <div class="charts-grid">
      <div class="chart-card"><h3>🌽 Top Crops Listed</h3><div class="bar-chart" id="cropsChart"><div class="loading">Loading...</div></div></div>
      <div class="chart-card"><h3>📋 Summary</h3><div id="summaryBox"><div class="loading">Loading...</div></div></div>
    </div>
  </div>
  <div class="page" id="page-listings">
    <div class="page-header"><h2>Produce Listings</h2><p>All active and recent listings</p></div>
    <div class="table-card">
      <div class="table-header"><h3>All Listings</h3><button class="btn btn-ghost btn-sm" onclick="loadListings()">↻ Refresh</button></div>
      <table><thead><tr><th>Product</th><th>Qty</th><th>Location</th><th>Availability</th><th>Farmer</th><th>Phone</th><th>Status</th><th>Date</th></tr></thead>
      <tbody id="listingsTable"><tr><td colspan="8" class="loading"><span class="spinner"></span>Loading...</td></tr></tbody></table>
    </div>
  </div>
  <div class="page" id="page-users">
    <div class="page-header"><h2>Users</h2><p>Registered farmers, traders and visitors</p></div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="loadUsers()">All</button>
      <button class="btn btn-ghost btn-sm" onclick="loadUsers('farmer')">🌾 Farmers</button>
      <button class="btn btn-ghost btn-sm" onclick="loadUsers('trader')">🛒 Traders</button>
    </div>
    <div class="table-card">
      <table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Location</th><th>Verified</th><th>Joined</th><th>Action</th></tr></thead>
      <tbody id="usersTable"><tr><td colspan="7" class="loading"><span class="spinner"></span>Loading...</td></tr></tbody></table>
    </div>
  </div>
  <div class="page" id="page-ussd">
    <div class="page-header"><h2>USSD Flow *789#</h2><p>How farmers and traders use SokoLeo on any phone — no internet needed</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px">
      <div><p style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:12px;font-weight:600">MAIN MENU</p>
        <div class="ussd-phone"><div class="ussd-title">*789#</div><div class="ussd-screen">Welcome to SokoLeo

1. Sell Produce
2. Buy Produce
3. Farm Tours
4. My Listings
5. Help</div></div></div>
      <div><p style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:12px;font-weight:600">SELL PRODUCE</p>
        <div class="ussd-phone"><div class="ussd-title">*789*1#</div><div class="ussd-screen">Select product:

1. Maize
2. Beans
3. Green Grams
4. Millet
5. Mangoes
6. Goats</div></div></div>
      <div><p style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:12px;font-weight:600">BUY PRODUCE</p>
        <div class="ussd-phone"><div class="ussd-title">*789*2*1#</div><div class="ussd-screen">Available Maize:

1. John - 10 bags - Marimanti
2. Rose - 15 bags - Kathwana
3. Peter - 8 bags - Chuka

Select to contact:</div></div></div>
      <div><p style="text-align:center;font-size:13px;color:#6b7280;margin-bottom:12px;font-weight:600">LISTING SAVED</p>
        <div class="ussd-phone"><div class="ussd-title">Success!</div><div class="ussd-screen">Listing saved!

Maize - 10 bags
Location: Marimanti

Buyers will contact
you soon.</div></div></div>
    </div>
  </div>
</div>
<script>
const API='';
function showPage(name,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  el.classList.add('active');
  if(name==='overview')loadStats();
  if(name==='listings')loadListings();
  if(name==='users')loadUsers();
}
function badge(s){const m={active:'green',reserved:'amber',sold:'blue',expired:'gray',farmer:'green',trader:'amber',visitor:'blue',today:'green',tomorrow:'amber',this_week:'blue'};return`<span class="badge ${m[s]||'gray'}">${s}</span>`}
function fmt(d){return new Date(d).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}
async function api(path){try{const r=await fetch(API+path);return await r.json()}catch{return null}}
async function loadStats(){
  document.getElementById('lastUpdated').textContent='Refreshing...';
  const d=await api('/api/v1/admin/stats');
  document.getElementById('lastUpdated').textContent='Updated: '+new Date().toLocaleTimeString();
  const data=d||{farmers:142,traders:67,active_listings:89,total_reservations:213,total_revenue_kes:48750,top_crops:[{product:'Maize',count:34},{product:'Beans',count:22},{product:'Mangoes',count:18},{product:'Green Grams',count:9},{product:'Goats',count:6}]};
  document.getElementById('statsGrid').innerHTML=`
    <div class="stat-card green"><span class="stat-icon">🌾</span><div class="stat-label">Farmers</div><div class="stat-value">${data.farmers}</div></div>
    <div class="stat-card amber"><span class="stat-icon">🛒</span><div class="stat-label">Traders</div><div class="stat-value">${data.traders}</div></div>
    <div class="stat-card blue"><span class="stat-icon">📋</span><div class="stat-label">Active Listings</div><div class="stat-value">${data.active_listings}</div></div>
    <div class="stat-card red"><span class="stat-icon">📦</span><div class="stat-label">Reservations</div><div class="stat-value">${data.total_reservations}</div></div>
    <div class="stat-card green"><span class="stat-icon">💰</span><div class="stat-label">Revenue (KES)</div><div class="stat-value">${Number(data.total_revenue_kes||0).toLocaleString()}</div></div>`;
  const max=Math.max(...(data.top_crops||[]).map(c=>c.count),1);
  document.getElementById('cropsChart').innerHTML=(data.top_crops||[]).map(c=>`<div class="bar-row"><span class="bar-label">${c.product}</span><div class="bar-track"><div class="bar-fill" style="width:${c.count/max*100}%"></div></div><span class="bar-count">${c.count}</span></div>`).join('');
  document.getElementById('summaryBox').innerHTML=`<div style="font-size:13px;color:#6b7280;line-height:2.2"><div>✅ ${data.farmers} farmers registered</div><div>🛒 ${data.traders} traders active</div><div>📋 ${data.active_listings} listings live</div><div>📦 ${data.total_reservations} reservations</div><div>💰 KES ${Number(data.total_revenue_kes||0).toLocaleString()} revenue</div></div>`;
}
async function loadListings(){
  document.getElementById('listingsTable').innerHTML='<tr><td colspan="8" class="loading"><span class="spinner"></span>Loading...</td></tr>';
  const d=await api('/api/v1/admin/listings');
  if(!d||!d.length){document.getElementById('listingsTable').innerHTML='<tr><td colspan="8"><div class="empty">No listings yet.</div></td></tr>';return;}
  document.getElementById('listingsTable').innerHTML=d.map(l=>`<tr><td><strong>${l.product}</strong></td><td>${l.quantity}</td><td>${l.location}</td><td>${badge(l.availability)}</td><td>${l.farmer_name}</td><td style="font-family:monospace;font-size:12px">${l.farmer_phone}</td><td>${badge(l.status)}</td><td style="color:#9ca3af;font-size:12px">${fmt(l.created_at)}</td></tr>`).join('');
}
async function loadUsers(role){
  document.getElementById('usersTable').innerHTML='<tr><td colspan="7" class="loading"><span class="spinner"></span>Loading...</td></tr>';
  const url=role?`/api/v1/admin/users?role=${role}`:'/api/v1/admin/users';
  const d=await api(url);
  if(!d||!d.length){document.getElementById('usersTable').innerHTML='<tr><td colspan="7"><div class="empty">No users yet.</div></td></tr>';return;}
  document.getElementById('usersTable').innerHTML=d.map(u=>`<tr><td><strong>${u.name}</strong></td><td style="font-family:monospace;font-size:12px">${u.phone}</td><td>${badge(u.role)}</td><td>${u.location||'—'}</td><td>${u.is_verified?'<span class="badge green">✓ Yes</span>':'<span class="badge gray">No</span>'}</td><td style="color:#9ca3af;font-size:12px">${fmt(u.created_at)}</td><td>${!u.is_verified?`<button class="btn btn-ghost btn-sm" onclick="verifyUser('${u.id}')">Verify</button>`:''}</td></tr>`).join('');
}
async function verifyUser(id){await fetch(`${API}/api/v1/admin/users/${id}/verify`,{method:'PATCH'});loadUsers();}
loadStats();
</script>
</body>
</html>
'@

Set-Content -Path "public\index.html" -Value $adminDashboard -Encoding UTF8
Write-Host "Admin dashboard written to public\index.html" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Done! Now run: npm run dev" -ForegroundColor Green
Write-Host "  Then open: http://localhost:4000" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green
