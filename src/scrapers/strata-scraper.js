// CropsIntelV2 — Strata Markets Auto-Scraper
// Logs into online.stratamarkets.com autonomously and fetches almond pricing data.
// Credentials stored in .env (STRATA_USERNAME, STRATA_PASSWORD)
// Applies MAXONS pricing policy (3% margin) to all live prices.
//
// Usage:
//   node src/scrapers/strata-scraper.js          # scrape latest prices
//   node src/scrapers/strata-scraper.js history   # scrape historical prices
//
// Created: 2026-04-21

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

const STRATA_BASE = process.env.STRATA_BASE_URL || 'https://online.stratamarkets.com';
const STRATA_USER = process.env.STRATA_USERNAME;
const STRATA_PASS = process.env.STRATA_PASSWORD;
const MAXONS_MARGIN = parseFloat(process.env.MAXONS_MARGIN_PERCENT || '3') / 100;

// ============================================================
// Logging helper
// ============================================================
async function logScrape(scraperName, status, details = {}) {
  const { error } = await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: scraperName,
    target_url: STRATA_BASE,
    status,
    records_found: details.found || 0,
    records_inserted: details.inserted || 0,
    records_updated: details.updated || 0,
    error_message: details.error || null,
    duration_ms: details.duration || 0,
    metadata: details.metadata || {},
    completed_at: status !== 'started' ? new Date().toISOString() : null
  });
  if (error) console.error('Log write failed:', error.message);
}

