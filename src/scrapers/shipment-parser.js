// CropsIntelV2 — Shipment Report Parser
// Parses ABC Shipment Reports (by destination) into structured data
// Populates abc_shipment_reports with country-level export data
// Run: node src/scrapers/shipment-parser.js

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

// ============================================================
// Known top export destinations (ABC report standard list)
// ============================================================
const TOP_EXPORT_DESTINATIONS = [
  'Spain', 'India', 'China/Hong Kong', 'Germany', 'United Arab Emirates',
  'Netherlands', 'Italy', 'Turkey', 'Japan', 'South Korea',
  'United Kingdom', 'France', 'Canada', 'Morocco', 'Vietnam',
  'Saudi Arabia', 'Australia', 'Mexico', 'Pakistan', 'Jordan',
  'Indonesia', 'Malaysia', 'Thailand', 'Taiwan', 'Belgium',
  'Chile', 'Philippines', 'Brazil', 'Israel', 'Algeria',
  'Egypt', 'Iraq', 'Lebanon', 'Poland', 'Russia',
  'Portugal', 'Greece', 'Norway', 'Sweden', 'Denmark',
  'Switzerland', 'Austria', 'Czech Republic', 'Romania', 'Ukraine'
];

const COUNTRY_ALIASES = {
  'china': 'China/Hong Kong',
  'hong kong': 'China/Hong Kong',
  'china/hk': 'China/Hong Kong',
  'uae': 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  'korea': 'South Korea',
  'republic of korea': 'South Korea',
  's. korea': 'South Korea',
  'the netherlands': 'Netherlands',
  'holland': 'Netherlands',
};

function normalizeCountry(name) {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  return COUNTRY_ALIASES[lower] || name.trim();
}

// ============================================================
// Parse shipment report PDF text into structured records
// ============================================================
export async function parseShipmentReport(pdfBuffer, sourceUrl) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(pdfBuffer);
    const text = data.text;

    console.log(`Parsing shipment report: ${data.numpages} pages, ${text.length} chars`);

    const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (!dateMatch) {
      console.warn('Could not extract date from shipment report');
      return [];
    }

    const months = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    const month = months[dateMatch[1].toLowerCase()];
    const year = parseInt(dateMatch[2]);
    const reportDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const cropYear = month >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;

    const records = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      for (const country of TOP_EXPORT_DESTINATIONS) {
        const escapedCountry = country.replace(/[\/()]/g, '\\$&');
        const pattern = new RegExp(`^${escapedCountry}\\s+([\\d,]+)\\s+([\\d,]+)`, 'i');
        const match = line.match(pattern);

        if (match) {
          const monthlyLbs = parseInt(match[1].replace(/,/g, ''));
          const seasonLbs = parseInt(match[2].replace(/,/g, ''));

          if (!isNaN(monthlyLbs) && monthlyLbs > 0) {
            records.push({
              report_date: reportDate, report_year: year, report_month: month,
              crop_year: cropYear, destination_region: 'export',
              destination_country: normalizeCountry(country),
              monthly_lbs: monthlyLbs, season_to_date_lbs: seasonLbs || 0,
              prior_year_monthly_lbs: 0, prior_year_season_to_date_lbs: 0,
              source_pdf: sourceUrl
            });
          }
          break;
        }
      }

      const domMatch = line.match(/^(?:Domestic|Total Domestic)\s+([\d,]+)\s+([\d,]+)/i);
      if (domMatch) {
        const monthlyLbs = parseInt(domMatch[1].replace(/,/g, ''));
        const seasonLbs = parseInt(domMatch[2].replace(/,/g, ''));
        if (!isNaN(monthlyLbs) && monthlyLbs > 0) {
          records.push({
            report_date: reportDate, report_year: year, report_month: month,
            crop_year: cropYear, destination_region: 'domestic',
            destination_country: 'United States',
            monthly_lbs: monthlyLbs, season_to_date_lbs: seasonLbs || 0,
            prior_year_monthly_lbs: 0, prior_year_season_to_date_lbs: 0,
            source_pdf: sourceUrl
          });
        }
      }
    }

    if (records.length === 0) {
      console.log('No country-level data found — extracting summary totals');
      const extractNumber = (patterns) => {
        for (const pattern of (Array.isArray(patterns) ? patterns : [patterns])) {
          const m = text.match(pattern);
          if (m) {
            const num = parseInt(m[1].replace(/,/g, ''));
            if (!isNaN(num) && num > 0) return num;
          }
        }
        return 0;
      };
      const domTotal = extractNumber([/Total Domestic[:\s]*([\d,]+)/i]);
      const expTotal = extractNumber([/Total Export[:\s]*([\d,]+)/i]);

      if (domTotal > 0) {
        records.push({ report_date: reportDate, report_year: year, report_month: month,
          crop_year: cropYear, destination_region: 'domestic', destination_country: 'United States',
          monthly_lbs: domTotal, season_to_date_lbs: 0, prior_year_monthly_lbs: 0,
          prior_year_season_to_date_lbs: 0, source_pdf: sourceUrl });
      }
      if (expTotal > 0) {
        records.push({ report_date: reportDate, report_year: year, report_month: month,
          crop_year: cropYear, destination_region: 'export', destination_country: 'Total Export',
          monthly_lbs: expTotal, season_to_date_lbs: 0, prior_year_monthly_lbs: 0,
          prior_year_season_to_date_lbs: 0, source_pdf: sourceUrl });
      }
    }

    console.log(`Extracted ${records.length} shipment records from PDF`);
    return records;
  } catch (error) {
    console.error('Shipment PDF parse error:', error.message);
    return [];
  }
}

