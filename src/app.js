// R.O.C.K.Y. — Etsy Research API
// Express app shared by the local dev server (server.js) and Vercel (api/index.js).

const express = require('express');
const cors = require('cors');
const claude = require('./claude');
const { searchEtsy } = require('./etsy');

const app = express();
app.disable('x-powered-by');

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || true,
    methods: ['GET', 'POST'],
  })
);
app.use(express.json({ limit: '200kb' }));

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per IP, per minute). Good enough for a single
// instance / serverless function; documented limitation in the README.
// ---------------------------------------------------------------------------
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;
const hits = new Map();

app.use('/api/', (req, res, next) => {
  const now = Date.now();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    hits.set(ip, { windowStart: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests — slow down a little' });
  }
  next();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: claude.MODEL,
    apiKeyConfigured: claude.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
const CHAT_SYSTEM_PROMPT = `You are R.O.C.K.Y., a professional assistant for Etsy sellers of digital products (printables, templates, planners, wall art, ebooks and similar downloads).
You help with: market and niche research, product ideas, pricing, Etsy SEO (titles, tags, descriptions), listing optimization and marketing.
Answer in the same language the user writes in (typically Polish or English).
Be concrete and practical: give numbers, examples and step-by-step suggestions instead of generic advice. Keep responses focused and reasonably concise.`;

const MAX_TURNS = 40;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;

function validateChatMessages(body) {
  const { messages } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: 'Field "messages" must be a non-empty array' };
  }
  if (messages.length > MAX_TURNS) {
    return { error: `Conversation too long (max ${MAX_TURNS} messages) — start a new chat` };
  }
  let total = 0;
  const clean = [];
  for (const message of messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) {
      return { error: 'Each message needs role "user" or "assistant"' };
    }
    if (typeof message.content !== 'string' || !message.content.trim()) {
      return { error: 'Each message needs non-empty string content' };
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      return { error: `A single message can have at most ${MAX_MESSAGE_CHARS} characters` };
    }
    total += message.content.length;
    clean.push({ role: message.role, content: message.content });
  }
  if (total > MAX_TOTAL_CHARS) {
    return { error: 'Conversation too large — start a new chat' };
  }
  if (clean[0].role !== 'user' || clean[clean.length - 1].role !== 'user') {
    return { error: 'Conversation must start and end with a user message' };
  }
  return { messages: clean };
}

app.post('/api/chat', async (req, res, next) => {
  try {
    const validated = validateChatMessages(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const result = await claude.createMessage({
      system: CHAT_SYSTEM_PROMPT,
      messages: validated.messages,
      maxTokens: 2048,
    });

    res.json({ reply: result.text, model: result.model });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
const ANALYSIS_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'summary',
      'marketHealth',
      'competitionLevel',
      'estimatedPriceRange',
      'topTrends',
      'opportunities',
      'recommendation',
      'riskLevel',
      'verdict',
      'verdictReasoning',
    ],
    properties: {
      summary: { type: 'string', description: '2-3 sentence overview of this niche on Etsy' },
      marketHealth: { type: 'string', enum: ['HOT', 'MODERATE', 'COOLING'] },
      competitionLevel: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      estimatedPriceRange: {
        type: 'string',
        description: 'Typical price range for this kind of product, e.g. "$3-8"',
      },
      topTrends: { type: 'array', items: { type: 'string' } },
      opportunities: { type: 'array', items: { type: 'string' } },
      recommendation: {
        type: 'object',
        additionalProperties: false,
        required: ['whatToCreate', 'targetPrice', 'estimatedDemand', 'difficulty', 'startingSteps'],
        properties: {
          whatToCreate: { type: 'string', description: 'One specific product idea' },
          targetPrice: { type: 'string' },
          estimatedDemand: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
          startingSteps: { type: 'array', items: { type: 'string' } },
        },
      },
      riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      verdict: { type: 'string', enum: ['YES', 'NO', 'MAYBE'] },
      verdictReasoning: { type: 'string' },
    },
  },
};

function buildResearchPrompt(category, products) {
  const header = `You are an expert in Etsy market research for digital products. Analyze the "${category}" niche on Etsy and answer strictly in the requested JSON format. Write all free-text fields in Polish.`;

  if (products.length > 0) {
    const lines = products
      .slice(0, 20)
      .map((p, i) => `${i + 1}. "${p.title}" — ${p.price}${p.currency ? ` ${p.currency}` : ''}`)
      .join('\n');
    return `${header}

Here are current Etsy search results for this niche (title — price):

${lines}

Base your analysis primarily on these live listings (price points, wording, product types), supplemented by your market knowledge.`;
  }

  return `${header}

Live Etsy data is not available right now, so base the analysis on your general knowledge of the Etsy digital products market. Be honest about uncertainty where relevant.`;
}

app.post('/api/research', async (req, res, next) => {
  try {
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    if (category.length < 2 || category.length > 80) {
      return res.status(400).json({ error: 'Field "category" must be a 2-80 character string' });
    }

    const scrape = await searchEtsy(category, 24);
    const products = scrape.products;

    const result = await claude.createMessage({
      messages: [{ role: 'user', content: buildResearchPrompt(category, products) }],
      maxTokens: 3000,
      outputFormat: ANALYSIS_FORMAT,
    });

    let analysis;
    try {
      analysis = JSON.parse(result.text);
    } catch {
      const err = new Error('Claude returned an unparseable analysis');
      err.status = 502;
      throw err;
    }

    res.json({
      category,
      dataSource: products.length > 0 ? 'live' : 'ai_knowledge',
      scrapeNote: products.length > 0 ? null : scrape.error,
      productsFound: products.length,
      products: products.slice(0, 12),
      analysis,
      model: result.model,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// 404 + error handling
// ---------------------------------------------------------------------------
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error('API error:', error);
  res.status(status).json({
    error: error.message || 'Internal server error',
    ...(error.code ? { code: error.code } : {}),
  });
});

module.exports = app;
