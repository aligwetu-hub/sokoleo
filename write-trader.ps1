# Write trader.html directly to public folder
Write-Host "Writing trader.html..." -ForegroundColor Yellow

$html = @'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SokoLeo Trader</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root{--earth:#3d2b1f;--green:#2d6a4f;--green2:#40916c;--green3:#74c69d;--green-pale:#d8f3dc;--sun:#f4a261;--white:#ffffff;--gray:#f4f4f5;--border:#e4e4e7;--text:#18181b;--muted:#71717a;--red:#ef4444}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--gray);color:var(--text);min-height:100vh}
    #authScreen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--earth) 0%,#2d4a3e 50%,var(--green) 100%);padding:20px}
    .auth-card{background:#fff;border-radius:24px;padding:48px 40px;width:100%;max-width:420px;box-shadow:0 32px 80px rgba(0,0,0,0.3)}
    .auth-logo{text-align:center;margin-bottom:32px}
    .mark{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--green),var(--green2));font-size:32px;margin-bottom:16px}
    .auth-logo h1{font-size:28px;font-weight:800;color:var(--earth)}
    .auth-logo h1 span{color:var(--green2)}
    .auth-logo p{color:var(--muted);font-size:14px;margin-top:4px}
    .auth-step{display:none}.auth-step.active{display:block}
    .form-group{margin-bottom:16px}
    label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
    .form-control{width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;outline:none;transition:border-color 0.15s}
    .form-control:focus{border-color:var(--green2)}
    .form-control.mono{font-family:'DM Mono',monospace;font-size:22px;letter-spacing:8px;text-align:center}
    .btn-full{width:100%;padding:13px;background:linear-gradient(135deg,var(--green),var(--green2));color:#fff;border:none;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px}
    .btn-full:hover{opacity:0.92}
    .btn-link{background:none;border:none;color:var(--green2);font-size:13px;font-weight:600;cursor:pointer;padding:0;font-family:'Plus Jakarta Sans',sans-serif}
    .otp-hint{background:var(--green-pale);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--green);margin-bottom:20px;text-align:center}
    .error-msg{color:var(--red);font-size:13px;margin-top:8px;text-align:center;min-height:18px}
    .timer{color:var(--muted);font-size:12px;text-align:center;margin-top:10px}
    .auth-footer{text-align:center;margin-top:20px;color:var(--muted);font-size:13px}
    #appScreen{display:none}
    .topnav{background:var(--earth);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100}
    .topnav-logo{font-size:20px;font-weight:800;color:#fff}
    .topnav-logo span{color:var(--sun)}
    .user-chip{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.1);border-radius:999px;padding:6px 14px 6px 6px}
    .avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--green3),#48cae4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--earth)}
    .user-name{font-size:13px;color:#fff;font-weight:600}
    .btn-logout{background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.6);font-size:13px;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-left:8px}
    .tabnav{background:#fff;border-bottom:1px solid var(--border);display:flex;padding:0 24px;gap:4px;overflow-x:auto}
    .tab{padding:14px 16px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
    .tab:hover{color:var(--green2)}.tab.active{color:var(--green);border-bottom-color:var(--green)}
    .content{padding:28px 24px;max-width:1100px;margin:0 auto}
    .panel{display:none}.panel.active{display:block}
    .kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:28px}
    .kpi{background:#fff;border-radius:14px;padding:18px;border:1px solid var(--border)}
    .kpi-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted)}
    .kpi-value{font-size:30px;font-weight:800;margin-top:6px;font-family:'DM Mono',monospace;color:var(--earth)}
    .search-box{background:#fff;border-radius:16px;padding:20px;border:1px solid var(--border);margin-bottom:20px}
    .search-box h3{font-size:15px;font-weight:700;margin-bottom:14px}
    .search-row{display:flex;gap:10px;flex-wrap:wrap}
    .search-select,.search-input{padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;background:#fff;outline:none}
    .search-select:focus,.search-input:focus{border-color:var(--green2)}
    .btn-search{padding:10px 20px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
    .listings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .listing-card{background:#fff;border-radius:14px;border:1px solid var(--border);padding:18px;transition:box-shadow 0.15s}
    .listing-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08)}
    .listing-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
    .listing-product{font-size:17px;font-weight:700;color:var(--earth)}
    .listing-qty{font-size:13px;color:var(--muted);margin-top:2px}
    .avail-badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px}
    .avail-today{background:#dcfce7;color:#166534}.avail-tomorrow{background:#fef9c3;color:#854d0e}.avail-week{background:#dbeafe;color:#1e40af}
    .listing-info{font-size:13px;color:var(--muted);line-height:1.8}
    .listing-info strong{color:var(--text)}
    .listing-actions{display:flex;gap:8px;margin-top:14px}
    .btn-call{flex:1;padding:9px;background:var(--green-pale);color:var(--green);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
    .btn-reserve{flex:1;padding:9px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
    .table-wrap{background:#fff;border-radius:16px;border:1px solid var(--border);overflow:hidden}
    .table-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .table-head h3{font-size:15px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th{padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:700;background:#fafafa;border-bottom:1px solid var(--border)}
    td{padding:13px 16px;font-size:13px;border-bottom:1px solid #f4f4f5}
    tr:last-child td{border-bottom:none}tr:hover td{background:#fafafa}
    .badge{display:inline-flex;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700}
    .badge-pending{background:#fef9c3;color:#854d0e}.badge-confirmed{background:#dcfce7;color:#166534}.badge-paid{background:#dcfce7;color:#166534}.badge-failed{background:#fee2e2;color:#991b1b}.badge-cancelled{background:#f4f4f5;color:#52525b}
    .sub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
    .sub-card{background:#fff;border-radius:16px;border:2px solid var(--border);padding:24px;position:relative}
    .sub-card.current{border-color:var(--green)}
    .sub-tier{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
    .sub-price{font-size:26px;font-weight:800;color:var(--earth);margin:8px 0;font-family:'DM Mono',monospace}
    .sub-price span{font-size:13px;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif;font-weight:500}
    .sub-features{font-size:13px;color:var(--muted);line-height:2;margin-top:12px;list-style:none}
    .sub-features li::before{content:'✓ ';color:var(--green2);font-weight:700}
    .btn-sub{width:100%;margin-top:16px;padding:11px;border:none;border-radius:8px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;background:var(--green);color:#fff}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:999;padding:20px}
    .modal-overlay.open{display:flex}
    .modal{background:#fff;border-radius:20px;padding:32px;width:100%;max-width:420px}
    .modal h3{font-size:18px;font-weight:800;margin-bottom:6px}
    .modal p{font-size:13px;color:var(--muted);margin-bottom:20px}
    .modal-actions{display:flex;gap:10px;margin-top:20px}
    .btn-cancel{flex:1;padding:11px;background:var(--gray);border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
    .btn-confirm{flex:2;padding:11px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
    .toast{position:fixed;bottom:24px;right:24px;background:var(--earth);color:#fff;border-radius:12px;padding:14px 20px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.2);transform:translateY(80px);opacity:0;transition:all 0.3s;z-index:9999}
    .toast.show{transform:translateY(0);opacity:1}
    .loading-state{text-align:center;padding:48px;color:var(--muted);font-size:14px}
    .spinner{display:inline-block;width:22px;height:22px;border:2px solid var(--border);border-top-color:var(--green);border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .empty-state{text-align:center;padding:48px 20px;color:var(--muted)}
    .empty-icon{font-size:44px;display:block;margin-bottom:12px}
  </style>
</head>
<body>
<div id="authScreen">
  <div class="auth-card">
    <div class="auth-logo">
      <div class="mark">🌽</div>
      <h1>Soko<span>Leo</span></h1>
      <p>Trader Portal · Tharaka Nithi</p>
    </div>
    <div class="auth-step active" id="stepPhone">
      <div class="form-group">
        <label>Your phone number</label>
        <input class="form-control" id="phoneInput" type="tel" placeholder="e.g. 0712 345 678" />
      </div>
      <button class="btn-full" onclick="requestOTP()">Send OTP Code →</button>
      <div class="error-msg" id="phoneError"></div>
      <div class="auth-footer"><span>No account? </span><button class="btn-link" onclick="showStep('stepRegister')">Register as trader</button></div>
    </div>
    <div class="auth-step" id="stepOTP">
      <div class="otp-hint" id="otpHint">OTP sent to your phone</div>
      <div class="form-group">
        <label>Enter 6-digit OTP</label>
        <input class="form-control mono" id="otpInput" type="tel" maxlength="6" placeholder="······" oninput="if(this.value.length===6)verifyOTP()" />
      </div>
      <button class="btn-full" onclick="verifyOTP()">Verify & Login →</button>
      <div class="error-msg" id="otpError"></div>
      <div class="timer" id="resendTimer"></div>
      <div class="auth-footer"><button class="btn-link" onclick="showStep('stepPhone')">← Change number</button></div>
    </div>
    <div class="auth-step" id="stepRegister">
      <div class="form-group"><label>Full Name</label><input class="form-control" id="regName" placeholder="e.g. James Mwangi" /></div>
      <div class="form-group"><label>Phone Number</label><input class="form-control" id="regPhone" type="tel" placeholder="0712 345 678" /></div>
      <div class="form-group"><label>Location</label><input class="form-control" id="regLocation" placeholder="e.g. Chuka, Tharaka Nithi" /></div>
      <button class="btn-full" onclick="registerTrader()">Create Account →</button>
      <div class="error-msg" id="regError"></div>
      <div class="auth-footer"><button class="btn-link" onclick="showStep('stepPhone')">← Already have account</button></div>
    </div>
  </div>
</div>

<div id="appScreen">
  <nav class="topnav">
    <div class="topnav-logo">Soko<span>Leo</span> <span style="font-size:13px;color:rgba(255,255,255,0.4);font-weight:400">Trader</span></div>
    <div style="display:flex;align-items:center">
      <div class="user-chip"><div class="avatar" id="navAvatar">T</div><span class="user-name" id="navName">Trader</span></div>
      <button class="btn-logout" onclick="logout()">Logout</button>
    </div>
  </nav>
  <div class="tabnav">
    <div class="tab active" onclick="switchTab('dashboard',this)">📊 Dashboard</div>
    <div class="tab" onclick="switchTab('browse',this)">🔍 Browse Produce</div>
    <div class="tab" onclick="switchTab('reservations',this)">📦 My Reservations</div>
    <div class="tab" onclick="switchTab('subscription',this)">⭐ Subscription</div>
  </div>
  <div class="content">
    <div class="panel active" id="panel-dashboard">
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-label">My Reservations</div><div class="kpi-value" id="kpiRes">—</div></div>
        <div class="kpi"><div class="kpi-label">Confirmed</div><div class="kpi-value" id="kpiConf">—</div></div>
        <div class="kpi"><div class="kpi-label">Active Listings</div><div class="kpi-value" id="kpiList">—</div></div>
        <div class="kpi"><div class="kpi-label">Plan</div><div class="kpi-value" id="kpiSub" style="font-size:18px;padding-top:8px">Free</div></div>
      </div>
      <div class="table-wrap">
        <div class="table-head"><h3>Recent Reservations</h3></div>
        <table><thead><tr><th>Product</th><th>Qty</th><th>Location</th><th>Farmer</th><th>Status</th><th>Payment</th><th>Date</th></tr></thead>
        <tbody id="recentResTable"><tr><td colspan="7" class="loading-state"><span class="spinner"></span>Loading...</td></tr></tbody></table>
      </div>
    </div>
    <div class="panel" id="panel-browse">
      <div class="search-box">
        <h3>🌽 Find Produce</h3>
        <div class="search-row">
          <select class="search-select" id="filterProduct"><option value="">All Products</option><option>Maize</option><option>Beans</option><option>Green Grams</option><option>Millet</option><option>Mangoes</option><option>Goats</option></select>
          <input class="search-input" id="filterLocation" placeholder="Location (e.g. Marimanti)" />
          <select class="search-select" id="filterAvail"><option value="">Any time</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="this_week">This Week</option></select>
          <button class="btn-search" onclick="searchListings()">Search</button>
        </div>
      </div>
      <div class="listings-grid" id="listingsGrid"><div class="loading-state" style="grid-column:1/-1"><span class="spinner"></span>Loading produce...</div></div>
    </div>
    <div class="panel" id="panel-reservations">
      <div class="table-wrap">
        <div class="table-head"><h3>My Reservations</h3><button style="background:none;border:1px solid var(--border);padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit" onclick="loadReservations()">↻ Refresh</button></div>
        <table><thead><tr><th>Product</th><th>Qty</th><th>Location</th><th>Farmer</th><th>Phone</th><th>Status</th><th>Payment</th><th>Date</th></tr></thead>
        <tbody id="resTable"><tr><td colspan="8" class="loading-state"><span class="spinner"></span>Loading...</td></tr></tbody></table>
      </div>
    </div>
    <div class="panel" id="panel-subscription">
      <div style="margin-bottom:20px"><h2 style="font-size:22px;font-weight:800">Subscription Plans</h2><p style="color:var(--muted);font-size:14px;margin-top:4px">Get priority SMS alerts when new produce is listed</p></div>
      <div class="sub-grid">
        <div class="sub-card current" id="subFree"><div class="sub-tier">Free</div><div class="sub-price">KES 0 <span>/month</span></div><ul class="sub-features"><li>Browse all listings</li><li>Call farmers directly</li><li>Place reservations</li></ul><button class="btn-sub" style="background:var(--gray);color:var(--text)" disabled>Current Plan</button></div>
        <div class="sub-card" id="subBasic"><div class="sub-tier">Basic</div><div class="sub-price">KES 500 <span>/month</span></div><ul class="sub-features"><li>Everything in Free</li><li>SMS alerts for new produce</li><li>Priority in search</li></ul><button class="btn-sub" onclick="showToast('📱 M-Pesa payment coming soon!')">Upgrade to Basic</button></div>
        <div class="sub-card" id="subPro"><div class="sub-tier">Pro</div><div class="sub-price">KES 1,000 <span>/month</span></div><ul class="sub-features"><li>Everything in Basic</li><li>Instant SMS on listing</li><li>Monthly market insights</li></ul><button class="btn-sub" onclick="showToast('📱 M-Pesa payment coming soon!')">Upgrade to Pro</button></div>
        <div class="sub-card" id="subBulk"><div class="sub-tier">Bulk Buyer</div><div class="sub-price">KES 2,000 <span>/month</span></div><ul class="sub-features"><li>Everything in Pro</li><li>Bulk reservation priority</li><li>Dedicated support</li></ul><button class="btn-sub" onclick="showToast('📱 M-Pesa payment coming soon!')">Upgrade to Bulk</button></div>
      </div>
    </div>
  </div>
</div>

<div class="modal-overlay" id="reserveModal">
  <div class="modal">
    <h3>Reserve Produce</h3>
    <p id="reserveModalDesc"></p>
    <div class="form-group"><label>Quantity to reserve</label><input class="form-control" id="reserveQty" placeholder="e.g. 5 bags" /></div>
    <div class="form-group"><label>Notes (optional)</label><input class="form-control" id="reserveNotes" placeholder="e.g. Pick up Friday morning" /></div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-confirm" onclick="confirmReserve()">Confirm Reservation</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const API='';
let currentUser=null,selectedListing=null,otpTimer=null;
function saveAuth(token,user){sessionStorage.setItem('sl_token',token);sessionStorage.setItem('sl_user',JSON.stringify(user))}
function getToken(){return sessionStorage.getItem('sl_token')}
function getUser(){const u=sessionStorage.getItem('sl_user');return u?JSON.parse(u):null}
function clearAuth(){sessionStorage.removeItem('sl_token');sessionStorage.removeItem('sl_user')}
function showStep(id){document.querySelectorAll('.auth-step').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active')}
function normalizePhone(p){p=p.replace(/\s/g,'');if(p.startsWith('07')||p.startsWith('01'))return'254'+p.slice(1);if(p.startsWith('+254'))return p.slice(1);return p}
async function requestOTP(){
  const raw=document.getElementById('phoneInput').value.trim();
  if(!raw)return showError('phoneError','Enter your phone number.');
  const phone=normalizePhone(raw);
  const res=await apiFetch('/api/v1/auth/otp/send','POST',{phone});
  if(res.error)return showError('phoneError',res.error);
  document.getElementById('otpHint').textContent='OTP sent to '+raw;
  document.getElementById('phoneInput').dataset.phone=phone;
  showStep('stepOTP');startTimer(phone);
}
async function verifyOTP(){
  const phone=document.getElementById('phoneInput').dataset.phone;
  const otp=document.getElementById('otpInput').value.trim();
  if(!otp||otp.length<6)return showError('otpError','Enter the 6-digit code.');
  const res=await apiFetch('/api/v1/auth/otp/verify','POST',{phone,otp});
  if(res.error)return showError('otpError',res.error);
  saveAuth(res.token,res.user);bootApp(res.user);
}
async function registerTrader(){
  const name=document.getElementById('regName').value.trim();
  const rawPhone=document.getElementById('regPhone').value.trim();
  const location=document.getElementById('regLocation').value.trim();
  if(!name||!rawPhone)return showError('regError','Name and phone are required.');
  const phone=normalizePhone(rawPhone);
  const res=await apiFetch('/api/v1/auth/register','POST',{name,phone,location,role:'trader'});
  if(res.error)return showError('regError',res.error);
  document.getElementById('phoneInput').value=rawPhone;
  document.getElementById('phoneInput').dataset.phone=phone;
  document.getElementById('otpHint').textContent='OTP sent to '+rawPhone;
  showStep('stepOTP');startTimer(phone);
}
function startTimer(phone){
  let s=60;const el=document.getElementById('resendTimer');
  clearInterval(otpTimer);
  otpTimer=setInterval(()=>{el.textContent='Resend in '+s+'s';if(--s<0){clearInterval(otpTimer);el.innerHTML='<button class="btn-link" onclick="requestOTP()">Resend OTP</button>';}},1000);
}
function bootApp(user){
  currentUser=user;
  document.getElementById('authScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('navName').textContent=user.name.split(' ')[0];
  document.getElementById('navAvatar').textContent=user.name[0].toUpperCase();
  loadDashboard();searchListings();
}
function logout(){clearAuth();currentUser=null;document.getElementById('appScreen').style.display='none';document.getElementById('authScreen').style.display='flex';showStep('stepPhone')}
function switchTab(name,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');document.getElementById('panel-'+name).classList.add('active');
  if(name==='reservations')loadReservations();
}
async function loadDashboard(){
  const ress=await apiFetch('/api/v1/reservations/trader/'+formatPhone(currentUser.phone));
  if(ress&&!ress.error){
    document.getElementById('kpiRes').textContent=ress.length;
    document.getElementById('kpiConf').textContent=ress.filter(r=>r.status==='confirmed'||r.status==='completed').length;
    renderRecentRes(ress.slice(0,5));
  }
  const listings=await apiFetch('/api/v1/listings?limit=1');
  if(listings&&!listings.error)document.getElementById('kpiList').textContent=listings.count??0;
}
function renderRecentRes(rows){
  if(!rows.length){document.getElementById('recentResTable').innerHTML='<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📦</span>No reservations yet.</div></td></tr>';return;}
  document.getElementById('recentResTable').innerHTML=rows.map(r=>`<tr><td><strong>${r.product}</strong></td><td>${r.quantity}</td><td>${r.location}</td><td>${r.farmer_name}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td><span class="badge badge-${r.payment_status}">${r.payment_status}</span></td><td style="color:#9ca3af;font-size:12px">${new Date(r.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</td></tr>`).join('');
}
async function searchListings(){
  const product=document.getElementById('filterProduct').value;
  const location=document.getElementById('filterLocation').value;
  const avail=document.getElementById('filterAvail').value;
  let url='/api/v1/listings?limit=30';
  if(product)url+='&product='+encodeURIComponent(product);
  if(location)url+='&location='+encodeURIComponent(location);
  if(avail)url+='&availability='+avail;
  document.getElementById('listingsGrid').innerHTML='<div class="loading-state" style="grid-column:1/-1"><span class="spinner"></span>Searching...</div>';
  const data=await apiFetch(url);
  if(!data||data.error||!data.listings){document.getElementById('listingsGrid').innerHTML='<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">⚠️</span>Could not load listings.</div>';return;}
  if(!data.listings.length){document.getElementById('listingsGrid').innerHTML='<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">🌽</span>No produce found.</div>';return;}
  document.getElementById('listingsGrid').innerHTML=data.listings.map(l=>{
    const ac=l.availability==='today'?'avail-today':l.availability==='tomorrow'?'avail-tomorrow':'avail-week';
    const al=l.availability==='this_week'?'This Week':l.availability.charAt(0).toUpperCase()+l.availability.slice(1);
    return`<div class="listing-card"><div class="listing-header"><div><div class="listing-product">${l.product}</div><div class="listing-qty">${l.quantity} ${l.unit||''}</div></div><span class="avail-badge ${ac}">${al}</span></div><div class="listing-info"><strong>📍</strong> ${l.location}<br><strong>👤</strong> ${l.farmer_name}${l.price_per_unit?'<br><strong>💰</strong> KES '+l.price_per_unit:''}</div><div class="listing-actions"><button class="btn-call" onclick="window.location='tel:${l.farmer_phone}'">📞 Call</button><button class="btn-reserve" onclick="openModal('${l.id}','${l.product}','${l.quantity}','${l.farmer_name}')">Reserve</button></div></div>`;
  }).join('');
}
async function loadReservations(){
  document.getElementById('resTable').innerHTML='<tr><td colspan="8" class="loading-state"><span class="spinner"></span>Loading...</td></tr>';
  const data=await apiFetch('/api/v1/reservations/trader/'+formatPhone(currentUser.phone));
  if(!data||data.error){document.getElementById('resTable').innerHTML='<tr><td colspan="8"><div class="empty-state">Could not load reservations.</div></td></tr>';return;}
  if(!data.length){document.getElementById('resTable').innerHTML='<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">📦</span>No reservations yet.</div></td></tr>';return;}
  document.getElementById('resTable').innerHTML=data.map(r=>`<tr><td><strong>${r.product}</strong></td><td>${r.quantity_reserved||r.quantity}</td><td>${r.location}</td><td>${r.farmer_name}</td><td style="font-family:monospace;font-size:12px">${r.farmer_phone}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td><span class="badge badge-${r.payment_status}">${r.payment_status}</span></td><td style="color:#9ca3af;font-size:12px">${new Date(r.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</td></tr>`).join('');
}
function formatPhone(p){return p.startsWith('254')?'0'+p.slice(3):p}
function openModal(id,product,qty,farmer){selectedListing=id;document.getElementById('reserveModalDesc').textContent=product+' ('+qty+') from '+farmer;document.getElementById('reserveQty').value=qty;document.getElementById('reserveModal').classList.add('open')}
function closeModal(){document.getElementById('reserveModal').classList.remove('open');selectedListing=null}
async function confirmReserve(){
  if(!selectedListing)return;
  const phone=formatPhone(currentUser.phone);
  const qty=document.getElementById('reserveQty').value;
  const notes=document.getElementById('reserveNotes').value;
  const res=await apiFetch('/api/v1/reservations','POST',{listing_id:selectedListing,trader_phone:phone,quantity_reserved:qty,notes});
  closeModal();
  if(res.error)showToast('❌ '+res.error);
  else{showToast('✅ Reservation placed! Farmer notified.');loadDashboard();}
}
async function apiFetch(path,method='GET',body=null){
  try{const opts={method,headers:{'Content-Type':'application/json'}};
  const t=getToken();if(t)opts.headers['Authorization']='Bearer '+t;
  if(body)opts.body=JSON.stringify(body);
  const res=await fetch(API+path,opts);return await res.json();
  }catch{return{error:'Cannot connect to server.'};}
}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500)}
function showError(id,msg){document.getElementById(id).textContent=msg}
const saved=getUser();const savedToken=getToken();
if(saved&&savedToken)bootApp(saved);
</script>
</body>
</html>
'@

Set-Content -Path "public\trader.html" -Value $html -Encoding UTF8
Write-Host "trader.html written successfully!" -ForegroundColor Green
Write-Host "Now refresh: http://localhost:4000/trader.html" -ForegroundColor Cyan
