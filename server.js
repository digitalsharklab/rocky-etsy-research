const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => {
  res.json({ status: 'ok', apiKeyPresent: !!ANTHROPIC_API_KEY });
});
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ success: false, error: 'API key missing' });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: message }],
        system: 'You are R.O.C.K.Y., an AI assistant for Etsy digital product sellers.'
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ success: false, error: data.error?.message });
    res.json({ success: true, response: data.content?.[0]?.text || 'No response' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
