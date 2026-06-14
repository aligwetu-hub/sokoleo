// public/api-config.js
// Single source of truth for all SokoLeo API endpoints.
// Loaded by every HTML page — use these constants in all fetch() calls.

const SOKOLEO_API = {
  // Public endpoints — no auth needed
  counties:       '/api/counties',
  listings:       '/api/listings',
  livestock:      '/api/livestock',
  negotiations:   '/api/negotiations',
  messages:       '/api/messages',
  reviews:        '/api/reviews',
  boosts:         '/api/boosts',
  pickup:         '/api/pickup',
  whatsapp:       '/api/whatsapp',
  services:       '/api/services',
  reservations:   '/api/reservations',
  vision:         '/api/vision',

  // Auth endpoints
  auth:           '/api/auth',

  // Admin endpoints — require X-Admin-Token header
  // NEVER call these from farmer.html or trader.html
  adminUsers:     '/api/admin/users',
  adminAnalytics: '/api/admin/analytics',
  adminVerify:    '/api/admin/verify',
  adminListings:  '/api/admin/listings',
};

// Guard: log a warning if any admin endpoint is called from a user-facing page
if (typeof window !== 'undefined') {
  const _userPages = ['farmer.html', 'trader.html'];
  const _currentPage = window.location.pathname.split('/').pop();
  if (_userPages.includes(_currentPage)) {
    const _origFetch = window.fetch;
    window.fetch = function(url, opts) {
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      if (u.includes('/api/admin/') && !u.includes('/api/admin/analytics')) {
        console.warn('[SokoLeo] BLOCKED admin endpoint from user page:', u);
      }
      return _origFetch.apply(this, arguments);
    };
  }
}
