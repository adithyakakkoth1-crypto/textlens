const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Allow requests from your Netlify frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'TextLens API is running' });
});

// OCR endpoint
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const apiKey = process.env.OCR_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OCR API key not configured on server' });
    }

    // Build form data for OCR.space
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname || 'image.png',
      contentType: req.file.mimetype
    });
    form.append('apikey', apiKey);
    form.append('language', 'eng');
    form.append('isOverlayRequired', 'false');
    form.append('detectOrientation', 'true');
    form.append('scale', 'true');
    form.append('OCREngine', '2'); // Engine 2 is better for printed text

    const response = await axios.post(
      'https://api.ocr.space/parse/image',
      form,
      { headers: form.getHeaders(), timeout: 30000 }
    );

    const data = response.data;

    // OCR.space error handling
    if (data.IsErroredOnProcessing) {
      return res.status(422).json({ 
        error: data.ErrorMessage?.[0] || 'OCR processing failed' 
      });
    }

    const parsed = data.ParsedResults?.[0];
    if (!parsed || !parsed.ParsedText?.trim()) {
      return res.status(422).json({ error: 'No text detected in the image' });
    }

    res.json({
      text: parsed.ParsedText.trim(),
      exitCode: parsed.FileParseExitCode,
      confidence: Math.round(data.ParsedResults.reduce((acc, r) => acc + (r.TextOverlay?.Lines?.length || 0), 0)),
      engine: 'OCR.space Engine 2'
    });

  } catch (err) {
    console.error('OCR error:', err.message);
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'OCR request timed out. Try a smaller image.' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`TextLens server running on port ${PORT}`));
