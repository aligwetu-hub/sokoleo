/**
 * SokoLeo PWA helper — loaded via <script src="/pwa.js"> on every page.
 * Handles: SW registration + install prompt banner.
 */

// ── 1. Service Worker registration ───────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SokoLeo SW registered'))
      .catch(err => console.log('SW error:', err));
  });
}

// ── 2. Install prompt banner ──────────────────────────────────────────────────
(function(){
  // Inject the banner HTML into the page
  const el = document.createElement('div');
  el.innerHTML = `<div id="installBanner" style="display:none;position:fixed;bottom:0;left:0;right:0;
  background:#166534;color:white;padding:.75rem 1.5rem;z-index:9999;
  align-items:center;justify-content:space-between;
  font-family:'DM Sans',sans-serif;font-size:.85rem;gap:1rem;">
  <div style="display:flex;align-items:center;gap:.75rem">
    <img src="/logo.png" style="height:32px;width:32px;border-radius:50%"/>
    <div>
      <div style="font-weight:600">Install SokoLeo on your phone</div>
      <div style="font-size:.75rem;opacity:.85">Works offline · Soko Kila Siku</div>
    </div>
  </div>
  <div style="display:flex;gap:.5rem;flex-shrink:0">
    <button onclick="installPWA()" style="background:white;color:#166534;border:none;
      padding:7px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:.83rem">
      Install
    </button>
    <button onclick="document.getElementById('installBanner').style.display='none'"
      style="background:rgba(255,255,255,.2);color:white;border:none;
      padding:7px 12px;border-radius:6px;cursor:pointer;font-size:.83rem">
      ✕
    </button>
  </div>
</div>`;
  document.body.appendChild(el.firstElementChild);

  // Banner logic
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(()=>{
      document.getElementById('installBanner').style.display='flex';
    }, 3000);
  });

  window.installPWA = function(){
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(result => {
      if(result.outcome === 'accepted'){
        document.getElementById('installBanner').style.display='none';
      }
      deferredPrompt = null;
    });
  };

  window.addEventListener('appinstalled', ()=>{
    document.getElementById('installBanner').style.display='none';
  });
})();
