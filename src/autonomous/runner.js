// CropsIntelV2 — Autonomous Runner
// The brain that orchestrates all autonomous operations:
//   1. Scrape ABC data on schedule
//   2. Process new data (YoY, trends, anomalies)
//   3. Generate AI insights
//   4. Self-monitor and log everything
//
// Run: node src/autonomous/runner.js
// This process stays alive and runs tasks on cron schedules

import { config } from 'dotenv';
config();

import cron from 'node-cron';
import supabaseAdmin from '../lib/supabase-admin.js';
import { scrapeABC } from '../scrapers/abc-scraper.js';
import { processData } from '../processors/data-processor.js';

const RUNNER_VERSION = '1.0.0';

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
// Full autonomous cycle: scrape -> process -> analyze
// ============================================================
async function runAutonomousCycle() {
  const startTime = Date.now();
  console.log('\n================================================');
  console.log('AUTONOMOUS CYCLE STARTED');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('================================================\n');

  try {
    // Step 1: Scrape ABC data
    console.log('--- STEP 1: Scraping ABC Data ---');
    const scrapeResult = await scrapeABC();

    // Step 2: Process data (YoY, anomalies, signals)
    console.log('\n--- STEP 2: Processing Data ---');
    const processResult = await processData();

    // Step 3: Generate monthly brief if we have new data
    if (scrapeResult.inserted > 0) {
      console.log('\n--- STEP 3: Generating Insights ---');
      await generateMonthlyBrief();
    }

    const duration = Date.now() - startTime;
    console.log(`\nAUTONOMOUS CYCLE COMPLETE (${duration}ms)`);

    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: 'autonomous-cycle',
      status: 'success',
      records_found: scrapeResult.found,
      records_inserted: scrapeResult.inserted,
      duration_ms: duration,
      metadata: {
        anomalies: processResult.anomalies.length,
        trade_signal: processResult.tradeSignal?.data_context?.signal || 'none'
      },
      completed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('AUTONOMOUS CYCLE FAILED:', error.message);
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
// Generate a monthly market brief
// ============================================================
async function generateMonthlyBrief() {
  const { data: latest } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1);

  if (!latest?.length) return;

  const report = latest[0];
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

  const brief = {
    analysis_type: 'monthly_brief',
    title: `${monthNames[report.report_month]} ${report.report_year} — Almond Market Brief`,
    summary: [
      `Total shipments: ${(report.total_shipped_lbs || 0).toLocaleString()} lbs`,
      `(Domestic: ${(report.domestic_shipped_lbs || 0).toLocaleString()}, Export: ${(report.export_shipped_lbs || 0).toLocaleString()})`,
      `New commitments: ${(report.total_new_commitments_lbs || 0).toLocaleString()} lbs`,
      `Uncommitted inventory: ${(report.uncommitted_lbs || 0).toLocaleString()} lbs`,
      `Total supply: ${(report.total_supply_lbs || 0).toLocaleString()} lbs`
    ].join('\n'),
    data_context: report,
    confidence: 1.0,
    is_actionable: false,
    tags: ['monthly_brief', `${report.report_year}-${report.report_month}`]
  };

  await supabaseAdmin.from('ai_analyses').insert(brief);
  console.log(`Monthly brief generated for ${monthNames[report.report_month]} ${report.report_year}`);
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

  // Immediate health check
  healthCheck();

  // Schedule: Run full cycle on the 15th of each month at 8 AM UTC
  // (ABC reports are typically published by mid-month)
  cron.schedule('0 8 15 * *', () => {
    console.log('Scheduled trigger: Monthly ABC scrape cycle');
    runAutonomousCycle();
  }, { timezone: 'UTC' });

  // Schedule: Daily health check at midnight UTC
  cron.schedule('0 0 * * *', () => {
    healthCheck();
  }, { timezone: 'UTC' });

  // Schedule: Weekly data reprocess on Mondays at 6 AM UTC
  cron.schedule('0 6 * * 1', () => {
    console.log('Scheduled trigger: Weekly data reprocess');
    processData();
  }, { timezone: 'UTC' });

  console.log('Scheduled jobs:');
  console.log('  - Full scrape cycle: 15th of each month, 8 AM UTC');
  console.log('  - Data reprocess: Every Monday, 6 AM UTC');
  console.log('  - Health check: Daily at midnight UTC');
  console.log('\nRunner is live. Waiting for scheduled triggers...');
  console.log('Press Ctrl+C to stop.\n');

  // Run an initial cycle right now if --now flag is passed
  if (process.argv.includes('--now')) {
    console.log('--now flag detected, running immediate cycle...\n');
    runAutonomousCycle();
  }
}

// Start
startRunner();
