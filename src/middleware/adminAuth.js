function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'sokoleo-admin-2026';
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — admin access required' });
  }
  next();
}

module.exports = adminAuth;
