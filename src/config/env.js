const dotenv = require('dotenv');

dotenv.config();

function parseCsv(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  smsProvider: process.env.SMS_PROVIDER || 'mock',
  africasTalkingUsername: process.env.AT_USERNAME || 'sandbox',
  africasTalkingApiKey: process.env.AT_API_KEY || '',
  africasTalkingSenderId: process.env.AT_SENDER_ID || '',
  africasTalkingBaseUrl: process.env.AT_BASE_URL || 'https://api.africastalking.com/version1',
  atVerifyCallbacks: String(process.env.AT_VERIFY_CALLBACKS || 'false').toLowerCase() === 'true',
  atAllowedIps: parseCsv(process.env.AT_ALLOWED_IPS),
  mpesaShortcode: process.env.MPESA_SHORTCODE || '',
  mpesaPasskey: process.env.MPESA_PASSKEY || '',
  mpesaCallbackUrl: process.env.MPESA_CALLBACK_URL || '',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 72)
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

module.exports = config;
