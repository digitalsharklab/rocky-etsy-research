const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'R.O.C.K.Y. Backend running' });
});

// ROOT - serve Rocky UI
app.get('/', (req, res) => {
  res.json({ message: 'R.O.C.K.Y. Backend API is running. Use /api/chat for chat endpoint.' });
});

// ============================================
// CLAUDE CHAT ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    
    if (!ANTHROPIC_API_KEY) {
      console.error('❌ API Key not configured!');
      return res.status(500).json({ success: false, error: 'API key not configured on server' });
    }

    console.log('📤 Calling Claude API...');
    console.log('Message:', message.substring(0, 50) + '...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: message }],
        system: 'You are R.O.C.K.Y., an AI assistant for Etsy digital product sellers. Help them research markets, find trends, and create successful products.'
      })
    });

    console.log('📊 Claude API response status:', response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Claude API error:', data);
      return res.status(response.status).json({ 
        success: false, 
        error: data.error?.message || 'Claude API error' 
      });
    }

    const reply = data.content?.[0]?.text || 'No response from Claude';
    
    console.log('✅ Success! Response:', reply.substring(0, 50) + '...');

    res.json({
      success: true,
      response: reply,
      model: 'claude-sonnet-4-20250514'
    });

  } catch (error) {
    console.error('🚨 Chat endpoint error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// ETSY RESEARCH ENDPOINTS (Placeholder)
// ============================================

app.post('/api/research/category', async (req, res) => {
  try {
    const { category } = req.body;
    res.json({
      success: true,
      category: category,
      analysis: `Placeholder analysis for ${category}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/research/all', async (req, res) => {
  try {
    res.json({
      success: true,
      results: {
        'digital-templates': 'Placeholder',
        'printable-planners': 'Placeholder',
        'ebooks': 'Placeholder'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`✅ R.O.C.K.Y. Backend listening on port ${PORT}`);
  console.log(`📍 API available at: https://rocky-etsy-research.vercel.app`);
  console.log(`💬 Chat endpoint: POST /api/chat`);
  console.log(`🔍 Research endpoints: POST /api/research/category, POST /api/research/all`);
});