// CropsIntelV2 — Autonomous Data Processor
// Calculates YoY changes, trends, anomalies after new data arrives
// Run: node src/processors/data-processor.js

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

// ============================================================
// Calculate Year-over-Year changes for position reports
// ============================================================
async function calculateYoY() {
  console.log('Calculating YoY changes...');

  const { data: reports, error } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(48); // Last 4 years

  if (error || !reports?.length) {
    console.log('No position reports to process');
    return [];
  }

  const yoyResults = [];

  for (const report of reports) {
    // Find same month in prior year
    const priorYear = reports.find(r =>
      r.report_year === report.report_year - 1 &&
      r.report_month === report.report_month
    );

    if (!priorYear) continue;

    const calcChange = (current, prior) => {
      if (!prior || prior === 0) return null;
      return ((current - prior) / prior * 100).toFixed(1);
    };

    yoyResults.push({
      year: report.report_year,
      month: report.report_month,
      shipments_yoy: calcChange(report.total_shipped_lbs, priorYear.total_shipped_lbs),
      commitments_yoy: calcChange(report.total_committed_lbs, priorYear.total_committed_lbs),
      receipts_yoy: calcChange(report.receipts_lbs, priorYear.receipts_lbs),
      supply_yoy: calcChange(report.total_supply_lbs, priorYear.total_supply_lbs),
      uncommitted_yoy: calcChange(report.uncommitted_lbs, priorYear.uncommitted_lbs)
    });
  }

  console.log(`Calculated ${yoyResults.length} YoY comparisons`);
  return yoyResults;
}

// ============================================================
// Detect anomalies in the data
// ============================================================
async function detectAnomalies() {
  console.log('Running anomaly detection...');

  const { data: reports } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(24);

  if (!reports || reports.length < 6) {
    console.log('Not enough data for anomaly detection (need 6+ months)');
    return [];
  }

  const anomalies = [];

  // Calculate rolling averages and detect outliers
  const metrics = ['total_shipped_lbs', 'total_committed_lbs', 'receipts_lbs', 'uncommitted_lbs'];

  for (const metric of metrics) {
    const values = reports.map(r => r[metric] || 0).filter(v => v > 0);
    if (values.length < 3) continue;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);

    const latest = values[0];
    const zScore = stdDev > 0 ? (latest - avg) / stdDev : 0;

    if (Math.abs(zScore) > 1.5) {
      anomalies.push({
        metric,
        latest_value: latest,
        average: Math.round(avg),
        z_score: zScore.toFixed(2),
        direction: zScore > 0 ? 'above_normal' : 'below_normal',
        severity: Math.abs(zScore) > 2 ? 'high' : 'medium',
        report_date: `${reports[0].report_year}-${reports[0].report_month}`
      });
    }
  }

  if (anomalies.length > 0) {
    console.log(`Detected ${anomalies.length} anomalies`);

    // Store anomaly alerts
    for (const anomaly of anomalies) {
      await supabaseAdmin.from('ai_analyses').insert({
        analysis_type: 'anomaly',
        title: `${anomaly.severity.toUpperCase()}: ${anomaly.metric.replace(/_/g, ' ')} is ${anomaly.direction.replace('_', ' ')}`,
        summary: `The latest ${anomaly.metric.replace(/_/g, ' ')} value (${anomaly.latest_value.toLocaleString()} lbs) is ${anomaly.z_score} standard deviations ${anomaly.direction === 'above_normal' ? 'above' : 'below'} the rolling average (${anomaly.average.toLocaleString()} lbs).`,
        data_context: anomaly,
        confidence: Math.min(0.95, 0.5 + Math.abs(parseFloat(anomaly.z_score)) * 0.15),
        is_actionable: anomaly.severity === 'high',
        tags: ['anomaly', anomaly.severity, anomaly.metric]
      });
    }
  }

  return anomalies;
}

// ============================================================
// Generate monthly trade signal
// ============================================================
async function generateTradeSignal() {
  console.log('Generating trade signal...');

  const { data: latest } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(2);

  if (!latest || latest.length < 2) {
    console.log('Need at least 2 months of data for trade signal');
    return null;
  }

  const current = latest[0];
  const previous = latest[1];

  // Simple signal logic based on uncommitted inventory and shipment trends
  const shipmentTrend = current.total_shipped_lbs > previous.total_shipped_lbs ? 'rising' : 'falling';
  const inventoryLevel = current.uncommitted_lbs > previous.uncommitted_lbs ? 'building' : 'tightening';
  const commitmentMomentum = current.total_new_commitments_lbs > previous.total_new_commitments_lbs ? 'accelerating' : 'decelerating';

  let signal = 'neutral';
  let confidence = 0.5;

  if (inventoryLevel === 'tightening' && shipmentTrend === 'rising') {
    signal = 'bullish';
    confidence = 0.7;
  } else if (inventoryLevel === 'building' && shipmentTrend === 'falling') {
    signal = 'bearish';
    confidence = 0.7;
  }

  if (commitmentMomentum === 'accelerating') {
    confidence += 0.1;
    if (signal === 'neutral') signal = 'bullish';
  }

  const analysis = {
    analysis_type: 'trade_signal',
    title: `${signal.toUpperCase()} Signal — ${current.report_year}/${current.report_month}`,
    summary: `Shipments are ${shipmentTrend}, uncommitted inventory is ${inventoryLevel}, and new commitments are ${commitmentMomentum}. Overall signal: ${signal.toUpperCase()}.`,
    data_context: {
      current_month: `${current.report_year}-${current.report_month}`,
      shipment_trend: shipmentTrend,
      inventory_level: inventoryLevel,
      commitment_momentum: commitmentMomentum,
      signal
    },
    confidence,
    is_actionable: signal !== 'neutral',
    tags: ['trade_signal', signal]
  };

  await supabaseAdmin.from('ai_analyses').insert(analysis);
  console.log(`Trade signal: ${signal.toUpperCase()} (confidence: ${(confidence * 100).toFixed(0)}%)`);

  return analysis;
}

// ============================================================
// Main processing pipeline
// ============================================================
export async function processData() {
  console.log('\n========================================');
  console.log('CropsIntelV2 — Data Processor');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  const results = {
    yoy: await calculateYoY(),
    anomalies: await detectAnomalies(),
    tradeSignal: await generateTradeSignal()
  };

  console.log('\nProcessing complete:', {
    yoyComparisons: results.yoy.length,
    anomaliesDetected: results.anomalies.length,
    tradeSignal: results.tradeSignal?.data_context?.signal || 'none'
  });

  return results;
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('data-processor')) {
  processData().then(() => process.exit(0)).catch(err => {
    console.error('Processor crashed:', err);
    process.exit(1);
  });
}
