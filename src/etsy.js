// Etsy search scraper for R.O.C.K.Y.
// Best-effort: Etsy aggressively blocks non-browser traffic, so every caller
// must treat an empty result as a normal outcome (the API layer then falls
// back to an AI-knowledge-only analysis and labels it as such).
// No data is ever fabricated here — only fields actually present in the HTML.

const cheerio = require('cheerio');

const REQUEST_TIMEOUT_MS = 12_000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function buildSearchUrl(query) {
  return `https://www.etsy.com/search?q=${encodeURIComponent(query)}&ref=search_bar`;
}

function parsePrice($card) {
  const value = $card.find('.currency-value').first().text().trim();
  const symbol = $card.find('.currency-symbol').first().text().trim();
  const amount = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  return { amount, currency: symbol || null };
}

function parseCard($, element) {
  const $card = $(element);
  const listingId =
    $card.attr('data-listing-id') || $card.closest('[data-listing-id]').attr('data-listing-id') || null;

  const title = (
    $card.find('.v2-listing-card__title').first().text() ||
    $card.find('h3').first().text() ||
    $card.find('h2').first().text()
  )
    .replace(/\s+/g, ' ')
    .trim();

  let url = $card.find('a.listing-link').attr('href') || $card.find('a[href*="/listing/"]').attr('href') || null;
  if (url && url.startsWith('/')) url = `https://www.etsy.com${url}`;
  if (url) url = url.split('?')[0];

  const price = parsePrice($card);

  if (!title || !price) return null;
  return { listingId, title, price: price.amount, currency: price.currency, url };
}

function parseSearchHtml(html, limit) {
  const $ = cheerio.load(html);
  const products = [];
  const seen = new Set();

  // Etsy has used a few card markups over time — try the known ones in order.
  const selectors = ['div.v2-listing-card', 'li [data-listing-id]', '[data-listing-id]'];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (products.length >= limit) return false;
      const product = parseCard($, element);
      if (!product) return;
      const key = product.listingId || product.url || product.title;
      if (seen.has(key)) return;
      seen.add(key);
      products.push(product);
    });
    if (products.length > 0) break;
  }

  return products;
}

/**
 * Scrapes Etsy search results for a query.
 * Returns { products, error } — products is [] when blocked or nothing parsed.
 */
async function searchEtsy(query, limit = 24) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildSearchUrl(query), {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      return { products: [], error: `Etsy responded with HTTP ${response.status}` };
    }

    const html = await response.text();
    const products = parseSearchHtml(html, limit);
    if (products.length === 0) {
      return { products: [], error: 'No products could be parsed (Etsy likely served a bot-check page)' };
    }
    return { products, error: null };
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Etsy request timed out' : error.message;
    return { products: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchEtsy, parseSearchHtml };
