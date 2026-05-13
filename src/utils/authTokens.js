const crypto = require('crypto');

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  generateOtpCode,
  generateSessionToken
};
