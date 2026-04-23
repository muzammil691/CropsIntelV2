// CropsIntelV2 — Autonomous Runner v3.0.0
// The brain that orchestrates all autonomous operations:
//   1. Scrape ABC data on schedule
//   2. Generate shipment data (by destination)
//   3. Generate receipt data (by variety)
//   4. Process data (YoY, trends, anomalies, trade signals)
//   5. Generate AI insights (Claude API + template fallback)
//   6. Self-monitor and log everything
//
// Run: node src/autonomous/runner.js
// Run now: node src/autonomous/runner.js --now

import { config } from 'dotenv';
config();

import cron from 'node-cron';
import supabaseAdmin from '../lib/supabase-admin.js';
import { scrapeABC, scrapeAllReportTypes } from '../scrapers/abc-scraper.js';
import { scrapeStrata } from '../scrapers/strata-scraper.js';
import { runShipmentParser } from '../scrapers/shipment-parser.js';
import { runReceiptsParser } from '../scrapers/receipts-parser.js';
import { processData } from '../processors/data-processor.js';
import { runAIAnalysis } from '../processors/ai-analyst.js';
import { scrapeBountiful } from '../scrapers/bountiful-scraper.js';
import { scrapeNews } from '../scrapers/news-scraper.js';
import { pollInbox } from './imap-reader.js';
import { runEmailIngestion } from './email-ingestor.js';

// Dynamic (lazy) imports for optional outbound pipelines so that auto-scrape
// CI — which runs `npm ci` against a pinned lock — doesn't break when new
// deps (nodemailer, googleapis) haven't been added to the lockfile yet.
// The user installs these locally (`npm install nodemailer googleapis`) to
// enable the 5-min email flusher + daily Google Drive backup.
async function lazyImport(modulePath, missingDepsMsg) {
  try {
    return await import(modulePath);
  } catch (err) {
    console.warn(`[runner] skipped ${modulePath}: ${missingDepsMsg}`);
    console.warn(`[runner] underlying error: ${err?.message || err}`);
    return null;
  }
}

const RUNNER_VERSION = '5.2.0';

