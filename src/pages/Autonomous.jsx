import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function StatusBadge({ status }) {
  const colors = {
    success: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    started: 'bg-yellow-500/20 text-yellow-400 animate-pulse',
    skipped: 'bg-gray-500/20 text-gray-400',
    running: 'bg-blue-500/20 text-blue-400 animate-pulse',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors[status] || colors.skipped}`}>
      {status}
    </span>
  );
}

export default function Autonomous() {
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({});
  const [reportCount, setReportCount] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState([]);

  const loadData = useCallback(async () => {
    const [logRes, configRes, reportRes, analysisRes] = await Promise.all([
      supabase.from('scraping_logs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('system_config').select('*'),
      supabase.from('abc_position_reports').select('id', { count: 'exact', head: true }),
      supabase.from('ai_analyses').select('id', { count: 'exact', head: true }),
    ]);

    if (logRes.data) setLogs(logRes.data);
    if (configRes.data) {
      const m = {};
      configRes.data.forEach(c => { m[c.key] = c.value; });
      setConfig(m);
    }
    setReportCount(reportRes.count || 0);
    setAnalysisCount(analysisRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const log = (msg) => setRunLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Browser-based autonomous cycle (reads via anon key, writes via supabase client)
  const runCycle = async () => {
    setRunning(true);
    setRunLog([]);
    const startTime = Date.now();

    try {
      log('Starting autonomous cycle...');
      await supabase.from('scraping_logs').insert({ scraper_name: 'browser-autonomous', status: 'started', metadata: { trigger: 'manual' } });

      // Step 1: Try to scrape ABC
      log('Step 1: Checking ABC industry data page...');
      let pdfCount = 0;
      try {
        const pageRes = await fetch('https://www.almonds.org/processors/industry-reports', { headers: { 'Accept': 'text/html' } });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const pdfs = [...html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi)].map(m => m[1]);
          pdfCount = pdfs.filter(u => /position/i.test(u)).length;
          log(`Found ${pdfs.length} PDFs (${pdfCount} position reports)`);
        } else {
          log(`ABC page returned HTTP ${pageRes.status}`);
        }
      } catch (err) {
        log(`ABC fetch skipped (CORS) — scraping runs via GitHub Actions`);
      }

      // Step 2: Process existing data
      log('Step 2: Processing data — calculating YoY, anomalies, trade signals...');

      const { data: allReports } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });

      if (!allReports?.length) { log('No reports found — run scraper first'); return; }
      log(`Loaded ${allReports.length} position reports`);

      // Clear old analyses
      await supabase.from('ai_analyses').delete().gt('id', 0);
      log('Cleared old analyses');

      const M = 1e6;
      const pct = (c, p) => p > 0 ? ((c - p) / p * 100).toFixed(1) : null;
      const analyses = [];

      // YoY comparisons
      for (const cur of allReports) {
        const prior = allReports.find(r => r.report_month === cur.report_month && r.report_year === cur.report_year - 1);
        if (!prior) continue;
        analyses.push({
          analysis_type: 'yoy_comparison',
          title: `YoY ${cur.report_year}/${String(cur.report_month).padStart(2, '0')} vs ${prior.report_year}`,
          summary: `Shipments ${pct(cur.total_shipped_lbs, prior.total_shipped_lbs)}% | Committed ${pct(cur.total_committed_lbs, prior.total_committed_lbs)}% | Supply ${pct(cur.total_supply_lbs, prior.total_supply_lbs)}%`,
          confidence: 0.95,
          data_context: { report_year: cur.report_year, report_month: cur.report_month, crop_year: cur.crop_year },
          tags: ['yoy'], is_actionable: false
        });
      }
      log(`Generated ${analyses.length} YoY comparisons`);

      // Trade signal from latest data
      const latest = allReports[allReports.length - 1];
      const prev = allReports[allReports.length - 2];
      if (latest && prev) {
        const shipUp = latest.total_shipped_lbs > prev.total_shipped_lbs;
        const commitDown = latest.total_committed_lbs < prev.total_committed_lbs;
        const newCommitUp = latest.total_new_commitments_lbs > prev.total_new_commitments_lbs;
        let signal = 'neutral', reason = '', conf = 0.55;
        if (shipUp && !commitDown) { signal = 'bullish'; reason = 'Shipments and commitments both trending up. Strong demand.'; conf = 0.72; }
        else if (!shipUp && commitDown) { signal = 'bearish'; reason = 'Shipments down and commitments declining. Weakening demand.'; conf = 0.70; }
        else if (shipUp && commitDown) { signal = 'bearish'; reason = 'Shipments up but commitments declining — may be peaking.'; conf = 0.65; }
        else { reason = 'Mixed signals across key metrics.'; }
        if (newCommitUp) conf = Math.min(0.95, conf + 0.08);
        analyses.push({ analysis_type: 'trade_signal', title: `Trade Signal: ${signal.toUpperCase()} — ${latest.crop_year}`, summary: reason, confidence: conf, data_context: { signal, report_year: latest.report_year, report_month: latest.report_month }, tags: ['signal', 'actionable'], is_actionable: true });
        log(`Trade signal: ${signal.toUpperCase()}`);
      }

      // Monthly brief
      if (latest) {
        const fm = v => (v / M).toFixed(0) + 'M';
        const soldPct = ((latest.total_supply_lbs - (latest.uncommitted_lbs || 0)) / latest.total_supply_lbs * 100).toFixed(1);
        analyses.push({ analysis_type: 'monthly_brief', title: `Monthly Brief: ${latest.crop_year} (${latest.report_year}/${String(latest.report_month).padStart(2, '0')})`, summary: `Supply: ${fm(latest.total_supply_lbs)} lbs | Shipped: ${fm(latest.total_shipped_lbs)} | Committed: ${fm(latest.total_committed_lbs)} | Uncommitted: ${fm(latest.uncommitted_lbs)}. ${soldPct}% of supply sold or committed.`, confidence: 0.98, data_context: {}, tags: ['brief'], is_actionable: false });
      }

      // Crop year summaries
      const cropYears = [...new Set(allReports.map(r => r.crop_year))];
      for (const cy of cropYears) {
        const cyR = allReports.filter(r => r.crop_year === cy);
        const last = cyR[cyR.length - 1];
        analyses.push({ analysis_type: 'monthly_brief', title: `Crop Summary: ${cy}`, summary: `Final supply: ${(last.total_supply_lbs / M).toFixed(0)}M lbs (carry-in ${(last.carry_in_lbs / M).toFixed(0)}M + receipts ${(last.receipts_lbs / M).toFixed(0)}M). Peak shipments: ${Math.max(...cyR.map(r => r.total_shipped_lbs / M)).toFixed(0)}M/mo. ${cyR.length} months reported.`, confidence: 0.98, data_context: { crop_year: cy }, tags: ['summary', 'crop-year'], is_actionable: false });
      }

      // Anomaly detection
      const shipments = allReports.map(r => r.total_shipped_lbs);
      const mean = shipments.reduce((a, b) => a + b, 0) / shipments.length;
      const std = Math.sqrt(shipments.reduce((a, b) => a + (b - mean) ** 2, 0) / shipments.length);
      let anomalyCount = 0;
      for (const r of allReports) {
        const z = (r.total_shipped_lbs - mean) / std;
        if (Math.abs(z) > 1.8) {
          analyses.push({ analysis_type: 'anomaly', title: `${z > 0 ? 'High' : 'Low'} Shipments: ${r.report_year}/${String(r.report_month).padStart(2, '0')}`, summary: `${(r.total_shipped_lbs / M).toFixed(0)}M lbs — ${Math.abs(z).toFixed(1)} std devs ${z > 0 ? 'above' : 'below'} 10-year avg (${(mean / M).toFixed(0)}M).`, confidence: 0.85, data_context: { z_score: z.toFixed(2) }, tags: ['anomaly'], is_actionable: Math.abs(z) > 2 });
          anomalyCount++;
        }
      }
      log(`Detected ${anomalyCount} anomalies`);

      // Insert all analyses in batches
      let inserted = 0;
      for (let i = 0; i < analyses.length; i += 50) {
        const batch = analyses.slice(i, i + 50);
        const { error } = await supabase.from('ai_analyses').insert(batch);
        if (!error) inserted += batch.length;
        else log(`Batch insert error: ${error.message}`);
      }
      log(`Inserted ${inserted} analyses total`);

      const duration = Date.now() - startTime;
      log(`Autonomous cycle complete in ${(duration / 1000).toFixed(1)}s`);

      await supabase.from('scraping_logs').insert({
        scraper_name: 'browser-autonomous', status: 'success',
        records_found: allReports.length, records_inserted: inserted,
        duration_ms: duration, metadata: { trigger: 'manual', analyses: inserted, anomalies: anomalyCount, pdfs_found: pdfCount },
        completed_at: new Date().toISOString()
      });

    } catch (err) {
      log(`ERROR: ${err.message}`);
      await supabase.from('scraping_logs').insert({
        scraper_name: 'browser-autonomous', status: 'failed',
        error_message: err.message, completed_at: new Date().toISOString()
      });
    } finally {
      setRunning(false);
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Autonomous Systems</h2>
          <p className="text-gray-500 text-sm mt-1">Self-maintaining data pipeline — scrape, process, analyze</p>
        </div>
        <button
          onClick={runCycle}
          disabled={running}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            running
              ? 'bg-blue-500/20 text-blue-400 cursor-wait'
              : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
          }`}
        >
          {running ? 'Running...' : 'Run Cycle Now'}
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Position Reports</p>
          <p className="text-xl font-bold text-white">{reportCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">AI Analyses</p>
          <p className="text-xl font-bold text-white">{analysisCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Scrape Schedule</p>
          <p className="text-sm font-medium text-green-400">15th monthly</p>
          <p className="text-[10px] text-gray-600">via GitHub Actions</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Auto-Analysis</p>
          <p className="text-sm font-medium text-green-400">Enabled</p>
          <p className="text-[10px] text-gray-600">YoY + anomalies + signals</p>
        </div>
      </div>

      {/* Pipeline Architecture */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Autonomous Pipeline</h3>
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-2">
          {[
            { label: 'ABC Website', sub: 'almonds.org', cls: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'PDF Scraper', sub: 'Auto-detect new reports', cls: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'PDF Parser', sub: 'Extract numeric data', cls: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Supabase DB', sub: `${reportCount} reports stored`, cls: 'bg-green-500/10 border-green-500/20' },
            { label: 'Data Processor', sub: 'YoY + anomalies + signals', cls: 'bg-cyan-500/10 border-cyan-500/20' },
            { label: 'AI Analyses', sub: `${analysisCount} insights`, cls: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Dashboard', sub: 'cropsintel.net', cls: 'bg-green-500/10 border-green-500/20' },
          ].map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-600 shrink-0">&rarr;</span>}
              <div className={`border rounded-lg px-3 py-2 shrink-0 ${step.cls}`}>
                <p className="text-white font-medium">{step.label}</p>
                <p className="text-gray-500 text-[10px]">{step.sub}</p>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Run Log (live output) */}
      {runLog.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6 font-mono text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-[10px] uppercase tracking-wider">Run Output</span>
            {running && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {runLog.map((line, i) => (
              <p key={i} className={line.includes('ERROR') ? 'text-red-400' : 'text-green-400/80'}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <h3 className="text-lg font-semibold text-white mb-3">Activity Log</h3>
      {logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  log.status === 'success' ? 'bg-green-500' :
                  log.status === 'failed' ? 'bg-red-500' :
                  log.status === 'started' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm text-white">{log.scraper_name}</p>
                  <p className="text-[10px] text-gray-600">
                    {new Date(log.started_at).toLocaleString()}
                    {log.duration_ms && ` (${(log.duration_ms / 1000).toFixed(1)}s)`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {log.records_inserted > 0 && (
                  <span className="text-[10px] text-gray-500">+{log.records_inserted} records</span>
                )}
                <StatusBadge status={log.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No activity yet</p>
          <p className="text-xs text-gray-600 mt-1">Click "Run Cycle Now" to trigger the autonomous pipeline</p>
        </div>
      )}

      {/* Infrastructure Info */}
      <div className="mt-6 bg-gray-900/30 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Infrastructure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-500 mb-1">Hosting</p>
            <p className="text-gray-300">GitHub Pages (cropsintel.net)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Database</p>
            <p className="text-gray-300">Supabase (Tokyo region)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Scheduled Jobs</p>
            <p className="text-gray-300">GitHub Actions (15th monthly + weekly Monday)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Data Source</p>
            <p className="text-gray-300">Almond Board of California (almonds.org)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
