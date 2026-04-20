// CropsIntelV2 — ABC Auto-Scraper
// Scrapes Almond Board of California (almonds.org) for:
//   - Position Reports (monthly supply/demand)
//   - Shipment Reports (by destination)
//   - Crop Receipt Reports (by variety)
//
// Runs autonomously on schedule or manually: node src/scrapers/abc-scraper.js

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

const ABC_BASE_URL = 'https://www.almonds.org';
// ABC publishes reports under /processors/industry-reports
// Position reports, shipment reports, and receipt reports are all linked here
const ABC_DATA_URL = `${ABC_BASE_URL}/processors/industry-reports`;
// Fallback paths to try if primary URL changes
const ABC_FALLBACK_URLS = [
  `${ABC_BASE_URL}/industry/industry-data`,
  `${ABC_BASE_URL}/data/position-reports`,
  `${ABC_BASE_URL}/industry-data`,
];

// ============================================================
// Logging helper — writes to scraping_logs table
// ============================================================
async function logScrape(scraperName, status, details = {}) {
  const { error } = await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: scraperName,
    target_url: details.url || ABC_DATA_URL,
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
// Fetch ABC industry data page and find PDF links
// ============================================================
async function fetchABCDataPage() {
  const urlsToTry = [ABC_DATA_URL, ...ABC_FALLBACK_URLS];
  let html = null;
  let usedUrl = null;

  for (const url of urlsToTry) {
    console.log(`Trying ABC data page: ${url}`);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CropsIntelV2/1.0 (Market Intelligence Platform)',
          'Accept': 'text/html'
        },
        redirect: 'follow'
      });

      if (response.ok) {
        html = await response.text();
        usedUrl = url;
        console.log(`Success! Fetched ${html.length} bytes from ${url}`);
        break;
      } else {
        console.log(`HTTP ${response.status} from ${url}, trying next...`);
      }
    } catch (err) {
      console.log(`Failed to reach ${url}: ${err.message}`);
    }
  }

  if (!html) {
    console.error('All ABC URLs failed');
    await logScrape('abc-page-fetch', 'failed', { error: 'All URLs unreachable' });
    return { positionPDFs: [], shipmentPDFs: [], receiptPDFs: [], allPDFs: [] };
  }

  try {

    // Extract PDF links from the page
    const pdfLinks = [];
    const pdfRegex = /href="([^"]*\.pdf[^"]*)"/gi;
    let match;
    while ((match = pdfRegex.exec(html)) !== null) {
      const url = match[1].startsWith('http') ? match[1] : `${ABC_BASE_URL}${match[1]}`;
      pdfLinks.push(url);
    }

    console.log(`Found ${pdfLinks.length} PDF links`);

    // Categorize PDFs
    const positionPDFs = pdfLinks.filter(u => /position/i.test(u));
    const shipmentPDFs = pdfLinks.filter(u => /shipment/i.test(u));
    const receiptPDFs = pdfLinks.filter(u => /receipt/i.test(u));

    return { positionPDFs, shipmentPDFs, receiptPDFs, allPDFs: pdfLinks };
  } catch (error) {
    console.error('Failed to fetch ABC data page:', error.message);
    await logScrape('abc-page-fetch', 'failed', { error: error.message });
    return { positionPDFs: [], shipmentPDFs: [], receiptPDFs: [], allPDFs: [] };
  }
}

// ============================================================
// Download and parse a PDF report
// ============================================================
async function downloadPDF(url) {
  console.log(`Downloading PDF: ${url}`);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CropsIntelV2/1.0' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    console.error(`PDF download failed: ${url}`, error.message);
    return null;
  }
}

