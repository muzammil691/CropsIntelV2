// CropsIntelV2 — ABC Auto-Scraper
// Scrapes Almond Board of California (almonds.org) for:
//   - Position Reports (monthly supply/demand) ✅ ACTIVE
//   - Shipment Reports (by destination)
//   - Crop Receipt Reports (by variety)
//   - Subjective Forecasts (May, annual)
//   - Objective Forecasts (July, annual)
//   - USDA-NASS Acreage Reports
//   - Almond Almanac (annual year-end)
//   - Nursery Reports (leading indicator)
//
// URL updated 2026-04-21: /processors/industry-reports → /tools-and-resources/crop-reports/
// Runs autonomously on schedule or manually: node src/scrapers/abc-scraper.js

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';
import { parseShipmentReport, storeShipmentRecords } from './shipment-parser.js';
import { parseReceiptReport, storeReceiptRecords } from './receipts-parser.js';
// storeReceiptRecords is exported from receipts-parser.js (added alongside the
// schema-mapper in this commit). Mirrors storeShipmentRecords.

const ABC_BASE_URL = 'https://www.almonds.org';
// ABC publishes reports under /tools-and-resources/crop-reports/
// As of 2026-04: old URL /processors/industry-reports returns 404
// Position reports, shipment reports, forecasts, acreage — all linked from crop-reports hub
const ABC_DATA_URL = `${ABC_BASE_URL}/tools-and-resources/crop-reports`;
// Sub-pages for specific report types
const ABC_REPORT_URLS = {
  position: `${ABC_BASE_URL}/tools-and-resources/crop-reports/position-reports`,
  subjective: `${ABC_BASE_URL}/tools-and-resources/crop-reports/subjective-forecasts`,
  objective: `${ABC_BASE_URL}/tools-and-resources/crop-reports/objective-forecasts`,
  acreage_usda: `${ABC_BASE_URL}/tools-and-resources/crop-reports/usda-nass-acreage-reports`,
  acreage_landiq: `${ABC_BASE_URL}/tools-and-resources/crop-reports/land-iq-acreage-reports`,
  nursery: `${ABC_BASE_URL}/tools-and-resources/crop-reports/nursery-report`,
  almanac: `${ABC_BASE_URL}/tools-and-resources/crop-reports/almond-almanac`,
  fruit_weight: `${ABC_BASE_URL}/tools-and-resources/crop-reports/fruit-weight-report`,
};
// Fallback paths to try if primary URL changes again
const ABC_FALLBACK_URLS = [
  `${ABC_BASE_URL}/tools-and-resources/crop-reports`,
  `${ABC_BASE_URL}/processors/industry-reports`,
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
// Fetch a page from almonds.org and extract PDF links
// ============================================================
async function fetchPagePDFs(pageUrl) {
  console.log(`Fetching page: ${pageUrl}`);
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'CropsIntelV2/1.0 (Market Intelligence Platform)',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.log(`HTTP ${response.status} from ${pageUrl}`);
      return [];
    }

    const html = await response.text();
    console.log(`Fetched ${html.length} bytes from ${pageUrl}`);

    const pdfLinks = [];
    const pdfRegex = /href="([^"]*\.pdf[^"]*)"/gi;
    let match;
    while ((match = pdfRegex.exec(html)) !== null) {
      const url = match[1].startsWith('http') ? match[1] : `${ABC_BASE_URL}${match[1]}`;
      pdfLinks.push(url);
    }
    console.log(`Found ${pdfLinks.length} PDF links on ${pageUrl}`);
    return pdfLinks;
  } catch (err) {
    console.error(`Failed to fetch ${pageUrl}:`, err.message);
    return [];
  }
}

