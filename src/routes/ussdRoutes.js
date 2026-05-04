const express = require('express');
const router = express.Router();
const { handleUSSD } = require('../services/ussdService');
router.post('/', async (req, res) => {
  try {
    const response = await handleUSSD(req.body);
    res.set('Content-Type','text/plain').send(response);
  } catch(e) { res.set('Content-Type','text/plain').send('END Service error. Try again.'); }
});
module.exports = router;
