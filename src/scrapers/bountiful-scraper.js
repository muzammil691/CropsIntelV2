// CropsIntelV2 — Bountiful.ag Crop Estimates Scraper
// Fetches crop forecasts, yield estimates, and market sentiment from bountiful.ag
// This is a key competitive data source during crop estimate season (Apr-Jul)
//
// Usage:
//   node src/scrapers/bountiful-scraper.js          # scrape latest estimates
//
// Created: 2026-04-21

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

const BOUNTIFUL_BASE = 'https://bountiful.ag';

// ============================================================
// Logging helper
// ============================================================
async function logScrape(scraperName, status, details = {}) {
  const { error } = await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: scraperName,
    target_url: BOUNTIFUL_BASE,
    status,
    records_found: details.found || 0,
    records_inserted: details.inserted || 0,
    error_message: details.error || null,
    duration_ms: details.duration || 0,
    metadata: details.metadata || {},
    completed_at: status !== 'started' ? new Date().toISOString() : null
  });
  if (error) console.error('Log write failed:', error.message);
}

// ============================================================
// Fetch public crop estimate data from Bountiful
// ============================================================
async function fetchBountifulEstimates(session) {
  const headers = {
    'User-Agent': 'CropsIntelV2/1.0',
    'Accept': 'application/json, text/html',
  };

  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  if (session?.cookies) {
    headers['Cookie'] = session.cookies;
  }

  // Try API endpoints first
  const endpoints = [
    '/api/estimates',
    '/api/crops/almonds',
    '/api/forecasts',
    '/api/v1/estimates',
    '/api/v1/crops/almonds',
    '/api/market/almonds',
    '/api/public/estimates',
    '/estimates',
    '/crops/almonds',
    '/forecast',
  ];

  let data = null;
  let usedEndpoint = null;

  for (const endpoint of endpoints) {
    const url = `${BOUNTIFUL_BASE}${endpoint}`;
    console.log(`Trying: ${url}`);

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });

      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';

        if (contentType.includes('json')) {
          const json = await resp.json();
          console.log(`Got JSON from ${endpoint}:`, typeof json, Array.isArray(json) ? `${json.length} items` : Object.keys(json).slice(0, 5).join(', '));
          data = json;
          usedEndpoint = endpoint;
          break;
        } else if (contentType.includes('html')) {
          const html = await resp.text();
          const estimates = extractEstimatesFromHTML(html);
          if (estimates.length > 0) {
            console.log(`Extracted ${estimates.length} estimates from HTML at ${endpoint}`);
            data = estimates;
            usedEndpoint = endpoint;
            break;
          }
        }
      } else {
        console.log(`HTTP ${resp.status} from ${endpoint}`);
      }
    } catch (err) {
      console.log(`Failed: ${endpoint} — ${err.message}`);
    }
  }

  // Try the main page as last resort
  if (!data) {
    console.log('Trying main page scrape...');
    try {
      const mainResp = await fetch(BOUNTIFUL_BASE, { headers, redirect: 'follow' });
      if (mainResp.ok) {
        const html = await mainResp.text();
        const estimates = extractEstimatesFromHTML(html);
        if (estimates.length > 0) {
          console.log(`Extracted ${estimates.length} estimates from main page`);
          return estimates;
        }

        // Store for analysis
        await logScrape('bountiful-html', 'info', {
          metadata: {
            html_length: html.length,
            has_number: /[\d,]+\s*(million|billion|lbs|pounds)/i.test(html),
            has_estimate: /estimate|forecast|yield|crop/i.test(html),
            sample: html.substring(0, 2000)
          }
        });
      }
    } catch (err) {
      console.log(`Main page scrape failed: ${err.message}`);
    }
  }

  return data || [];
}