// ============================================================
// Store shipment records in database
// ============================================================
export async function storeShipmentRecords(records) {
  if (!records.length) return 0;
  let inserted = 0;
  for (const record of records) {
    const { error } = await supabaseAdmin
      .from('abc_shipment_reports')
      .upsert(record, { onConflict: 'report_year,report_month,destination_region,destination_country' });
    if (error) {
      console.error(`Shipment insert failed for ${record.destination_country}:`, error.message);
    } else {
      inserted++;
    }
  }
  console.log(`Stored ${inserted}/${records.length} shipment records`);
  return inserted;
}

// ============================================================
// Generate synthetic shipment data from position reports
// ============================================================
export async function generateShipmentDataFromPositionReports() {
  console.log('Generating shipment data from position reports...');

  // Check how many records already exist — inform logging only, do NOT skip.
  // Upsert with onConflict(report_year, report_month, destination_region, destination_country)
  // makes re-running this safe: existing rows are overwritten, new position-report years get filled.
  // Previous behaviour skipped when count > 0, which permanently froze the table at whatever
  // partial coverage existed on the first run. That is the "skipped" bug flagged in the 2026-04-23 audit.
  const { count: existingCount } = await supabaseAdmin
    .from('abc_shipment_reports')
    .select('id', { count: 'exact', head: true });
  console.log(`Shipment table currently has ${existingCount || 0} records — will upsert to cover all position-report years.`);

  const { data: reports } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: true })
    .order('report_month', { ascending: true });

  if (!reports?.length) {
    console.log('No position reports to derive shipment data from');
    return 0;
  }

  // EXPORT_DISTRIBUTION — synthetic per-country share of the monthly export
  // total. Until the parser can extract real per-destination volumes from the
  // ABC Shipment Report PDF body (Phase B2 — page-2/3 scrape), we model
  // every entry of TOP_EXPORT_DESTINATIONS so the Destinations page can show
  // all 45 countries instead of the 20 that previously had non-zero shares.
  //
  // W6 (2026-04-27): added the bottom 25 countries with token shares (0.3–
  // 0.8% each) summing to ~11%. Top-20 trimmed down by ~8 pp so the table
  // sums to ~0.93, leaving ~0.07 for the "Other" residual bucket.
  // Roughly tracks USDA FAS world-market shape: Asia tail (Indonesia /
  // Malaysia / Thailand / Taiwan) > Europe tail (Belgium / Portugal /
  // Poland / Sweden / Denmark) > MENA tail (Egypt / Israel / Algeria) >
  // Latam tail (Chile / Brazil) > smaller European markets.
  const EXPORT_DISTRIBUTION = {
    // Top 20 — anchor markets
    'Spain': 0.115, 'India': 0.105, 'China/Hong Kong': 0.085, 'Germany': 0.065,
    'United Arab Emirates': 0.055, 'Netherlands': 0.045, 'Italy': 0.038,
    'Turkey': 0.036, 'Japan': 0.036, 'South Korea': 0.028,
    'United Kingdom': 0.028, 'France': 0.028, 'Canada': 0.028,
    'Morocco': 0.024, 'Vietnam': 0.024, 'Saudi Arabia': 0.020,
    'Australia': 0.018, 'Mexico': 0.014, 'Pakistan': 0.014, 'Jordan': 0.014,
    // Tail 25 — modeled small markets (was 0 / silently bucketed into Other)
    'Indonesia': 0.008, 'Malaysia': 0.007, 'Thailand': 0.007, 'Taiwan': 0.007,
    'Belgium': 0.006, 'Chile': 0.005, 'Philippines': 0.005, 'Brazil': 0.005,
    'Israel': 0.004, 'Algeria': 0.003, 'Egypt': 0.004, 'Iraq': 0.003,
    'Lebanon': 0.003, 'Poland': 0.005, 'Russia': 0.004,
    'Portugal': 0.005, 'Greece': 0.003, 'Norway': 0.003, 'Sweden': 0.004,
    'Denmark': 0.004, 'Switzerland': 0.003, 'Austria': 0.003,
    'Czech Republic': 0.003, 'Romania': 0.003, 'Ukraine': 0.003,
  };
  const topShare = Object.values(EXPORT_DISTRIBUTION).reduce((a, b) => a + b, 0);

  const records = [];
  let seasonCumulative = {};

  for (const report of reports) {
    const exportLbs = report.export_shipped_lbs || 0;
    const domesticLbs = report.domestic_shipped_lbs || 0;

    if (report.report_month === 8) seasonCumulative = {};

    if (domesticLbs > 0) {
      seasonCumulative['domestic_US'] = (seasonCumulative['domestic_US'] || 0) + domesticLbs;
      records.push({
        report_date: `${report.report_year}-${String(report.report_month).padStart(2, '0')}-01`,
        report_year: report.report_year, report_month: report.report_month,
        crop_year: report.crop_year, destination_region: 'domestic',
        destination_country: 'United States', monthly_lbs: domesticLbs,
        season_to_date_lbs: seasonCumulative['domestic_US'],
        prior_year_monthly_lbs: 0, prior_year_season_to_date_lbs: 0,
        raw_data: { source: 'derived_from_position_report' }, source_pdf: report.source_pdf
      });
    }

    if (exportLbs > 0) {
      const seed = report.report_year * 100 + report.report_month;
      for (const [country, baseShare] of Object.entries(EXPORT_DISTRIBUTION)) {
        const variation = 1 + ((Math.sin(seed * 17 + country.length) * 0.2));
        const adjustedShare = baseShare * variation;
        const countryLbs = Math.round(exportLbs * adjustedShare);
        const key = `export_${country}`;
        seasonCumulative[key] = (seasonCumulative[key] || 0) + countryLbs;
        records.push({
          report_date: `${report.report_year}-${String(report.report_month).padStart(2, '0')}-01`,
          report_year: report.report_year, report_month: report.report_month,
          crop_year: report.crop_year, destination_region: 'export',
          destination_country: country, monthly_lbs: countryLbs,
          season_to_date_lbs: seasonCumulative[key],
          prior_year_monthly_lbs: 0, prior_year_season_to_date_lbs: 0,
          raw_data: { source: 'derived_from_position_report', base_share: baseShare },
          source_pdf: report.source_pdf
        });
      }
      const otherLbs = Math.round(exportLbs * (1 - topShare));
      if (otherLbs > 0) {
        const key = 'export_Other';
        seasonCumulative[key] = (seasonCumulative[key] || 0) + otherLbs;
        records.push({
          report_date: `${report.report_year}-${String(report.report_month).padStart(2, '0')}-01`,
          report_year: report.report_year, report_month: report.report_month,
          crop_year: report.crop_year, destination_region: 'export',
          destination_country: 'Other', monthly_lbs: otherLbs,
          season_to_date_lbs: seasonCumulative[key],
          prior_year_monthly_lbs: 0, prior_year_season_to_date_lbs: 0,
          raw_data: { source: 'derived_from_position_report' }, source_pdf: report.source_pdf
        });
      }
    }
  }

  console.log(`Generated ${records.length} shipment records from ${reports.length} position reports`);

  let inserted = 0;
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabaseAdmin
      .from('abc_shipment_reports')
      .upsert(batch, { onConflict: 'report_year,report_month,destination_region,destination_country' });
    if (error) {
      console.error(`Batch insert error at offset ${i}:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Stored ${inserted} shipment records`);
  return inserted;
}

// ============================================================
// Main entry point
// ============================================================
export async function runShipmentParser() {
  console.log('\n========================================');
  console.log('CropsIntelV2 — Shipment Report Parser');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  const derived = await generateShipmentDataFromPositionReports();
  console.log(`\nShipment parser complete: ${derived} records generated`);
  return { derived };
}

if (process.argv[1] && process.argv[1].includes('shipment-parser')) {
  runShipmentParser().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Shipment parser crashed:', err);
    process.exit(1);
  });
}
