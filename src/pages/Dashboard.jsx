import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function StatCard({ title, value, subtitle, trend, color = 'green' }) {
  const colorMap = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/20',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20'
  };
  const textColor = { green: 'text-green-400', blue: 'text-blue-400', amber: 'text-amber-400', red: 'text-red-400' };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {trend !== undefined && trend !== null && (
        <p className={`text-xs mt-2 font-medium ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400'}`}>
          {trend > 0 ? '+' : ''}{trend}% YoY
        </p>
      )}
    </div>
  );
}

function InsightCard({ analysis }) {
  const typeConfig = {
    trade_signal: { border: 'border-blue-500/30 bg-blue-500/5', icon: 'S', iconBg: 'bg-blue-500/20 text-blue-400' },
    monthly_brief: { border: 'border-green-500/30 bg-green-500/5', icon: 'B', iconBg: 'bg-green-500/20 text-green-400' },
    yoy_comparison: { border: 'border-purple-500/30 bg-purple-500/5', icon: 'Y', iconBg: 'bg-purple-500/20 text-purple-400' },
    anomaly: { border: 'border-red-500/30 bg-red-500/5', icon: '!', iconBg: 'bg-red-500/20 text-red-400' },
  };
  const cfg = typeConfig[analysis.analysis_type] || { border: 'border-gray-700 bg-gray-800/50', icon: '?', iconBg: 'bg-gray-500/20 text-gray-400' };

  return (
    <div className={`border rounded-lg p-4 ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.iconBg}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-wider text-gray-500">
              {analysis.analysis_type.replace(/_/g, ' ')}
            </span>
            {analysis.confidence && (
              <span className="text-xs text-gray-600">
                {(analysis.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-white mb-1 truncate">{analysis.title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{analysis.summary}</p>
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, value, max, color = 'green' }) {
  const pct = max > 0 ? (value / max * 100) : 0;
  const barColor = { green: 'bg-green-500', blue: 'bg-blue-500', amber: 'bg-amber-500' };
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`h-2 rounded-full ${barColor[color] || 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-14 text-right text-gray-300">{(value / 1e6).toFixed(0)}M</span>
    </div>
  );
}

function ShipmentTrend({ reports }) {
  if (!reports || reports.length < 2) return null;
  const sorted = [...reports].sort((a, b) => a.report_year - b.report_year || a.report_month - b.report_month);
  const maxShip = Math.max(...sorted.map(r => r.total_shipped_lbs));

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Shipment Trend</h3>
      <div className="flex items-end gap-1 h-32">
        {sorted.map((r, i) => {
          const h = maxShip > 0 ? (r.total_shipped_lbs / maxShip * 100) : 0;
          const isLatest = i === sorted.length - 1;
          return (
            <div key={r.id} className="flex-1 flex flex-col items-center gap-1" title={`${r.report_year}/${r.report_month}: ${(r.total_shipped_lbs / 1e6).toFixed(0)}M`}>
              <div
                className={`w-full rounded-t transition-all ${isLatest ? 'bg-green-500' : 'bg-green-500/30'}`}
                style={{ height: `${h}%`, minHeight: '2px' }}
              />
              <span className="text-[9px] text-gray-600 leading-none">
                {String(r.report_month).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{sorted[0]?.report_year}</span>
        <span className="text-[10px] text-gray-600">{sorted[sorted.length - 1]?.report_year}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [latestReport, setLatestReport] = useState(null);
  const [priorYearReport, setPriorYearReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch all position reports for trend
        const { data: reports } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false });

        if (reports?.length) {
          setLatestReport(reports[0]);
          setAllReports(reports);
          // Find prior year same month
          const py = reports.find(r =>
            r.report_month === reports[0].report_month &&
            r.report_year === reports[0].report_year - 1
          );
          if (py) setPriorYearReport(py);
        }

        // Fetch AI analyses — prioritize trade_signal and monthly_brief
        const { data: aiData } = await supabase
          .from('ai_analyses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(15);

        if (aiData) {
          // Sort: trade_signal first, then monthly_brief, then anomaly, then yoy
          const priority = { trade_signal: 0, monthly_brief: 1, anomaly: 2, yoy_comparison: 3 };
          aiData.sort((a, b) => (priority[a.analysis_type] ?? 9) - (priority[b.analysis_type] ?? 9));
          setAnalyses(aiData);
        }

        // Fetch recent scrape logs
        const { data: logs } = await supabase
          .from('scraping_logs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(5);

        if (logs) setScrapeLogs(logs);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const formatLbs = (lbs) => {
    if (!lbs) return '--';
    if (lbs >= 1e9) return `${(lbs / 1e9).toFixed(1)}B`;
    if (lbs >= 1e6) return `${(lbs / 1e6).toFixed(0)}M`;
    if (lbs >= 1e3) return `${(lbs / 1e3).toFixed(0)}K`;
    return lbs.toLocaleString();
  };

  const yoyPct = (current, prior) => {
    if (!current || !prior || prior === 0) return null;
    return Number(((current - prior) / prior * 100).toFixed(1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const lr = latestReport;
  const py = priorYearReport;

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Market Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">
          {lr
            ? `${lr.crop_year} crop year | Report: ${lr.report_year}/${String(lr.report_month).padStart(2, '0')} | ${allReports.length} months loaded`
            : 'No data yet — run the scraper to populate'
          }
        </p>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Total Shipments"
          value={formatLbs(lr?.total_shipped_lbs)}
          subtitle={`Dom ${formatLbs(lr?.domestic_shipped_lbs)} / Exp ${formatLbs(lr?.export_shipped_lbs)}`}
          trend={yoyPct(lr?.total_shipped_lbs, py?.total_shipped_lbs)}
          color="green"
        />
        <StatCard
          title="Committed"
          value={formatLbs(lr?.total_committed_lbs)}
          subtitle={`Dom ${formatLbs(lr?.domestic_committed_lbs)} / Exp ${formatLbs(lr?.export_committed_lbs)}`}
          trend={yoyPct(lr?.total_committed_lbs, py?.total_committed_lbs)}
          color="blue"
        />
        <StatCard
          title="Uncommitted"
          value={formatLbs(lr?.uncommitted_lbs)}
          subtitle="Available inventory"
          trend={yoyPct(lr?.uncommitted_lbs, py?.uncommitted_lbs)}
          color="amber"
        />
        <StatCard
          title="Total Supply"
          value={formatLbs(lr?.total_supply_lbs)}
          subtitle={`Carry ${formatLbs(lr?.carry_in_lbs)} + Recv ${formatLbs(lr?.receipts_lbs)}`}
          trend={yoyPct(lr?.total_supply_lbs, py?.total_supply_lbs)}
          color="green"
        />
      </div>

      {/* Second row: Supply breakdown + Shipment trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Supply Breakdown */}
        {lr && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Supply Position</h3>
            <div className="space-y-3">
              <MiniBar label="Shipped" value={lr.total_shipped_lbs} max={lr.total_supply_lbs} color="green" />
              <MiniBar label="Committed" value={lr.total_committed_lbs} max={lr.total_supply_lbs} color="blue" />
              <MiniBar label="Uncommitted" value={lr.uncommitted_lbs} max={lr.total_supply_lbs} color="amber" />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Sold + Committed</span>
                <span className="text-white font-medium">
                  {((lr.total_shipped_lbs + lr.total_committed_lbs) / lr.total_supply_lbs * 100).toFixed(1)}% of supply
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Shipment Trend */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <ShipmentTrend reports={allReports} />
        </div>
      </div>

      {/* AI Insights + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Insights (2 columns) */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">
            AI Insights
            <span className="text-xs text-gray-500 font-normal ml-2">{analyses.length} total</span>
          </h3>
          {analyses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analyses.slice(0, 8).map(a => <InsightCard key={a.id} analysis={a} />)}
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-500">No insights yet</p>
              <p className="text-xs text-gray-600 mt-1">Run the autonomous scraper to generate insights</p>
            </div>
          )}
        </div>

        {/* System Status */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
          <div className="space-y-2">
            {/* Data freshness */}
            <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Data Coverage</span>
                <span className="text-xs text-green-400">{allReports.length} months</span>
              </div>
              {lr && (
                <p className="text-xs text-gray-500 mt-1">
                  Latest: {lr.report_year}/{String(lr.report_month).padStart(2, '0')} ({lr.crop_year})
                </p>
              )}
            </div>

            <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">AI Analyses</span>
                <span className="text-xs text-blue-400">{analyses.length} insights</span>
              </div>
            </div>

            {scrapeLogs.length > 0 ? scrapeLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
                <div>
                  <p className="text-xs text-white">{log.scraper_name}</p>
                  <p className="text-[10px] text-gray-600">
                    {new Date(log.started_at).toLocaleString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  log.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {log.status}
                </span>
              </div>
            )) : (
              <div className="border border-gray-800 rounded-lg p-6 text-center">
                <p className="text-xs text-gray-500">No scraper runs yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