// ============================================================
// Login to Bountiful (free account)
// ============================================================
async function bountifulLogin() {
  const email = process.env.BOUNTIFUL_EMAIL;
  const password = process.env.BOUNTIFUL_PASSWORD;

  if (!email || !password) {
    console.log('No Bountiful credentials in .env — trying public access...');
    return null;
  }

  console.log(`Logging into Bountiful as ${email}...`);

  try {
    // Try common login patterns
    const loginEndpoints = [
      { url: '/api/auth/login', method: 'json' },
      { url: '/api/login', method: 'json' },
      { url: '/login', method: 'form' },
      { url: '/api/v1/auth/login', method: 'json' },
    ];

    for (const ep of loginEndpoints) {
      const url = `${BOUNTIFUL_BASE}${ep.url}`;
      console.log(`Trying login at ${url} (${ep.method})...`);

      let resp;
      if (ep.method === 'json') {
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'CropsIntelV2/1.0' },
          body: JSON.stringify({ email, password }),
          redirect: 'manual'
        });
      } else {
        const form = new URLSearchParams();
        form.append('email', email);
        form.append('password', password);
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CropsIntelV2/1.0' },
          body: form.toString(),
          redirect: 'manual'
        });
      }

      if (resp.ok || resp.status === 302) {
        const cookies = (resp.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
        let token = null;
        if (resp.ok) {
          const json = await resp.json().catch(() => ({}));
          token = json.token || json.access_token || json.jwt;
        }
        if (token || cookies) {
          console.log(`Login successful via ${ep.url}`);
          return { token, cookies, status: resp.status };
        }
      }
    }

    console.log('All login methods failed — proceeding without auth');
    return null;
  } catch (err) {
    console.error('Login error:', err.message);
    return null;
  }
}

// ============================================================
// Extract crop estimates from HTML
// ============================================================
function extractEstimatesFromHTML(html) {
  const estimates = [];

  // Pattern 1: Look for crop estimate numbers (e.g., "2.8 billion pounds", "2,800 million lbs")
  const estimateRegex = /([\d,.]+)\s*(billion|million|thousand)?\s*(pounds?|lbs?|tons?)/gi;
  let match;
  const rawNumbers = [];

  while ((match = estimateRegex.exec(html)) !== null) {
    const numStr = match[1].replace(/,/g, '');
    let value = parseFloat(numStr);
    const multiplier = match[2]?.toLowerCase();
    const unit = match[3]?.toLowerCase();

    if (multiplier === 'billion') value *= 1e9;
    else if (multiplier === 'million') value *= 1e6;
    else if (multiplier === 'thousand') value *= 1e3;

    // Convert tons to lbs if needed
    if (unit?.startsWith('ton')) value *= 2000;

    // Only keep values that look like almond crop estimates (> 1M lbs)
    if (value > 1000000) {
      rawNumbers.push({ value, context: html.substring(Math.max(0, match.index - 100), match.index + match[0].length + 100) });
    }
  }

  // Pattern 2: Look for year/season references near numbers
  const yearRegex = /20\d{2}[/-]?\d{0,2}/g;
  const years = [];
  while ((match = yearRegex.exec(html)) !== null) {
    years.push(match[0]);
  }

  // Pattern 3: Look for sentiment/direction keywords
  const bullishWords = (html.match(/increase|higher|up|bullish|strong|tight supply|shortage/gi) || []).length;
  const bearishWords = (html.match(/decrease|lower|down|bearish|weak|surplus|oversupply/gi) || []).length;
  const sentiment = bullishWords > bearishWords ? 'bullish' : bearishWords > bullishWords ? 'bearish' : 'neutral';

  // Pattern 4: Look for table data with estimates
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    if (!/estimate|forecast|yield|crop|production/i.test(tableHtml)) continue;

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let headerCols = [];

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const row = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells = [];
      let cellMatch;

      while ((cellMatch = cellRegex.exec(row)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
      }

      if (cells.length === 0) continue;

      if (row.includes('<th') || headerCols.length === 0) {
        headerCols = cells.map(c => c.toLowerCase());
        continue;
      }

      const obj = {};
      cells.forEach((cell, i) => {
        const col = headerCols[i] || '';
        if (/year|season|crop/i.test(col)) obj.crop_year = cell;
        if (/estimate|forecast|production/i.test(col)) obj.estimate_lbs = parseNumeric(cell);
        if (/yield/i.test(col)) obj.yield_per_acre = parseNumeric(cell);
        if (/acres|acreage/i.test(col)) obj.bearing_acres = parseNumeric(cell);
        if (/confidence|accuracy/i.test(col)) obj.confidence = parseFloat(cell) / 100;
      });

      if (obj.estimate_lbs || obj.yield_per_acre) {
        estimates.push(obj);
      }
    }
  }

  // If we found raw numbers but no structured data, create estimate objects
  if (estimates.length === 0 && rawNumbers.length > 0) {
    rawNumbers.forEach(n => {
      estimates.push({
        estimate_lbs: n.value,
        context: n.context.replace(/<[^>]*>/g, '').trim(),
        sentiment,
        crop_year: years[0] || `${new Date().getFullYear()}/${(new Date().getFullYear() + 1).toString().slice(-2)}`
      });
    });
  }

  return estimates;
}