// ============================================================
// Fetch ABC crop reports hub + specific report pages for PDFs
// ============================================================
async function fetchABCDataPage() {
  // Fetch the main crop-reports hub page
  const urlsToTry = [ABC_DATA_URL, ...ABC_FALLBACK_URLS];
  let allPDFs = [];

  for (const url of urlsToTry) {
    const pdfs = await fetchPagePDFs(url);
    if (pdfs.length > 0) {
      allPDFs = pdfs;
      console.log(`Success! Found ${pdfs.length} PDFs from hub page`);
      break;
    }
  }

  // Also fetch the dedicated Position Reports page (has archive back to 1990)
  const positionPagePDFs = await fetchPagePDFs(ABC_REPORT_URLS.position);
  allPDFs = [...new Set([...allPDFs, ...positionPagePDFs])]; // deduplicate

  if (allPDFs.length === 0) {
    console.error('No PDFs found on any ABC page');
    await logScrape('abc-page-fetch', 'failed', { error: 'No PDFs found' });
    return { positionPDFs: [], shipmentPDFs: [], receiptPDFs: [], allPDFs: [] };
  }

  // Categorize PDFs by type
  const positionPDFs = allPDFs.filter(u => /position/i.test(u));
  const shipmentPDFs = allPDFs.filter(u => /shipment/i.test(u));
  const receiptPDFs = allPDFs.filter(u => /receipt/i.test(u));

  console.log(`Categorized: ${positionPDFs.length} position, ${shipmentPDFs.length} shipment, ${receiptPDFs.length} receipt`);

  return { positionPDFs, shipmentPDFs, receiptPDFs, allPDFs };
}

// ============================================================
// Fetch PDFs from a specific report type page
// ============================================================
async function fetchReportTypePDFs(reportType) {
  const url = ABC_REPORT_URLS[reportType];
  if (!url) {
    console.error(`Unknown report type: ${reportType}`);
    return [];
  }
  return await fetchPagePDFs(url);
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

  // 3. Download and parse new position reports.
  //    Each position-report PDF also contains shipment-by-destination tables
  //    and (for some months) variety-level receipt tables. We piggy-back the
  //    shipment + receipt parsers on the same downloaded buffer so one HTTP
  //    fetch yields all three record types.
  let shipmentTotalInserted = 0;
  let receiptTotalInserted = 0;
  for (const pdfUrl of positionPDFs.slice(0, 5)) { // Process up to 5 at a time
    const pdfBuffer = await downloadPDF(pdfUrl);
    if (!pdfBuffer) continue;

    const report = await parsePositionReport(pdfBuffer, pdfUrl);
    if (!report) continue;

    const key = `${report.report_year}-${report.report_month}`;
    if (!existingKeys.has(key)) {
      if (await storePositionReport(report)) totalInserted++;
    } else {
      console.log(`Position report ${key} already in DB — continuing to shipment/receipt extraction`);
    }

    // Extract shipment-by-destination records from the same PDF.
    try {
      const shipmentRecords = await parseShipmentReport(pdfBuffer, pdfUrl);
      if (shipmentRecords?.length) {
        const stored = await storeShipmentRecords(shipmentRecords);
        shipmentTotalInserted += stored;
      }
    } catch (err) {
      console.warn(`Shipment extraction failed for ${key}:`, err.message);
    }

    // Extract variety-level receipt records from the same PDF (when present).
    try {
      const receiptRecords = await parseReceiptReport(pdfBuffer, pdfUrl);
      if (receiptRecords?.length) {
        const stored = await storeReceiptRecords(receiptRecords);
        receiptTotalInserted += stored;
      }
    } catch (err) {
      console.warn(`Receipt extraction failed for ${key}:`, err.message);
    }
  }

  console.log(`\nMulti-report extraction: ${shipmentTotalInserted} shipment rows, ${receiptTotalInserted} receipt rows stored`);

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

// ============================================================
// Scrape Subjective Forecasts (May each year)
// ============================================================
export async function scrapeSubjectiveForecasts() {
  console.log('\n--- Scraping Subjective Forecasts ---');
  const pdfs = await fetchReportTypePDFs('subjective');
  console.log(`Found ${pdfs.length} subjective forecast PDFs`);

  let inserted = 0;
  for (const pdfUrl of pdfs) {
    const buffer = await downloadPDF(pdfUrl);
    if (!buffer) continue;

    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const text = data.text;

      // Extract year from text
      const yearMatch = text.match(/(\d{4})\s*(?:California\s+)?Almond\s+(?:Subjective|Forecast)/i)
        || text.match(/(20\d{2})/);
      if (!yearMatch) continue;

      const year = parseInt(yearMatch[1]);
      const cropYear = `${year}/${year + 1}`;

      // Extract forecast number (billion lbs or million lbs)
      const forecastMatch = text.match(/([\d,.]+)\s*(?:billion|million)\s*(?:meat-?weight)?/i);
      let forecastLbs = 0;
      if (forecastMatch) {
        const num = parseFloat(forecastMatch[1].replace(/,/g, ''));
        forecastLbs = forecastMatch[0].toLowerCase().includes('billion')
          ? Math.round(num * 1e9) : Math.round(num * 1e6);
      }

      const { error } = await supabaseAdmin.from('abc_forecasts').upsert({
        forecast_type: 'subjective',
        forecast_year: year,
        crop_year: cropYear,
        forecast_lbs: forecastLbs,
        report_month: 5, // May
        source_pdf: pdfUrl,
        raw_text: text.substring(0, 3000),
      }, { onConflict: 'forecast_type,forecast_year' });

      if (!error) {
        inserted++;
        console.log(`Stored subjective forecast: ${cropYear} → ${forecastLbs.toLocaleString()} lbs`);
      }
    } catch (err) {
      console.error(`Parse error for ${pdfUrl}:`, err.message);
    }
  }

  await logScrape('abc-subjective-forecasts', inserted > 0 ? 'success' : 'skipped', { found: pdfs.length, inserted });
  return { found: pdfs.length, inserted };
}