// ============================================================
// Login to Strata Markets — get session cookie/token
// ============================================================
async function strataLogin() {
  if (!STRATA_USER || !STRATA_PASS) {
    console.error('Missing STRATA_USERNAME or STRATA_PASSWORD in .env');
    return null;
  }

  console.log(`Logging into Strata Markets as ${STRATA_USER}...`);

  try {
    // First, get the login page to find any CSRF tokens
    const loginPageResp = await fetch(`${STRATA_BASE}/login`, {
      headers: { 'User-Agent': 'CropsIntelV2/1.0' },
      redirect: 'manual'
    });

    // Extract cookies from login page
    const setCookies = loginPageResp.headers.getSetCookie?.() || [];
    const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

    // Check for CSRF token in HTML
    const loginHtml = await loginPageResp.text();
    const csrfMatch = loginHtml.match(/name="[_]?csrf[_]?(?:token)?"[^>]*value="([^"]+)"/i)
      || loginHtml.match(/name="authenticity_token"[^>]*value="([^"]+)"/i)
      || loginHtml.match(/csrf[_-]?token["']?\s*[:=]\s*["']([^"']+)/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    // Build login payload — try common form field names
    const formData = new URLSearchParams();
    formData.append('email', STRATA_USER);
    formData.append('username', STRATA_USER);
    formData.append('password', STRATA_PASS);
    if (csrfToken) {
      formData.append('_csrf', csrfToken);
      formData.append('csrf_token', csrfToken);
      formData.append('authenticity_token', csrfToken);
    }

    // Try POST login
    const loginResp = await fetch(`${STRATA_BASE}/login`, {
      method: 'POST',
      headers: {
        'User-Agent': 'CropsIntelV2/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': `${STRATA_BASE}/login`
      },
      body: formData.toString(),
      redirect: 'manual'
    });

    // Collect session cookies from login response
    const loginCookies = loginResp.headers.getSetCookie?.() || [];
    const allCookies = [...setCookies, ...loginCookies]
      .map(c => c.split(';')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('; ');

    const status = loginResp.status;
    console.log(`Login response: HTTP ${status}`);

    // 302 redirect = success for most form logins
    if (status === 302 || status === 301 || status === 200) {
      console.log('Login appears successful');
      return { cookies: allCookies, status };
    }

    // Try JSON-based login as fallback (some platforms use API)
    console.log('Trying JSON-based login...');
    const jsonResp = await fetch(`${STRATA_BASE}/api/login`, {
      method: 'POST',
      headers: {
        'User-Agent': 'CropsIntelV2/1.0',
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      body: JSON.stringify({
        email: STRATA_USER,
        username: STRATA_USER,
        password: STRATA_PASS
      }),
      redirect: 'manual'
    });

    if (jsonResp.ok) {
      const jsonData = await jsonResp.json().catch(() => ({}));
      const token = jsonData.token || jsonData.access_token || jsonData.jwt;
      if (token) {
        console.log('Got API token from JSON login');
        return { token, cookies: allCookies, status: jsonResp.status };
      }
    }

    // Try /api/auth/login
    const authResp = await fetch(`${STRATA_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'User-Agent': 'CropsIntelV2/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: STRATA_USER,
        password: STRATA_PASS
      }),
      redirect: 'manual'
    });

    if (authResp.ok) {
      const authData = await authResp.json().catch(() => ({}));
      const token = authData.token || authData.access_token;
      const authCookies = authResp.headers.getSetCookie?.() || [];
      if (token || authCookies.length > 0) {
        console.log('Got session from /api/auth/login');
        return {
          token,
          cookies: [...setCookies, ...authCookies].map(c => c.split(';')[0]).join('; '),
          status: authResp.status
        };
      }
    }

    console.log('All login methods tried — returning best session');
    return { cookies: allCookies, status };

  } catch (err) {
    console.error('Login failed:', err.message);
    return null;
  }
}

// ============================================================
// Fetch pricing data from Strata after login
// ============================================================
async function fetchStrataPrices(session) {
  if (!session) return [];

  const headers = {
    'User-Agent': 'CropsIntelV2/1.0',
    'Accept': 'application/json, text/html',
    'Cookie': session.cookies || '',
  };
  if (session.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  // Try common API endpoints for pricing data
  const endpoints = [
    '/api/prices',
    '/api/market/prices',
    '/api/almonds/prices',
    '/api/commodities',
    '/api/quotes',
    '/api/market-data',
    '/api/v1/prices',
    '/dashboard/prices',
    '/prices',
    '/market',
  ];

  let priceData = null;
  let usedEndpoint = null;

  for (const endpoint of endpoints) {
    const url = `${STRATA_BASE}${endpoint}`;
    console.log(`Trying pricing endpoint: ${url}`);

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });

      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';

        if (contentType.includes('json')) {
          const data = await resp.json();
          console.log(`Got JSON data from ${endpoint}:`, typeof data, Array.isArray(data) ? `${data.length} items` : Object.keys(data).join(', '));
          priceData = data;
          usedEndpoint = endpoint;
          break;
        } else if (contentType.includes('html')) {
          const html = await resp.text();
          // Try to extract pricing from HTML tables
          const prices = extractPricesFromHTML(html);
          if (prices.length > 0) {
            console.log(`Extracted ${prices.length} prices from HTML at ${endpoint}`);
            priceData = prices;
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

  if (!priceData) {
    // Last resort: try scraping the dashboard page
    console.log('Trying dashboard page scrape...');
    try {
      const dashResp = await fetch(`${STRATA_BASE}/dashboard`, { headers, redirect: 'follow' });
      if (dashResp.ok) {
        const html = await dashResp.text();
        const prices = extractPricesFromHTML(html);
        if (prices.length > 0) {
          console.log(`Extracted ${prices.length} prices from dashboard`);
          return prices;
        }
        // Store raw HTML for later analysis
        console.log(`Dashboard HTML: ${html.length} chars — saving for analysis`);
        await logScrape('strata-dashboard-html', 'info', {
          metadata: {
            html_length: html.length,
            has_table: html.includes('<table'),
            has_price: /\$[\d.]+/i.test(html) || /price/i.test(html),
            sample: html.substring(0, 2000)
          }
        });
      }
    } catch (err) {
      console.log(`Dashboard scrape failed: ${err.message}`);
    }
  }

  return priceData || [];
}

// ============================================================
// Extract pricing data from HTML (table scraping)
// ============================================================
function extractPricesFromHTML(html) {
  const prices = [];

  // Pattern 1: Look for price tables with variety/grade/price columns
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];

    // Check if this table has pricing keywords
    if (!/price|bid|ask|offer|usd|\$/i.test(tableHtml)) continue;

    // Extract rows
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

      // If this looks like a header row
      if (row.includes('<th') || headerCols.length === 0) {
        headerCols = cells.map(c => c.toLowerCase());
        continue;
      }

      // Try to map cells to price data
      const priceObj = {};
      cells.forEach((cell, i) => {
        const col = headerCols[i] || '';
        if (/variety|type|product|item/i.test(col)) priceObj.variety = cell;
        if (/grade|size|spec/i.test(col)) priceObj.grade = cell;
        if (/form|style/i.test(col)) priceObj.form = cell;
        if (/bid/i.test(col)) priceObj.bid = parsePrice(cell);
        if (/ask|offer/i.test(col)) priceObj.ask = parsePrice(cell);
        if (/price|last|close/i.test(col)) priceObj.price = parsePrice(cell);
        if (/volume|qty/i.test(col)) priceObj.volume = parseInt(cell.replace(/[^0-9]/g, '')) || 0;
      });

      if (priceObj.variety || priceObj.price || priceObj.bid) {
        prices.push(priceObj);
      }
    }
  }

  // Pattern 2: Look for inline price mentions
  const inlinePriceRegex = /(nonpareil|carmel|butte|padre|monterey|mission|california|independence)[^$]*?\$([\d.]+)/gi;
  let inlineMatch;
  while ((inlineMatch = inlinePriceRegex.exec(html)) !== null) {
    prices.push({
      variety: inlineMatch[1],
      price: parseFloat(inlineMatch[2])
    });
  }

  return prices;
}

function parsePrice(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ============================================================
// Normalize and store prices in Supabase
// ============================================================
async function storePrices(rawPrices) {
  if (!rawPrices || rawPrices.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  let inserted = 0;

  const normalizedPrices = (Array.isArray(rawPrices) ? rawPrices : [rawPrices])
    .filter(p => p && (p.price || p.bid || p.ask || p.price_usd_per_lb))
    .map(p => {
      const basePrice = p.price || p.price_usd_per_lb || p.ask || p.bid || 0;
      return {
        price_date: p.date || today,
        variety: p.variety || p.type || p.product || 'Unknown',
        grade: p.grade || p.size || null,
        form: p.form || p.style || null,
        price_usd_per_lb: basePrice,
        maxons_price_per_lb: Math.round(basePrice * (1 + MAXONS_MARGIN) * 10000) / 10000,
        bid_price: p.bid || null,
        ask_price: p.ask || null,
        volume_lbs: p.volume || null,
        source: 'strata',
        metadata: { raw: p }
      };
    });

  for (const price of normalizedPrices) {
    const { error } = await supabaseAdmin.from('strata_prices').upsert(price, {
      onConflict: 'price_date,variety,grade,form'
    });

    if (!error) {
      inserted++;
      console.log(`Stored: ${price.variety} ${price.grade || ''} = $${price.price_usd_per_lb}/lb → MAXONS $${price.maxons_price_per_lb}/lb`);
    } else {
      console.error(`DB error for ${price.variety}:`, error.message);
    }
  }

  return inserted;
}

// ============================================================
// Main scrape function
// ============================================================
export async function scrapeStrata() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — Strata Markets Scraper');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`MAXONS margin: ${MAXONS_MARGIN * 100}%`);
  console.log('========================================\n');

  await logScrape('strata-scraper', 'started');

  // Step 1: Login
  const session = await strataLogin();
  if (!session) {
    await logScrape('strata-scraper', 'failed', { error: 'Login failed' });
    return { found: 0, inserted: 0, error: 'Login failed' };
  }

  // Step 2: Fetch prices
  const rawPrices = await fetchStrataPrices(session);
  const found = Array.isArray(rawPrices) ? rawPrices.length : (rawPrices ? 1 : 0);
  console.log(`\nRaw prices found: ${found}`);

  // Step 3: Store in database
  const inserted = await storePrices(rawPrices);

  const duration = Date.now() - startTime;

  await logScrape('strata-scraper', inserted > 0 ? 'success' : (found > 0 ? 'parsed' : 'no_data'), {
    found,
    inserted,
    duration,
    metadata: {
      login_status: session.status,
      has_token: !!session.token,
      maxons_margin: `${MAXONS_MARGIN * 100}%`
    }
  });

  console.log(`\nStrata scrape complete: ${inserted} prices stored (${duration}ms)`);
  return { found, inserted, duration };
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('strata-scraper')) {
  scrapeStrata().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Strata scraper crashed:', err);
    process.exit(1);
  });
}
