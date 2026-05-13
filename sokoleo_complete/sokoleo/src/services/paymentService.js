const axios = require('axios');
require('dotenv').config();

const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';
const BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;

  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    console.warn('[M-Pesa] No credentials — returning mock token');
    return 'mock_token';
  }

  const creds = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });

  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

function getPassword(timestamp) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/**
 * Initiate M-Pesa STK Push
 * @param {string} phone - Customer phone (254XXXXXXXXX)
 * @param {number} amount - Amount in KES
 * @param {string} accountRef - Order/reservation reference
 * @param {string} description - Transaction description
 */
async function initiateSTKPush(phone, amount, accountRef, description) {
  if (MPESA_ENV !== 'production' && (!process.env.MPESA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY === 'your_consumer_key')) {
    console.log(`[M-Pesa MOCK] STK Push to ${phone} for KES ${amount} | Ref: ${accountRef}`);
    return {
      success: true,
      mock: true,
      CheckoutRequestID: `mock_${Date.now()}`,
      MerchantRequestID: `mock_merchant_${Date.now()}`,
    };
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(timestamp);

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: description,
    };

    const res = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return { success: true, ...res.data };
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('[M-Pesa] STK Push error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Handle M-Pesa callback
 */
function parseCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return null;

  const success = stk.ResultCode === 0;
  const metadata = {};

  if (success && stk.CallbackMetadata?.Item) {
    stk.CallbackMetadata.Item.forEach(item => {
      metadata[item.Name] = item.Value;
    });
  }

  return {
    success,
    resultCode: stk.ResultCode,
    resultDesc: stk.ResultDesc,
    checkoutRequestId: stk.CheckoutRequestID,
    merchantRequestId: stk.MerchantRequestID,
    transactionId: metadata.MpesaReceiptNumber || null,
    amount: metadata.Amount || null,
    phone: metadata.PhoneNumber || null,
  };
}

module.exports = { initiateSTKPush, parseCallback };
