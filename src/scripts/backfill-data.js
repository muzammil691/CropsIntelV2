// CropsIntelV2 — One-time Data Backfill
// Populates shipment + receipt data from existing position reports
// Run: node src/scripts/backfill-data.js

import { config } from 'dotenv';
config();

import { generateShipmentDataFromPositionReports } from '../scrapers/shipment-parser.js';
import { generateReceiptDataFromPositionReports } from '../scrapers/receipts-parser.js';
import supabaseAdmin from '../lib/supabase-admin.js';

async function backfill() {
  const startTime = Date.now();
  console.log('\n================================================');
  console.log('CropsIntelV2 — DATA BACKFILL');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('================================================\n');

  // Backfill is a SUB-STEP of the parent autonomous_cycle pipeline_runs row that
  // the GH Actions workflow opens (auto-scrape.yml: "Open pipeline run") and closes
  // ("Close pipeline run"). Creating a separate run_type='backfill' row here would
  // outrank the parent on Autonomous.jsx's `.order('started_at', desc).limit(1)` query
  // and clobber the per-source table with backfill-only steps. We log progress to
  // scraping_logs so the parent's "Close" step can roll it up.
  const startedIso = new Date().toISOString();
  const stepLog = async (stepName, status, records, errorMsg) => {
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: stepName,
      status,
      started_at: startedIso,
      completed_at: new Date().toISOString(),
      records_inserted: records || 0,
      records_found: records || 0,
      error_message: errorMsg || null,
      duration_ms: Date.now() - startTime,
      metadata: { source: 'backfill-data.js' },
    }).then(({ error }) => { if (error) console.error('scraping_logs insert failed:', error.message); });
  };

  try {
    console.log('--- STEP 1: Backfill Shipment Data ---');
    const shipmentCount = await generateShipmentDataFromPositionReports();
    await stepLog('backfill-shipments', 'success', shipmentCount);

    console.log('\n--- STEP 2: Backfill Receipt Data ---');
    const receiptCount = await generateReceiptDataFromPositionReports();
    await stepLog('backfill-receipts', 'success', receiptCount);

    const duration = Date.now() - startTime;
    console.log(`\nBACKFILL COMPLETE (${duration}ms): ${shipmentCount} shipments, ${receiptCount} receipts`);
  } catch (error) {
    console.error('BACKFILL FAILED:', error.message);
    await stepLog('backfill-data', 'failed', 0, error.message);
    process.exit(1);
  }
}

backfill().then(() => process.exit(0)).catch(err => { console.error('Backfill crashed:', err); process.exit(1); });