// ============================================================
// Parse Position Report PDF into structured data
// ============================================================
async function parsePositionReport(pdfBuffer, sourceUrl) {
  try {
    // Dynamic import for pdf-parse (Node.js only)
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(pdfBuffer);
    const text = data.text;

    console.log(`Parsed PDF: ${data.numpages} pages, ${text.length} chars`);

    // Extract date from text (e.g., "March 2025 Position Report")
    const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (!dateMatch) {
      console.warn('Could not extract date from position report');
      return null;
    }

    const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
                     july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
    const month = months[dateMatch[1].toLowerCase()];
    const year = parseInt(dateMatch[2]);
    const reportDate = `${year}-${String(month).padStart(2, '0')}-01`;

    // Extract numbers using multiple patterns for each field
    // ABC Position Reports use consistent labeling across years
    const extractNumber = (patterns) => {
      for (const pattern of (Array.isArray(patterns) ? patterns : [patterns])) {
        const m = text.match(pattern);
        if (m) {
          const raw = m[1].replace(/,/g, '').replace(/\s/g, '');
          const num = parseInt(raw);
          if (!isNaN(num) && num > 0) return num;
        }
      }
      return 0;
    };

    // Normalize text for more reliable matching (collapse whitespace)
    const norm = text.replace(/\s+/g, ' ');

    const carry_in = extractNumber([
      /Carry[\s-]*[Ii]n[:\s]*\(?\s*([\d,]+)/,
      /Beginning[\s]*Inventory[:\s]*([\d,]+)/,
      /Carry[\s-]*[Ff]orward[:\s]*([\d,]+)/
    ]);

    const receipts = extractNumber([
      /Crop Receipts[^:]*?[:\s]*([\d,]+)/i,
      /Total Receipts[:\s]*([\d,]+)/i,
      /Receipts to Date[:\s]*([\d,]+)/i
    ]);

    const total_supply = extractNumber([
      /Total Supply[:\s]*([\d,]+)/i,
      /Marketable Supply[:\s]*([\d,]+)/i
    ]);

    const domestic_shipped = extractNumber([
      /Domestic Shipments?[:\s]*([\d,]+)/i
    ]);

    const export_shipped = extractNumber([
      /Export Shipments?[:\s]*([\d,]+)/i
    ]);

    const total_shipped = extractNumber([
      /Total Shipments?[:\s]*([\d,]+)/i
    ]) || (domestic_shipped + export_shipped);

    const domestic_committed = extractNumber([
      /Domestic Committed[:\s]*([\d,]+)/i,
      /Domestic[\s]*\(Committed\)[:\s]*([\d,]+)/i
    ]);

    const export_committed = extractNumber([
      /Export Committed[:\s]*([\d,]+)/i,
      /Export[\s]*\(Committed\)[:\s]*([\d,]+)/i
    ]);

    const total_committed = extractNumber([
      /Total Committed[:\s]*([\d,]+)/i
    ]) || (domestic_committed + export_committed);

    const domestic_new = extractNumber([
      /Domestic New Commitments?[:\s]*([\d,]+)/i,
      /Domestic[\s]*\(New\)[:\s]*([\d,]+)/i
    ]);

    const export_new = extractNumber([
      /Export New Commitments?[:\s]*([\d,]+)/i,
      /Export[\s]*\(New\)[:\s]*([\d,]+)/i
    ]);

    const total_new = extractNumber([
      /Total New Commitments?[:\s]*([\d,]+)/i
    ]) || (domestic_new + export_new);

    const uncommitted = extractNumber([
      /Uncommitted Inventory[:\s]*([\d,]+)/i,
      /Uncommitted[:\s]*([\d,]+)/i
    ]);

    console.log(`Extracted: supply=${total_supply}, shipped=${total_shipped}, committed=${total_committed}, uncommitted=${uncommitted}`);

    return {
      report_date: reportDate,
      report_year: year,
      report_month: month,
      crop_year: month >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`,
      carry_in_lbs: carry_in,
      receipts_lbs: receipts,
      domestic_committed_lbs: domestic_committed,
      export_committed_lbs: export_committed,
      total_committed_lbs: total_committed,
      domestic_shipped_lbs: domestic_shipped,
      export_shipped_lbs: export_shipped,
      total_shipped_lbs: total_shipped,
      domestic_new_commitments_lbs: domestic_new,
      export_new_commitments_lbs: export_new,
      total_new_commitments_lbs: total_new,
      uncommitted_lbs: uncommitted,
      total_supply_lbs: total_supply || (carry_in + receipts),
      raw_data: { text: text.substring(0, 5000), pages: data.numpages },
      source_pdf: sourceUrl
    };
  } catch (error) {
    console.error('PDF parse error:', error.message);
    return null;
  }
}

// ============================================================
// Store parsed position report in database
// ============================================================
async function storePositionReport(report) {
  if (!report) return false;

  const { data, error } = await supabaseAdmin
    .from('abc_position_reports')
    .upsert(report, { onConflict: 'report_year,report_month' })
    .select();

  if (error) {
    console.error('DB insert failed:', error.message);
    return false;
  }

  console.log(`Stored position report: ${report.report_year}-${report.report_month}`);
  return true;
}

// ============================================================
// Main scrape function — orchestrates the full pipeline
// ============================================================
export async function scrapeABC() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — ABC Auto-Scraper');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  await logScrape('abc-auto-scraper', 'started');

  // 1. Fetch the ABC data page and find PDF links
  const { positionPDFs, shipmentPDFs, receiptPDFs } = await fetchABCDataPage();

  let totalFound = positionPDFs.length + shipmentPDFs.length + receiptPDFs.length;
  let totalInserted = 0;

  // 2. Check which reports we already have
  const { data: existingReports } = await supabaseAdmin
    .from('abc_position_reports')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .limit(24);

  const existingKeys = new Set(
    (existingReports || []).map(r => `${r.report_year}-${r.report_month}`)
  );

  console.log(`Already have ${existingKeys.size} position reports in DB`);

  // 3. Download and parse new position reports
  for (const pdfUrl of positionPDFs.slice(0, 5)) { // Process up to 5 at a time
    const pdfBuffer = await downloadPDF(pdfUrl);
    if (!pdfBuffer) continue;

    const report = await parsePositionReport(pdfBuffer, pdfUrl);
    if (!report) continue;

    const key = `${report.report_year}-${report.report_month}`;
    if (existingKeys.has(key)) {
      console.log(`Skipping existing report: ${key}`);
      continue;
    }

    if (await storePositionReport(report)) {
      totalInserted++;
    }
  }

  // 4. Update last scrape timestamp
  try {
    const { data: configRow } = await supabaseAdmin.from('system_config').select('value').eq('key', 'last_scrape_dates').single();
    let existing = {};
    if (configRow?.value) {
      existing = typeof configRow.value === 'string' ? JSON.parse(configRow.value) : configRow.value;
    }
    await supabaseAdmin
      .from('system_config')
      .update({
        value: JSON.stringify({ ...existing, abc_position: new Date().toISOString() }),
        updated_at: new Date().toISOString()
      })
      .eq('key', 'last_scrape_dates');
  } catch (configErr) {
    console.warn('Failed to update last_scrape_dates:', configErr.message);
  }

  const duration = Date.now() - startTime;

  await logScrape('abc-auto-scraper', totalInserted > 0 ? 'success' : 'skipped', {
    found: totalFound,
    inserted: totalInserted,
    duration,
    metadata: {
      positionPDFs: positionPDFs.length,
      shipmentPDFs: shipmentPDFs.length,
      receiptPDFs: receiptPDFs.length
    }
  });

  console.log(`\nScrape complete: ${totalInserted} new reports stored (${duration}ms)`);
  return { found: totalFound, inserted: totalInserted, duration };
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('abc-scraper')) {
  scrapeABC().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Scraper crashed:', err);
    process.exit(1);
  });
}
