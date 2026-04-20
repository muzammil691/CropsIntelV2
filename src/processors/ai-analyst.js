// CropsIntelV2 — AI Analyst
// Generates intelligent market briefs using Claude API
// Falls back to template-based analysis when API unavailable
// Run: node src/processors/ai-analyst.js

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// ============================================================
// Call Claude API
// ============================================================
async function callClaude(systemPrompt, userPrompt) {
  if (!ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping Claude API call');
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Claude API error (${response.status}):`, errText.substring(0, 200));
      return null;
    }

    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch (error) {
    console.error('Claude API call failed:', error.message);
    return null;
  }
}

// ============================================================
// Generate Monthly Market Brief
// ============================================================
async function generateMonthlyBrief() {
  console.log('Generating monthly market brief...');

  // Fetch latest 3 months of position data
  const { data: reports } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(3);

  if (!reports?.length) {
    console.log('No position reports available for brief');
    return null;
  }

  const latest = reports[0];
  const previous = reports[1];
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Build data summary for Claude
  const dataSummary = `
Almond Board of California — Position Report Summary
Report Period: ${monthNames[latest.report_month]} ${latest.report_year}
Crop Year: ${latest.crop_year}

CURRENT MONTH (${monthNames[latest.report_month]} ${latest.report_year}):
- Total Supply: ${(latest.total_supply_lbs || 0).toLocaleString()} lbs
- Carry-in: ${(latest.carry_in_lbs || 0).toLocaleString()} lbs
- Crop Receipts: ${(latest.receipts_lbs || 0).toLocaleString()} lbs
- Domestic Shipments: ${(latest.domestic_shipped_lbs || 0).toLocaleString()} lbs
- Export Shipments: ${(latest.export_shipped_lbs || 0).toLocaleString()} lbs
- Total Shipments: ${(latest.total_shipped_lbs || 0).toLocaleString()} lbs
- Domestic Committed: ${(latest.domestic_committed_lbs || 0).toLocaleString()} lbs
- Export Committed: ${(latest.export_committed_lbs || 0).toLocaleString()} lbs
- Total Committed: ${(latest.total_committed_lbs || 0).toLocaleString()} lbs
- New Commitments: ${(latest.total_new_commitments_lbs || 0).toLocaleString()} lbs
- Uncommitted Inventory: ${(latest.uncommitted_lbs || 0).toLocaleString()} lbs
${previous ? `
PRIOR MONTH (${monthNames[previous.report_month]} ${previous.report_year}):
- Total Supply: ${(previous.total_supply_lbs || 0).toLocaleString()} lbs
- Total Shipments: ${(previous.total_shipped_lbs || 0).toLocaleString()} lbs
- Total Committed: ${(previous.total_committed_lbs || 0).toLocaleString()} lbs
- Uncommitted Inventory: ${(previous.uncommitted_lbs || 0).toLocaleString()} lbs
- New Commitments: ${(previous.total_new_commitments_lbs || 0).toLocaleString()} lbs` : ''}`;

  const systemPrompt = `You are the chief market analyst for MAXONS, a global almond trading company based in Dubai. You write concise, data-driven market intelligence briefs for professional commodity traders. Your analysis must be grounded in the ABC position report data provided. Focus on supply/demand dynamics, shipment trends, commitment levels, and uncommitted inventory. Keep your language professional but accessible. Use specific numbers. End with a clear market outlook and signal (bullish/bearish/neutral).`;

  const userPrompt = `Based on the following ABC Position Report data, write a monthly market intelligence brief for MAXONS traders. Include: 1) Key headline finding, 2) Supply situation, 3) Shipment trends, 4) Commitment analysis, 5) Market outlook and trading signal.\n\n${dataSummary}`;

  // Try Claude API first
  let briefText = await callClaude(systemPrompt, userPrompt);

  // Fallback to template if API unavailable
  if (!briefText) {
    console.log('Using template-based brief (no API key or API error)');
    briefText = generateTemplateBrief(latest, previous, monthNames);
  }

  // Store the brief
  const brief = {
    analysis_type: 'monthly_brief',
    title: `Monthly Market Brief — ${monthNames[latest.report_month]} ${latest.report_year}`,
    summary: briefText,
    data_context: {
      report_month: latest.report_month,
      report_year: latest.report_year,
      crop_year: latest.crop_year,
      total_supply: latest.total_supply_lbs,
      total_shipped: latest.total_shipped_lbs,
      total_committed: latest.total_committed_lbs,
      uncommitted: latest.uncommitted_lbs,
      source: ANTHROPIC_API_KEY ? 'claude_api' : 'template'
    },
    confidence: ANTHROPIC_API_KEY ? 0.85 : 0.6,
    is_actionable: true,
    tags: ['monthly_brief', latest.crop_year, monthNames[latest.report_month].toLowerCase()]
  };

  const { error } = await supabaseAdmin.from('ai_analyses').upsert(brief, {
    onConflict: 'analysis_type,title'
  });

  if (error) {
    // Fallback: just insert (upsert might fail if no unique constraint)
    await supabaseAdmin.from('ai_analyses').insert(brief);
  }

  console.log(`Monthly brief generated (source: ${ANTHROPIC_API_KEY ? 'Claude API' : 'template'})`);
  return brief;
}

// ============================================================
// Template-based brief (fallback when no API key)
// ============================================================
function generateTemplateBrief(latest, previous, monthNames) {
  const fmtNum = (n) => (n || 0).toLocaleString();
  const pctChange = (curr, prev) => {
    if (!prev || prev === 0) return 'N/A';
    const change = ((curr - prev) / prev * 100).toFixed(1);
    return `${change > 0 ? '+' : ''}${change}%`;
  };

  const shipmentChange = previous ? pctChange(latest.total_shipped_lbs, previous.total_shipped_lbs) : 'N/A';
  const commitmentChange = previous ? pctChange(latest.total_committed_lbs, previous.total_committed_lbs) : 'N/A';
  const uncommittedChange = previous ? pctChange(latest.uncommitted_lbs, previous.uncommitted_lbs) : 'N/A';

  // Determine signal
  let signal = 'NEUTRAL';
  if (latest.uncommitted_lbs < (previous?.uncommitted_lbs || latest.uncommitted_lbs) &&
      latest.total_shipped_lbs > (previous?.total_shipped_lbs || 0)) {
    signal = 'BULLISH';
  } else if (latest.uncommitted_lbs > (previous?.uncommitted_lbs || 0) &&
             latest.total_shipped_lbs < (previous?.total_shipped_lbs || latest.total_shipped_lbs)) {
    signal = 'BEARISH';
  }

  return `MAXONS Market Intelligence Brief — ${monthNames[latest.report_month]} ${latest.report_year}
