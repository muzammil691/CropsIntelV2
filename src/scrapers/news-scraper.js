// CropsIntelV2 — Industry News & Blog Scraper
// Scrapes almonds.org for press releases, Almond Bytes blog, industry news
// Also monitors external sources for almond market news
//
// Sources:
//   - almonds.org/about-us/press-releases (official ABC press)
//   - almonds.org/almond-bytes (blog/short content)
//   - almonds.org/news (industry news)
//
// Usage:
//   node src/scrapers/news-scraper.js
//
// Created: 2026-04-21

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

const ABC_BASE = 'https://www.almondboard.com';

const NEWS_SOURCES = [
  { name: 'abc_press', url: `${ABC_BASE}/about-us/press-releases`, category: 'regulatory' },
  { name: 'abc_blog', url: `${ABC_BASE}/almond-bytes`, category: 'market' },
  { name: 'abc_industry', url: `${ABC_BASE}/news`, category: 'trade' },
];

// ============================================================
// Logging helper
// ============================================================
async function logScrape(scraperName, status, details = {}) {
  await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: scraperName,
    target_url: ABC_BASE,
    status,
    records_found: details.found || 0,
    records_inserted: details.inserted || 0,
    error_message: details.error || null,
    duration_ms: details.duration || 0,
    metadata: details.metadata || {},
    completed_at: status !== 'started' ? new Date().toISOString() : null
  });
}

// ============================================================
// Fetch and parse news from a URL
// ============================================================
async function fetchNewsPage(url) {
  console.log(`Fetching: ${url}`);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'CropsIntelV2/1.0 (Market Intelligence Platform)',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    });

    if (!resp.ok) {
      console.log(`HTTP ${resp.status} from ${url}`);
      return [];
    }

    const html = await resp.text();
    return extractArticles(html, url);
  } catch (err) {
    console.error(`Fetch failed for ${url}:`, err.message);
    return [];
  }
}

// ============================================================
// Extract articles from HTML
// ============================================================
function extractArticles(html, pageUrl) {
  const articles = [];

  // Pattern 1: Standard article/post cards with <a> links and headings
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1];
    const article = extractArticleFromBlock(block, pageUrl);
    if (article) articles.push(article);
  }

  // Pattern 2: If no <article> tags, look for list items with links
  if (articles.length === 0) {
    const linkBlockRegex = /<(?:li|div)[^>]*class="[^"]*(?:post|article|news|item|card|entry)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|div)>/gi;
    while ((match = linkBlockRegex.exec(html)) !== null) {
      const block = match[1];
      const article = extractArticleFromBlock(block, pageUrl);
      if (article) articles.push(article);
    }
  }

  // Pattern 3: Look for heading + link combos
  if (articles.length === 0) {
    const headingLinkRegex = /<h[2-4][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[2-4]>/gi;
    while ((match = headingLinkRegex.exec(html)) !== null) {
      const href = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      if (title && href) {
        articles.push({
          title,
          source_url: href.startsWith('http') ? href : `${ABC_BASE}${href}`,
        });
      }
    }
  }

  return articles;
}

function extractArticleFromBlock(block, pageUrl) {
  // Extract title from heading or link
  const titleMatch = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
    || block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);

  if (!titleMatch) return null;
  const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
  if (!title || title.length < 5) return null;

  // Extract URL
  const urlMatch = block.match(/<a[^>]*href="([^"]+)"/i);
  const rawUrl = urlMatch ? urlMatch[1] : '';
  const source_url = rawUrl.startsWith('http') ? rawUrl : (rawUrl ? `${ABC_BASE}${rawUrl}` : pageUrl);

  // Extract date
  const dateMatch = block.match(/(?:datetime|date)="([^"]+)"/i)
    || block.match(/(\w+ \d{1,2},?\s*\d{4})/i)
    || block.match(/(\d{4}-\d{2}-\d{2})/);
  let published_date = null;
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    if (!isNaN(d.getTime())) published_date = d.toISOString().split('T')[0];
  }

  // Extract summary/description
  const summaryMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 500) : null;

  return { title, source_url, published_date, summary };
}

// ============================================================
// Determine category and sentiment from article content
// ============================================================
function categorizeArticle(article) {
  const text = `${article.title} ${article.summary || ''}`.toLowerCase();

  // Category detection
  let category = 'market';
  if (/trade|export|import|tariff|ship/i.test(text)) category = 'trade';
  else if (/regulat|law|policy|fda|usda|compliance/i.test(text)) category = 'regulatory';
  else if (/crop|harvest|yield|weather|drought|water|acre/i.test(text)) category = 'crop';
  else if (/health|nutrition|diet|protein|snack/i.test(text)) category = 'health';
  else if (/sustain|environment|carbon|organic|eco/i.test(text)) category = 'sustainability';
  else if (/price|market|demand|supply|cost/i.test(text)) category = 'market';

  // Sentiment for market impact
  const bullish = (text.match(/increase|growth|strong|higher|demand|record|surge|boost/gi) || []).length;
  const bearish = (text.match(/decline|weak|lower|drop|surplus|concern|challenge|threat/gi) || []).length;
  const sentiment = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

  return { category, sentiment };
}

// ============================================================
// Store news articles in Supabase
// ============================================================
async function storeArticles(articles, sourceName) {
  if (!articles || articles.length === 0) return 0;

  let inserted = 0;

  for (const article of articles) {
    const { category, sentiment } = categorizeArticle(article);

    const record = {
      title: article.title.substring(0, 500),
      source: sourceName,
      source_url: article.source_url,
      published_date: article.published_date || new Date().toISOString().split('T')[0],
      category: article.category || category,
      summary: article.summary,
      ai_sentiment: sentiment,
      tags: [sourceName, category, sentiment].filter(Boolean),
      scraped_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('industry_news').upsert(record, {
      onConflict: 'source,source_url'
    });

    if (!error) {
      inserted++;
      console.log(`  + ${article.title.substring(0, 60)}... [${category}/${sentiment}]`);
    } else if (!error.message.includes('duplicate')) {
      console.error(`  DB error: ${error.message}`);
    }
  }

  return inserted;
}

// ============================================================
// Main scrape function
// ============================================================
export async function scrapeNews() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — Industry News Scraper');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  await logScrape('news-scraper', 'started');

  let totalFound = 0;
  let totalInserted = 0;

  for (const source of NEWS_SOURCES) {
    console.log(`\n--- ${source.name} (${source.url}) ---`);

    const articles = await fetchNewsPage(source.url);
    console.log(`Found ${articles.length} articles`);
    totalFound += articles.length;

    // Assign default category from source config
    articles.forEach(a => { if (!a.category) a.category = source.category; });

    const inserted = await storeArticles(articles, source.name);
    totalInserted += inserted;
  }

  const duration = Date.now() - startTime;

  await logScrape('news-scraper', totalInserted > 0 ? 'success' : (totalFound > 0 ? 'parsed' : 'no_data'), {
    found: totalFound,
    inserted: totalInserted,
    duration,
    metadata: { sources_scraped: NEWS_SOURCES.length }
  });

  console.log(`\nNews scrape complete: ${totalInserted}/${totalFound} articles stored (${duration}ms)`);
  return { found: totalFound, inserted: totalInserted, duration };
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('news-scraper')) {
  scrapeNews().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('News scraper crashed:', err);
    process.exit(1);
  });
}