// ============================================================
// Scrape Objective Forecasts (July each year)
// ============================================================
export async function scrapeObjectiveForecasts() {
  console.log('\n--- Scraping Objective Forecasts ---');
  const pdfs = await fetchReportTypePDFs('objective');
  console.log(`Found ${pdfs.length} objective forecast PDFs`);

  let inserted = 0;
  for (const pdfUrl of pdfs) {
    // Skip presentation PDFs — only parse the actual forecast reports
    if (/presentation/i.test(pdfUrl)) continue;

    const buffer = await downloadPDF(pdfUrl);
    if (!buffer) continue;

    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const text = data.text;

      const yearMatch = text.match(/(20\d{2})\s*(?:California\s+)?Almond\s+(?:Objective|Forecast)/i)
        || text.match(/(20\d{2})/);
      if (!yearMatch) continue;

      const year = parseInt(yearMatch[1]);
      const cropYear = `${year}/${year + 1}`;

      const forecastMatch = text.match(/([\d,.]+)\s*(?:billion|million)\s*(?:meat-?weight)?/i);
      let forecastLbs = 0;
      if (forecastMatch) {
        const num = parseFloat(forecastMatch[1].replace(/,/g, ''));
        forecastLbs = forecastMatch[0].toLowerCase().includes('billion')
          ? Math.round(num * 1e9) : Math.round(num * 1e6);
      }

      const { error } = await supabaseAdmin.from('abc_forecasts').upsert({
        forecast_type: 'objective',
        forecast_year: year,
        crop_year: cropYear,
        forecast_lbs: forecastLbs,
        report_month: 7, // July
        source_pdf: pdfUrl,
        raw_text: text.substring(0, 3000),
      }, { onConflict: 'forecast_type,forecast_year' });

      if (!error) {
        inserted++;
        console.log(`Stored objective forecast: ${cropYear} → ${forecastLbs.toLocaleString()} lbs`);
      }
    } catch (err) {
      console.error(`Parse error for ${pdfUrl}:`, err.message);
    }
  }

  await logScrape('abc-objective-forecasts', inserted > 0 ? 'success' : 'skipped', { found: pdfs.length, inserted });
  return { found: pdfs.length, inserted };
}

