const repo = require('../db/repositories');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'missing bearer token' });
    }

    const session = await repo.findActiveSessionByToken(token);
    if (!session) {
      return res.status(401).json({ error: 'invalid or expired session' });
    }

    req.auth = {
      token: session.token,
      user: {
        id: session.user_id,
        name: session.name,
        phone: session.phone,
        role: session.role,
        location: session.location
      }
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!allowedRoles.includes(req.auth.user.role)) {
      return res.status(403).json({ error: 'forbidden for this role' });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