// ============================================================
// Health check — log that the runner is alive
// ============================================================
async function healthCheck() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Runner heartbeat v${RUNNER_VERSION}`);

  await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: 'runner-heartbeat',
    status: 'success',
    metadata: {
      version: RUNNER_VERSION,
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    completed_at: timestamp
  });
}

// ============================================================
// Full autonomous cycle: scrape -> shipments -> receipts -> process -> analyze
// ============================================================
async function runAutonomousCycle() {
  const startTime = Date.now();
  console.log('\n================================================');
  console.log('AUTONOMOUS CYCLE STARTED');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('================================================\n');

  // Log pipeline run
  const { data: run } = await supabaseAdmin
    .from('pipeline_runs')
    .insert({ run_type: 'autonomous_cycle', status: 'running', trigger_source: 'scheduled', steps_completed: [] })
    .select().single();
  const runId = run?.id;
  const steps = [];

  try {
    // Step 0: Email Ingestion — poll IMAP inbox and process new emails
    console.log('--- STEP 0: Email Ingestion (IMAP Poll) ---');
    try {
      const imapResult = await pollInbox();
      steps.push({ step: 'imap_poll', found: imapResult.found, inserted: imapResult.inserted, errors: imapResult.errors });
      console.log(`  IMAP: ${imapResult.inserted} new emails ingested`);
    } catch (imapErr) {
      console.warn('IMAP poll failed (non-fatal):', imapErr.message);
      steps.push({ step: 'imap_poll', error: imapErr.message });
    }

    // Step 0B: Process unprocessed emails (classify, extract, route)
    console.log('\n--- STEP 0B: Email Processing ---');
    try {
      const emailResult = await runEmailIngestion();
      steps.push({ step: 'email_process', found: emailResult.found, processed: emailResult.processed });
    } catch (emailErr) {
      console.warn('Email processing failed (non-fatal):', emailErr.message);
      steps.push({ step: 'email_process', error: emailErr.message });
    }

    // Step 1: Scrape ALL ABC report types (position, forecasts, acreage, almanac)
    console.log('--- STEP 1: Scraping ALL ABC Report Types ---');
    const scrapeResult = await scrapeAllReportTypes();
    const totalInserted = Object.values(scrapeResult).reduce((s, r) => s + r.inserted, 0);
    const totalFound = Object.values(scrapeResult).reduce((s, r) => s + r.found, 0);
    steps.push({ step: 'scrape_all', found: totalFound, inserted: totalInserted, breakdown: scrapeResult });

    // Step 1B: Scrape Strata Markets pricing
    console.log('\n--- STEP 1B: Scraping Strata Pricing ---');
    try {
      const strataResult = await scrapeStrata();
      steps.push({ step: 'strata', found: strataResult.found, inserted: strataResult.inserted });
    } catch (strataErr) {
      console.warn('Strata scrape failed (non-fatal):', strataErr.message);
      steps.push({ step: 'strata', error: strataErr.message });
    }

    // Step 1C: Scrape Bountiful.ag crop estimates
    console.log('\n--- STEP 1C: Bountiful.ag Crop Estimates ---');
    try {
      const bountifulResult = await scrapeBountiful();
      steps.push({ step: 'bountiful', found: bountifulResult.found, inserted: bountifulResult.inserted });
    } catch (bountifulErr) {
      console.warn('Bountiful scrape failed (non-fatal):', bountifulErr.message);
      steps.push({ step: 'bountiful', error: bountifulErr.message });
    }

    // Step 1D: Scrape industry news
    console.log('\n--- STEP 1D: Industry News ---');
    try {
      const newsResult = await scrapeNews();
      steps.push({ step: 'news', found: newsResult.found, inserted: newsResult.inserted });
    } catch (newsErr) {
      console.warn('News scrape failed (non-fatal):', newsErr.message);
      steps.push({ step: 'news', error: newsErr.message });
    }

    // Step 2: Generate shipment data (from PDFs or position reports)
    console.log('\n--- STEP 2: Shipment Data ---');
    const shipmentResult = await runShipmentParser();
    steps.push({ step: 'shipments', derived: shipmentResult.derived });

    // Step 3: Generate receipt data (from PDFs or position reports)
    console.log('\n--- STEP 3: Receipt Data ---');
    const receiptResult = await runReceiptsParser();
    steps.push({ step: 'receipts', derived: receiptResult.derived });

    // Step 4: Process data (YoY, anomalies, signals)
    console.log('\n--- STEP 4: Processing Data ---');
    const processResult = await processData();
    steps.push({ step: 'process', anomalies: processResult.anomalies?.length || 0, signal: processResult.tradeSignal?.data_context?.signal || 'none' });

    // Step 5: Run AI analysis (Claude API + template fallback)
    console.log('\n--- STEP 5: AI Analysis ---');
    const aiResult = await runAIAnalysis();
    steps.push({ step: 'ai_analysis', monthly_brief: aiResult.monthlyBrief ? 'generated' : 'skipped', yoy_insight: aiResult.yoyInsight ? 'generated' : 'skipped' });

    // Step 6: Archive ABC PDFs to Google Drive (non-fatal — skip if deps or creds missing)
    console.log('\n--- STEP 6: Google Drive Archive ---');
    try {
      const gd = await lazyImport('./gdrive-uploader.js', 'npm install googleapis to enable Drive archival');
      if (gd?.archiveABCReports) {
        const archiveResult = await gd.archiveABCReports();
        steps.push({ step: 'gdrive_archive', found: archiveResult.found, uploaded: archiveResult.uploaded, skipped: archiveResult.skipped });
      } else {
        steps.push({ step: 'gdrive_archive', skipped: 'googleapis dep not installed' });
      }
    } catch (gdErr) {
      console.warn('Google Drive archive failed (non-fatal — check GOOGLE_SERVICE_ACCOUNT_KEY_* env):', gdErr.message);
      steps.push({ step: 'gdrive_archive', error: gdErr.message });
    }

    const duration = Date.now() - startTime;
    console.log(`\nAUTONOMOUS CYCLE COMPLETE (${duration}ms)`);

    // Update pipeline run
    if (runId) {
      await supabaseAdmin.from('pipeline_runs').update({
        status: 'completed', completed_at: new Date().toISOString(), steps_completed: steps,
        summary: `Cycle complete in ${duration}ms: ${totalInserted} new reports, ${shipmentResult.derived} shipments, ${receiptResult.derived} receipts`
      }).eq('id', runId);
    }

    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: 'autonomous-cycle',
      status: 'success',
      records_found: totalFound,
      records_inserted: totalInserted,
      duration_ms: duration,
      metadata: {
        version: RUNNER_VERSION,
        shipments_derived: shipmentResult.derived || 0,
        receipts_derived: receiptResult.derived || 0,
        anomalies: processResult.anomalies?.length || 0,
        trade_signal: processResult.tradeSignal?.data_context?.signal || 'none',
        ai_monthly_brief: aiResult.monthlyBrief ? 'generated' : 'skipped',
        ai_yoy_insight: aiResult.yoyInsight ? 'generated' : 'skipped'
      },
      completed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AUTONOMOUS CYCLE FAILED:', error.message);
    if (runId) {
      await supabaseAdmin.from('pipeline_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), steps_completed: steps,
        errors: [{ message: error.message }]
      }).eq('id', runId);
    }
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: 'autonomous-cycle',
      status: 'failed',
      error_message: error.message,
      duration_ms: Date.now() - startTime,
      completed_at: new Date().toISOString()
    });
  }
}

// ============================================================
// Start the autonomous runner
// ============================================================
function startRunner() {
  console.log('================================================');
  console.log('  CropsIntelV2 — AUTONOMOUS RUNNER');
  console.log(`  Version: ${RUNNER_VERSION}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('================================================\n');

  healthCheck();

  // Every 15 minutes: Poll email inbox
  cron.schedule('*/15 * * * *', async () => {
    console.log('Scheduled trigger: Email inbox poll');
    try {
      const imapResult = await pollInbox();
      if (imapResult.inserted > 0) {
        console.log(`Email poll: ${imapResult.inserted} new emails — running ingestion...`);
        await runEmailIngestion();
      }
    } catch (err) {
      console.warn('Scheduled email poll failed:', err.message);
    }
  }, { timezone: 'UTC' });

  // Every 5 minutes: Flush email_queue (outbound) — drains messages the
  // edge function couldn't send live (Deno Deploy ↔ Office 365 SMTP fails).
  // Uses the same Office 365 creds proven working by imap-reader.js.
  // Lazy-loaded: if nodemailer isn't installed, the cron tick logs and skips.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const flusher = await lazyImport('./email-flusher.js', 'npm install nodemailer to enable email queue flushing');
      if (!flusher?.flushOnce) return;
      const result = await flusher.flushOnce();
      if (result.found > 0) {
        console.log(`Email flush: ${result.sent}/${result.found} sent, ${result.failed} failed`);
      }
    } catch (err) {
      console.warn('Scheduled email flush failed:', err.message);
    }
  }, { timezone: 'UTC' });

  // Monthly: Full cycle on 15th at 8 AM UTC (when ABC publishes)
  cron.schedule('0 8 15 * *', () => {
    console.log('Scheduled trigger: Monthly ABC scrape cycle');
    runAutonomousCycle();
  }, { timezone: 'UTC' });

  // Daily: Health check at midnight UTC
  cron.schedule('0 0 * * *', () => {
    healthCheck();
  }, { timezone: 'UTC' });

  // Daily: Google Drive DB backup at 02:00 UTC (after health check, before
  // the busy EU morning). Dumps key tables → Backups_YYYY-MM-DD/ subfolder.
  // Lazy-loaded: if googleapis isn't installed, the cron tick logs and skips.
  cron.schedule('0 2 * * *', async () => {
    console.log('Scheduled trigger: Google Drive DB backup');
    try {
      const gd = await lazyImport('./gdrive-uploader.js', 'npm install googleapis to enable Drive backup');
      if (gd?.backupDatabase) await gd.backupDatabase();
    } catch (err) {
      console.warn('Scheduled DB backup failed:', err.message);
    }
  }, { timezone: 'UTC' });

  // Weekly: Data reprocess on Mondays at 6 AM UTC
  cron.schedule('0 6 * * 1', () => {
    console.log('Scheduled trigger: Weekly data reprocess');
    processData();
  }, { timezone: 'UTC' });

  console.log('Scheduled jobs:');
  console.log('  - Email inbox poll:   Every 15 minutes');
  console.log('  - Email queue flush:  Every 5 minutes');
  console.log('  - Full scrape cycle:  15th of each month, 8 AM UTC');
  console.log('  - Data reprocess:     Every Monday, 6 AM UTC');
  console.log('  - Health check:       Daily at midnight UTC');
  console.log('  - GDrive DB backup:   Daily at 02:00 UTC');
  console.log('\nRunner is live. Waiting for scheduled triggers...');
  console.log('Press Ctrl+C to stop.\n');

  if (process.argv.includes('--now')) {
    console.log('--now flag detected, running immediate cycle...\n');
    runAutonomousCycle();
  }
}

startRunner();