// ============================================================
// Scrape USDA-NASS Acreage Reports
// ============================================================
export async function scrapeAcreageReports() {
  console.log('\n--- Scraping Acreage Reports ---');
  const pdfs = await fetchReportTypePDFs('acreage_usda');
  console.log(`Found ${pdfs.length} acreage report PDFs`);

  let inserted = 0;
  for (const pdfUrl of pdfs) {
    const buffer = await downloadPDF(pdfUrl);
    if (!buffer) continue;

    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const text = data.text;

      const yearMatch = text.match(/(20\d{2})/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1]);

      // Extract bearing and total acreage
      const bearingMatch = text.match(/bearing[:\s]*([\d,]+)\s*(?:acres)?/i);
      const totalMatch = text.match(/total[:\s]*([\d,]+)\s*(?:acres)?/i);
      const nonBearingMatch = text.match(/non[\s-]*bearing[:\s]*([\d,]+)\s*(?:acres)?/i);

      const bearingAcres = bearingMatch ? parseInt(bearingMatch[1].replace(/,/g, '')) : 0;
      const totalAcres = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0;
      const nonBearingAcres = nonBearingMatch ? parseInt(nonBearingMatch[1].replace(/,/g, '')) : 0;

      const { error } = await supabaseAdmin.from('abc_acreage_reports').upsert({
        report_year: year,
        source_type: 'usda_nass',
        bearing_acres: bearingAcres,
        non_bearing_acres: nonBearingAcres,
        total_acres: totalAcres || (bearingAcres + nonBearingAcres),
        source_pdf: pdfUrl,
        raw_text: text.substring(0, 3000),
      }, { onConflict: 'report_year,source_type' });

      if (!error) {
        inserted++;
        console.log(`Stored acreage: ${year} → ${(totalAcres || bearingAcres).toLocaleString()} acres`);
      }
    } catch (err) {
      console.error(`Parse error for ${pdfUrl}:`, err.message);
    }
  }

  await logScrape('abc-acreage-reports', inserted > 0 ? 'success' : 'skipped', { found: pdfs.length, inserted });
  return { found: pdfs.length, inserted };
}

// ============================================================
// Scrape Almond Almanac (annual year-end reports)
// ============================================================
export async function scrapeAlmanac() {
  console.log('\n--- Scraping Almond Almanac ---');
  const pdfs = await fetchReportTypePDFs('almanac');
  console.log(`Found ${pdfs.length} almanac PDFs`);

  let inserted = 0;
  for (const pdfUrl of pdfs) {
    const buffer = await downloadPDF(pdfUrl);
    if (!buffer) continue;

    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const text = data.text;

      const yearMatch = text.match(/(?:Almanac|Annual Report)[^0-9]*(20\d{2})/i)
        || text.match(/(20\d{2})\s*Almanac/i)
        || text.match(/(20\d{2})/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1]);

      const { error } = await supabaseAdmin.from('abc_almanac').upsert({
        almanac_year: year,
        crop_year: `${year - 1}/${year}`,
        num_pages: data.numpages,
        source_pdf: pdfUrl,
        summary_text: text.substring(0, 5000),
      }, { onConflict: 'almanac_year' });

      if (!error) {
        inserted++;
        console.log(`Stored almanac: ${year} (${data.numpages} pages)`);
      }
    } catch (err) {
      console.error(`Parse error for ${pdfUrl}:`, err.message);
    }
  }

  await logScrape('abc-almanac', inserted > 0 ? 'success' : 'skipped', { found: pdfs.length, inserted });
  return { found: pdfs.length, inserted };
}

// ============================================================
// Scrape ALL report types (full cycle)
// ============================================================
export async function scrapeAllReportTypes() {
  console.log('\n========================================');
  console.log('CropsIntelV2 — FULL ABC Report Scrape');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  // scrapeABC now extracts position + shipment + receipt from each position PDF
  // (one download, three record types). Subjective/Objective/Acreage/Almanac
  // each have their own dedicated PDF source.
  const results = {
    position: await scrapeABC(),
    subjective: await scrapeSubjectiveForecasts(),
    objective: await scrapeObjectiveForecasts(),
    acreage: await scrapeAcreageReports(),
    almanac: await scrapeAlmanac(),
  };

  const totalFound = Object.values(results).reduce((s, r) => s + (r.found || 0), 0);
  const totalInserted = Object.values(results).reduce((s, r) => s + (r.inserted || 0), 0);

  console.log('\n========================================');
  console.log(`FULL SCRAPE COMPLETE: ${totalInserted} new records from ${totalFound} PDFs found`);
  console.log('========================================');

  return results;
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('abc-scraper')) {
  const mode = process.argv[2] || 'position';
  const fn = mode === 'all' ? scrapeAllReportTypes
    : mode === 'subjective' ? scrapeSubjectiveForecasts
    : mode === 'objective' ? scrapeObjectiveForecasts
    : mode === 'acreage' ? scrapeAcreageReports
    : mode === 'almanac' ? scrapeAlmanac
    : scrapeABC;

  console.log(`Running scraper: ${mode}`);
  fn().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Scraper crashed:', err);
    process.exit(1);
  });
}
