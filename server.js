const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting R.O.C.K.Y. Backend...');
console.log('🔑 API Key present:', !!ANTHROPIC_API_KEY);
console.log('📍 Port:', PORT);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'R.O.C.K.Y. Backend running',
    apiKeyPresent: !!ANTHROPIC_API_KEY
  });
});

// ROOT
app.get('/', (req, res) => {
  res.json({ 
    message: 'R.O.C.K.Y. Backend API is running',
    endpoints: {
      chat: 'POST /api/chat',
      research: 'POST /api/research/category',
      health: 'GET /health'
    }
  });
});

// ============================================
// CLAUDE CHAT ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    console.log('\n📨 New chat request received');
    
    const { message } = req.body;
    
    if (!message) {
      console.log('❌ No message provided');
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }
    
    console.log('📝 Message:', message.substring(0, 50) + '...');
    
    if (!ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY is not configured!');
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured. Check Vercel Environment Variables.' 
      });
    }

    console.log('🔌 Connecting to Claude API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{ 
          role: 'user', 
          content: message 
        }],
        system: 'You are R.O.C.K.Y., an AI assistant for Etsy digital product sellers. Help them research markets, find trends, and create successful products.'
      })
    });

    console.log('📊 Claude API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Claude API error:', errorData);
      return res.status(response.status).json({ 
        success: false, 
        error: errorData.error?.message || 'Claude API error' 
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'No response from Claude';
    
    console.log('✅ Success! Response length:', reply.length);

    res.json({
      success: true,
      response: reply,
      model: 'claude-opus-4-5'
    });

  } catch (error) {
    console.error('🚨 Chat endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error'
    });
  }
});

// ============================================
// ETSY RESEARCH ENDPOINTS
// ============================================

app.post('/api/research/category', async (req, res) => {
  try {
    const { category } = req.body;
    console.log('🔍 Research request for:', category);
    
    res.json({
      success: true,
      category: category,
      analysis: `Research analysis for ${category} - Coming soon with real Etsy scraping`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/research/all', async (req, res) => {
  try {
    console.log('🔍 Full research request');
    
    res.json({
      success: true,
      results: {
        'digital-templates': 'Analysis pending...',
        'printable-planners': 'Analysis pending...',
        'ebooks': 'Analysis pending...'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  console.log('❌ 404 - Endpoint not found:', req.path);
  res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log('\n✅ R.O.C.K.Y. Backend is ONLINE!');
  console.log(`📍 Listening on port ${PORT}`);
  console.log(`🌐 API: https://rocky-etsy-research.vercel.app`);
  console.log(`💬 Chat: POST /api/chat`);
  console.log(`🔍 Research: POST /api/research/category`);
  console.log('\n🚀 Ready to help!\n');
});