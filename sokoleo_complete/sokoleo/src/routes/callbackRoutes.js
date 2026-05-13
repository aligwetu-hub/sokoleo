const express = require('express');
const router = express.Router();
const { handleUSSD } = require('../services/ussdService');
const { parseCallback } = require('../services/paymentService');
const { query } = require('../db/pool');
const { notifyPaymentConfirmed } = require('../services/smsService');

// POST /api/ussd - Africa's Talking USSD callback
router.post('/ussd', async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  if (!sessionId || !phoneNumber) {
    return res.status(400).send('END Invalid request.');
  }

  try {
    const response = await handleUSSD({ sessionId, serviceCode, phoneNumber, text });
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (err) {
    console.error('USSD handler error:', err.message);
    res.set('Content-Type', 'text/plain');
    res.send('END Service error. Please try again later.');
  }
});

// POST /api/payments/mpesa/callback - M-Pesa Daraja callback
router.post('/payments/mpesa/callback', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Acknowledge immediately

  try {
    const parsed = parseCallback(req.body);
    if (!parsed) return;

    const { success, checkoutRequestId, transactionId, amount, phone } = parsed;

    if (success && checkoutRequestId) {
      // Update payment record
      await query(
        `UPDATE payments SET status='completed', transaction_id=$1 WHERE mpesa_checkout_id=$2`,
        [transactionId, checkoutRequestId]
      );

      // Update associated reservation payment status
      await query(
        `UPDATE reservations SET payment_status='paid'
         WHERE id = (
           SELECT reference_id FROM payments WHERE mpesa_checkout_id=$1
         )`,
        [checkoutRequestId]
      );

      // Notify user
      if (phone) {
        const formattedPhone = `0${String(phone).slice(-9)}`;
        await notifyPaymentConfirmed(formattedPhone, amount, transactionId);
      }

      console.log(`✅ M-Pesa payment confirmed: ${transactionId} | KES ${amount}`);
    } else {
      await query(
        `UPDATE payments SET status='failed' WHERE mpesa_checkout_id=$1`,
        [checkoutRequestId]
      );
      console.warn(`❌ M-Pesa payment failed: ${parsed.resultDesc}`);
    }
  } catch (err) {
    console.error('M-Pesa callback error:', err.message);
  }
});

module.exports = router;
