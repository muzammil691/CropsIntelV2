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

  const { data: run } = await supabaseAdmin
    .from('pipeline_runs')
    .insert({ run_type: 'backfill', status: 'running', trigger_source: 'manual', steps_completed: [] })
    .select().single();

  const runId = run?.id;
  const steps = [];

  try {
    console.log('--- STEP 1: Backfill Shipment Data ---');
    const shipmentCount = await generateShipmentDataFromPositionReports();
    steps.push({ step: 'shipment_backfill', records: shipmentCount, status: 'done' });

    console.log('\n--- STEP 2: Backfill Receipt Data ---');
    const receiptCount = await generateReceiptDataFromPositionReports();
    steps.push({ step: 'receipt_backfill', records: receiptCount, status: 'done' });

    const duration = Date.now() - startTime;

    if (runId) {
      await supabaseAdmin.from('pipeline_runs').update({
        status: 'completed', completed_at: new Date().toISOString(), steps_completed: steps,
        summary: `Backfill complete: ${shipmentCount} shipments, ${receiptCount} receipts (${duration}ms)`
      }).eq('id', runId);
    }

    console.log(`\nBACKFILL COMPLETE (${duration}ms): ${shipmentCount} shipments, ${receiptCount} receipts`);
  } catch (error) {
    console.error('BACKFILL FAILED:', error.message);
    if (runId) {
      await supabaseAdmin.from('pipeline_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), steps_completed: steps,
        errors: [{ message: error.message }]
      }).eq('id', runId);
    }
    process.exit(1);
  }
}

backfill().then(() => process.exit(0)).catch(err => { console.error('Backfill crashed:', err); process.exit(1); });
