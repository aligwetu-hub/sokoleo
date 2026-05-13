const express  = require('express');
const router   = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const multer   = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are accepted'), false);
  },
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VISION_PROMPT = `You are an expert agricultural extension officer specialising in East African crops.
Analyse the crop photo provided and respond with a JSON object (no markdown fences) with these exact fields:
{
  "crop": "name of the crop/plant identified, or 'Unknown'",
  "health_status": "Healthy | Stressed | Diseased | Severely Diseased",
  "issues": "comma-separated list of visible issues, or 'None detected'",
  "recommendations": "2-4 practical treatment/management recommendations for smallholder farmers in Kenya",
  "urgency": "low | medium | high",
  "confidence": "high | medium | low"
}
Focus on common Kenyan crops: maize, beans, tomatoes, potatoes, kale, cassava, sorghum, millet, coffee, tea.
Keep recommendations practical and affordable for rural smallholder farmers.`;

// POST /api/vision/analyze
router.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  if (!process.env.ANTHROPIC_API_KEY) {
    // Mock response when API key is not configured
    return res.json({
      crop: 'Maize',
      health_status: 'Stressed',
      issues: 'Leaf discolouration, possible nitrogen deficiency',
      recommendations: 'Apply CAN fertiliser at 50kg/acre. Ensure adequate soil moisture. Check for fall armyworm damage and treat with Duduthrin if found.',
      urgency: 'medium',
      confidence: 'medium',
      mock: true,
    });
  }

  try {
    const imageBase64 = req.file.buffer.toString('base64');
    const mediaType   = req.file.mimetype;

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text',  text: VISION_PROMPT },
        ],
      }],
    });

    const raw = response.content[0].text.trim();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      // If Claude returned free text instead of JSON, structure it
      result = {
        crop: 'See analysis',
        health_status: 'See analysis',
        issues: raw.slice(0, 200),
        recommendations: 'Please consult a local agricultural extension officer.',
        urgency: 'medium',
        confidence: 'low',
      };
    }
    res.json(result);
  } catch (err) {
    console.error('Vision API error:', err.message);
    if (err.status === 401) return res.status(500).json({ error: 'AI service not configured. Contact admin.' });
    res.status(500).json({ error: 'Image analysis failed. Please try again.' });
  }
});

// GET /api/vision/health — check if vision is available
router.get('/health', (req, res) => {
  res.json({
    available: !!process.env.ANTHROPIC_API_KEY,
    message: process.env.ANTHROPIC_API_KEY
      ? 'AI Vision is active'
      : 'AI Vision requires ANTHROPIC_API_KEY to be configured',
  });
});

module.exports = router;
