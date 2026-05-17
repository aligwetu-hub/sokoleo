const express = require('express');
const router  = express.Router();
const { sendSMS } = require('../services/smsService');

// POST /api/sms/test — admin can verify SMS delivery
router.post('/test', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message)
    return res.status(400).json({ error: 'phone and message are required' });
  const result = await sendSMS(phone, message);
  res.json(result);
});

module.exports = router;