Crop Year: ${latest.crop_year}

HEADLINE: Total shipments reached ${fmtNum(latest.total_shipped_lbs)} lbs (${shipmentChange} MoM) with uncommitted inventory at ${fmtNum(latest.uncommitted_lbs)} lbs (${uncommittedChange} MoM).

SUPPLY: Total marketable supply stands at ${fmtNum(latest.total_supply_lbs)} lbs, comprising ${fmtNum(latest.carry_in_lbs)} lbs carry-in and ${fmtNum(latest.receipts_lbs)} lbs crop receipts to date.

SHIPMENTS: Total shipments of ${fmtNum(latest.total_shipped_lbs)} lbs break down to ${fmtNum(latest.domestic_shipped_lbs)} lbs domestic and ${fmtNum(latest.export_shipped_lbs)} lbs export. ${shipmentChange !== 'N/A' ? `Month-over-month change: ${shipmentChange}.` : ''}

COMMITMENTS: Total outstanding commitments at ${fmtNum(latest.total_committed_lbs)} lbs (${commitmentChange} MoM). New commitments this period: ${fmtNum(latest.total_new_commitments_lbs)} lbs.

OUTLOOK: Uncommitted inventory at ${fmtNum(latest.uncommitted_lbs)} lbs represents available supply for spot and forward sales. Signal: ${signal}.`;
}

// ============================================================
// Generate YoY Insight
// ============================================================
async function generateYoYInsight() {
  console.log('Generating YoY insight...');

  const { data: reports } = await supabaseAdmin
    .from('abc_position_reports')
    .select('*')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(24);

  if (!reports || reports.length < 13) {
    console.log('Need at least 13 months of data for YoY insight');
    return null;
  }

  const current = reports[0];
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Find same month last year
  const lastYear = reports.find(r =>
    r.report_year === current.report_year - 1 &&
    r.report_month === current.report_month
  );

  if (!lastYear) {
    console.log('No matching prior year data');
    return null;
  }

  const calcYoY = (curr, prev) => {
    if (!prev || prev === 0) return { change: 0, pct: '0.0' };
    const pct = ((curr - prev) / prev * 100).toFixed(1);
    return { change: curr - prev, pct };
  };

  const metrics = {
    shipments: calcYoY(current.total_shipped_lbs, lastYear.total_shipped_lbs),
    commitments: calcYoY(current.total_committed_lbs, lastYear.total_committed_lbs),
    receipts: calcYoY(current.receipts_lbs, lastYear.receipts_lbs),
    supply: calcYoY(current.total_supply_lbs, lastYear.total_supply_lbs),
    uncommitted: calcYoY(current.uncommitted_lbs, lastYear.uncommitted_lbs)
  };

  const insightText = `Year-over-Year Analysis: ${monthNames[current.report_month]} ${current.report_year} vs ${current.report_year - 1}

