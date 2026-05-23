// R.O.C.K.Y. Etsy Research Backend
// Real-time monitoring of Etsy bestsellers with Claude AI analysis

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;

// Initialize Firebase
let db = null;
if (FIREBASE_CONFIG) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(FIREBASE_CONFIG),
      databaseURL: process.env.FIREBASE_DB_URL
    });
    db = admin.firestore();
    console.log('✅ Firebase initialized');
  } catch (error) {
    console.error('⚠️ Firebase init error:', error);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'R.O.C.K.Y. Etsy Research Backend running' });
});

// ============================================
// ETSY WEB SCRAPER
// ============================================

async function scrapeEtsyCategory(categoryUrl, limit = 50) {
  try {
    console.log(`🔍 Scraping Etsy category: ${categoryUrl}`);
    
    const response = await fetch(categoryUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Etsy responded with ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const products = [];
    
    // Scrape product listings
    $('[data-etsy-listing-id]').each((i, elem) => {
      if (products.length >= limit) return;
      
      try {
        const listingId = $(elem).attr('data-etsy-listing-id');
        const title = $(elem).find('[data-etsy-shop-name], h2').first().text().trim();
        const price = $(elem).find('[data-etsy-price]').text().trim();
        const reviews = $(elem).find('[data-etsy-reviews]').text().trim();
        const link = $(elem).find('a').first().attr('href');
        
        if (title && price) {
          products.push({
            listingId,
            title,
            price: parsePrice(price),
            reviews: parseReviews(reviews),
            link: `https://www.etsy.com${link}`,
            scrapedAt: new Date().toISOString(),
            views: Math.floor(Math.random() * 10000), // Placeholder
            favorites: Math.floor(Math.random() * 500)
          });
        }
      } catch (error) {
        console.error('Error parsing product:', error);
      }
    });

    console.log(`✅ Scraped ${products.length} products from category`);
    return products;

  } catch (error) {
    console.error('❌ Scraping error:', error.message);
    return [];
  }
}

function parsePrice(priceStr) {
  const match = priceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function parseReviews(reviewStr) {
  const match = reviewStr.match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

// ============================================
// CLAUDE AI ANALYSIS
// ============================================

async function analyzeWithClaude(products, category) {
  try {
    console.log('🤖 Analyzing products with Claude...');
    
    const productSummary = products.slice(0, 10).map((p, i) => 
      `${i+1}. "${p.title}" - $${p.price} (${p.reviews} reviews, ~${p.views} views)`
    ).join('\n');

    const prompt = `You are an expert in digital products and Etsy market research. 
    
Analyze these top 10 bestselling products in the "${category}" category:

${productSummary}

Provide analysis in JSON format with:
{
  "category": "category name",
  "marketHealth": "HOT|MODERATE|COOLING",
  "competitionLevel": "HIGH|MEDIUM|LOW",
  "averagePrice": number,
  "topTrends": ["trend1", "trend2", "trend3"],
  "opportunities": ["opportunity1", "opportunity2"],
  "recommendations": {
    "whatToCreate": "specific product idea",
    "targetPrice": "price range",
    "estimatedDemand": "HIGH|MEDIUM|LOW",
    "difficulty": "EASY|MEDIUM|HARD",
    "startingSteps": ["step1", "step2", "step3"]
  },
  "riskLevel": "LOW|MEDIUM|HIGH",
  "verdict": "IS_THIS_WORTH_CREATING (YES/NO/MAYBE with reasoning)"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const analysisText = data.content[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Could not parse analysis' };
    
    console.log('✅ Claude analysis complete');
    return analysis;

  } catch (error) {
    console.error('❌ Claude analysis error:', error.message);
    return { error: error.message };
  }
}

// ============================================
// ENDPOINTS
// ============================================

// Research single category
app.post('/api/research/category', async (req, res) => {
  try {
    const { category, limit = 50 } = req.body;
    
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    console.log(`\n🔮 STARTING RESEARCH: ${category}`);
    
    // Build Etsy category URL
    const categoryUrl = `https://www.etsy.com/search?q=${encodeURIComponent(category)}&sort_by=newest`;
    
    // Scrape
    const products = await scrapeEtsyCategory(categoryUrl, limit);
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'No products found' });
    }

    // Analyze with Claude
    const analysis = await analyzeWithClaude(products, category);

    // Save to Firebase
    if (db) {
      try {
        await db.collection('research').doc(category).set({
          category,
          products: products.slice(0, 10), // Save top 10
          analysis,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          productsCount: products.length
        });
        console.log('💾 Saved to Firebase');
      } catch (error) {
        console.error('Firebase save error:', error);
      }
    }

    res.json({
      category,
      productsScraped: products.length,
      topProducts: products.slice(0, 10),
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Research error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Research all top categories
app.post('/api/research/all', async (req, res) => {
  try {
    console.log('\n🔮 STARTING FULL ETSY RESEARCH');
    
    const categories = [
      'digital templates',
      'printable planners',
      'ebooks',
      'social media templates',
      'notion templates',
      'wall art prints',
      'course materials',
      'resumes templates',
      'business templates',
      'coloring pages'
    ];

    const results = [];
    const startTime = Date.now();

    for (const category of categories) {
      console.log(`\n📍 Researching: ${category}`);
      
      const categoryUrl = `https://www.etsy.com/search?q=${encodeURIComponent(category)}&sort_by=newest`;
      const products = await scrapeEtsyCategory(categoryUrl, 50);
      
      if (products.length > 0) {
        const analysis = await analyzeWithClaude(products, category);
        
        results.push({
          category,
          productsFound: products.length,
          analysis,
          topProducts: products.slice(0, 5)
        });

        // Save to Firebase
        if (db) {
          await db.collection('research').doc(category).set({
            category,
            products: products.slice(0, 10),
            analysis,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            productsCount: products.length
          });
        }
      }

      // Small delay between requests (be respectful)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    res.json({
      status: 'complete',
      categoriesResearched: results.length,
      duration: `${duration}s`,
      results
    });

  } catch (error) {
    console.error('❌ Full research error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get research history
app.get('/api/research/history', async (req, res) => {
  try {
    if (!db) {
      return res.json({ message: 'Firebase not configured', data: [] });
    }

    const snapshot = await db.collection('research').orderBy('timestamp', 'desc').limit(20).get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific research
app.get('/api/research/:category', async (req, res) => {
  try {
    if (!db) {
      return res.status(404).json({ error: 'Firebase not configured' });
    }

    const doc = await db.collection('research').doc(req.params.category).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Research not found' });
    }

    res.json({ data: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: error.message });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 R.O.C.K.Y. Etsy Research Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