function parseNumeric(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ============================================================
// Store crop estimates in Supabase
// ============================================================
async function storeEstimates(estimates) {
  if (!estimates || estimates.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  let inserted = 0;

  const normalized = (Array.isArray(estimates) ? estimates : [estimates])
    .filter(e => e && (e.estimate_lbs || e.yield_per_acre))
    .map(e => ({
      forecast_type: 'bountiful_community',
      forecast_year: new Date().getFullYear(),
      crop_year: e.crop_year || `${new Date().getFullYear()}/${(new Date().getFullYear() + 1).toString().slice(-2)}`,
      forecast_lbs: e.estimate_lbs || 0,
      report_month: new Date().getMonth() + 1,
      source_pdf: `bountiful.ag scraped ${today}`,
      raw_text: JSON.stringify({
        yield_per_acre: e.yield_per_acre,
        bearing_acres: e.bearing_acres,
        confidence: e.confidence,
        sentiment: e.sentiment,
        context: e.context
      }),
      scraped_at: new Date().toISOString()
    }));

  for (const estimate of normalized) {
    const { error } = await supabaseAdmin.from('abc_forecasts').upsert(estimate, {
      onConflict: 'forecast_type,forecast_year'
    });

    if (!error) {
      inserted++;
      const lbs = estimate.forecast_lbs > 0 ? `${(estimate.forecast_lbs / 1e9).toFixed(2)}B lbs` : 'N/A';
      console.log(`Stored: ${estimate.crop_year} Bountiful estimate = ${lbs}`);
    } else {
      console.error(`DB error:`, error.message);
    }
  }

  return inserted;
}

// ============================================================
// Store market sentiment as AI analysis
// ============================================================
async function storeSentiment(estimates) {
  if (!estimates || estimates.length === 0) return;

  // Determine overall sentiment from estimates
  const sentiments = estimates.map(e => e.sentiment).filter(Boolean);
  const bullish = sentiments.filter(s => s === 'bullish').length;
  const bearish = sentiments.filter(s => s === 'bearish').length;
  const overall = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

  const { error } = await supabaseAdmin.from('ai_analyses').insert({
    analysis_type: 'market_sentiment',
    title: `Bountiful.ag Market Sentiment — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    summary: `Community crop estimate sentiment is ${overall}. Based on ${estimates.length} data points from Bountiful.ag during crop estimate season.`,
    data_context: {
      source: 'bountiful.ag',
      sentiment: overall,
      bullish_signals: bullish,
      bearish_signals: bearish,
      estimates_count: estimates.length,
      scraped_at: new Date().toISOString()
    },
    confidence: 0.7,
    tags: ['bountiful', 'crop_estimate', 'sentiment', overall],
    is_actionable: overall !== 'neutral'
  });

  if (error) console.error('Sentiment store failed:', error.message);
  else console.log(`Stored market sentiment: ${overall}`);
}

// ============================================================
// Main scrape function
// ============================================================
export async function scrapeBountiful() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — Bountiful.ag Scraper');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  await logScrape('bountiful-scraper', 'started');

  // Step 1: Login (optional — try public first)
  const session = await bountifulLogin();

  // Step 2: Fetch estimates
  const estimates = await fetchBountifulEstimates(session);
  const found = Array.isArray(estimates) ? estimates.length : (estimates ? 1 : 0);
  console.log(`\nEstimates found: ${found}`);

  // Step 3: Store in database
  const inserted = await storeEstimates(estimates);

  // Step 4: Store sentiment analysis
  await storeSentiment(estimates);

  const duration = Date.now() - startTime;

  await logScrape('bountiful-scraper', inserted > 0 ? 'success' : (found > 0 ? 'parsed' : 'no_data'), {
    found,
    inserted,
    duration,
    metadata: {
      has_session: !!session,
      crop_estimate_season: true,
      sentiment_stored: true
    }
  });

  console.log(`\nBountiful scrape complete: ${inserted} estimates stored (${duration}ms)`);
  return { found, inserted, duration };
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('bountiful-scraper')) {
  scrapeBountiful().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Bountiful scraper crashed:', err);
    process.exit(1);
  });
}
