const express = require('express');
const router = express.Router();
router.post('/mpesa/callback', (req, res) => res.json({ ResultCode: 0 }));
module.exports = router;
