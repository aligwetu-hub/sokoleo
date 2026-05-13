const config = require('../config/env');

function normalizeIp(ip) {
  if (!ip) {
    return '';
  }

  const value = String(ip).trim();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function getRequestIps(req) {
  const ips = [];

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    String(forwarded)
      .split(',')
      .map((ip) => normalizeIp(ip))
      .filter(Boolean)
      .forEach((ip) => ips.push(ip));
  }

  if (req.ip) {
    ips.push(normalizeIp(req.ip));
  }

  if (req.socket && req.socket.remoteAddress) {
    ips.push(normalizeIp(req.socket.remoteAddress));
  }

  return [...new Set(ips.filter(Boolean))];
}

function parseBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const encoded = authHeader.slice(6).trim();
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      apiKey: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
}

function credentialsMatch(username, apiKey) {
  return (
    Boolean(username) &&
    Boolean(apiKey) &&
    username === config.africasTalkingUsername &&
    apiKey === config.africasTalkingApiKey
  );
}

function requestHasValidCredentials(req) {
  const basic = parseBasicAuth(req.headers.authorization || '');
  if (basic && credentialsMatch(basic.username, basic.apiKey)) {
    return true;
  }

  const headerUser = req.headers.username || req.headers['x-username'];
  const headerKey = req.headers.apikey || req.headers['api-key'] || req.headers['x-api-key'];
  if (credentialsMatch(headerUser, headerKey)) {
    return true;
  }

  return false;
}

function requestHasAllowedIp(req) {
  if (!config.atAllowedIps.length) {
    return false;
  }

  const requestIps = getRequestIps(req);
  return requestIps.some((ip) => config.atAllowedIps.includes(ip));
}

function verifyAfricasTalkingCallback(req, res, next) {
  if (!config.atVerifyCallbacks) {
    return next();
  }

  const validByCredentials = requestHasValidCredentials(req);
  const validByIp = requestHasAllowedIp(req);

  if (!validByCredentials && !validByIp) {
    return res.status(403).send('END forbidden');
  }

  return next();
}

module.exports = {
  verifyAfricasTalkingCallback
};