Shipments: ${metrics.shipments.pct > 0 ? '+' : ''}${metrics.shipments.pct}% YoY
Commitments: ${metrics.commitments.pct > 0 ? '+' : ''}${metrics.commitments.pct}% YoY
Receipts: ${metrics.receipts.pct > 0 ? '+' : ''}${metrics.receipts.pct}% YoY
Supply: ${metrics.supply.pct > 0 ? '+' : ''}${metrics.supply.pct}% YoY
Uncommitted: ${metrics.uncommitted.pct > 0 ? '+' : ''}${metrics.uncommitted.pct}% YoY`;

  const insight = {
    analysis_type: 'yoy_insight',
    title: `YoY Analysis — ${monthNames[current.report_month]} ${current.report_year}`,
    summary: insightText,
    data_context: {
      current_period: `${current.report_year}-${current.report_month}`,
      prior_period: `${lastYear.report_year}-${lastYear.report_month}`,
      metrics
    },
    confidence: 0.9,
    is_actionable: Math.abs(parseFloat(metrics.shipments.pct)) > 10,
    tags: ['yoy', `${current.report_year}`, monthNames[current.report_month].toLowerCase()]
  };

  await supabaseAdmin.from('ai_analyses').insert(insight);
  console.log('YoY insight generated');
  return insight;
}

// ============================================================
// Main entry point
// ============================================================
export async function runAIAnalysis() {
  console.log('\n========================================');
  console.log('CropsIntelV2 — AI Analyst');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Claude API: ${ANTHROPIC_API_KEY ? 'configured' : 'NOT SET (template fallback)'}`);
  console.log('========================================\n');

  const results = {
    monthlyBrief: null,
    yoyInsight: null
  };

  try {
    results.monthlyBrief = await generateMonthlyBrief();
  } catch (err) {
    console.error('Monthly brief generation failed:', err.message);
  }

  try {
    results.yoyInsight = await generateYoYInsight();
  } catch (err) {
    console.error('YoY insight generation failed:', err.message);
  }

  console.log('\nAI Analysis complete:', {
    monthlyBrief: results.monthlyBrief ? 'generated' : 'skipped',
    yoyInsight: results.yoyInsight ? 'generated' : 'skipped'
  });

  return results;
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('ai-analyst')) {
  runAIAnalysis().then(result => {
    console.log('\nResult:', JSON.stringify(result, null, 2).substring(0, 500));
    process.exit(0);
  }).catch(err => {
    console.error('AI Analyst crashed:', err);
    process.exit(1);
  });
}
