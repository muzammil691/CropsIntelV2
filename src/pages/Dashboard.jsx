import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function StatCard({ title, value, subtitle, trend, color = 'green' }) {
  const colorMap = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/20 text-green-400',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20 text-red-400'
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-6`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs mt-2 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend > 0 ? '+' : ''}{trend}% YoY
        </p>
      )}
    </div>
  );
}

function AlertCard({ analysis }) {
  const typeColors = {
    anomaly: 'border-red-500/30 bg-red-500/5',
    trade_signal: 'border-blue-500/30 bg-blue-500/5',
    monthly_brief: 'border-green-500/30 bg-green-500/5'
  };

  return (
    <div className={`border rounded-lg p-4 ${typeColors[analysis.analysis_type] || 'border-gray-700 bg-gray-800/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-gray-400">
          {analysis.analysis_type.replace('_', ' ')}
        </span>
        {analysis.confidence && (
          <span className="text-xs text-gray-500">
            {(analysis.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium text-white mb-1">{analysis.title}</h3>
      <p className="text-xs text-gray-400 leading-relaxed">{analysis.summary}</p>
    </div>
  );
}

export default function Dashboard() {
  const [latestReport, setLatestReport] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch latest position report
        const { data: reports } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false })
          .limit(1);

        if (reports?.length) setLatestReport(reports[0]);

        // Fetch recent AI analyses
        const { data: aiData } = await supabase
          .from('ai_analyses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (aiData) setAnalyses(aiData);

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
    if (!lbs) return '—';
    if (lbs >= 1e9) return `${(lbs / 1e9).toFixed(1)}B`;
    if (lbs >= 1e6) return `${(lbs / 1e6).toFixed(1)}M`;
    if (lbs >= 1e3) return `${(lbs / 1e3).toFixed(0)}K`;
    return lbs.toLocaleString();
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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Market Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          {latestReport
            ? `Latest data: ${latestReport.report_year}/${latestReport.report_month} crop year ${latestReport.crop_year}`
            : 'No data yet — run the scraper to populate'
          }
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Shipments"
          value={formatLbs(latestReport?.total_shipped_lbs)}
          subtitle="Monthly"
          color="green"
        />
        <StatCard
          title="Committed"
          value={formatLbs(latestReport?.total_committed_lbs)}
          subtitle="Outstanding"
          color="blue"
        />
        <StatCard
          title="Uncommitted"
          value={formatLbs(latestReport?.uncommitted_lbs)}
          subtitle="Available inventory"
          color="amber"
        />
        <StatCard
          title="Total Supply"
          value={formatLbs(latestReport?.total_supply_lbs)}
          subtitle="Carry-in + Receipts"
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* AI Insights */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">AI Insights</h3>
          {analyses.length > 0 ? (
            <div className="space-y-3">
              {analyses.map(a => <AlertCard key={a.id} analysis={a} />)}
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
            {scrapeLogs.length > 0 ? scrapeLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
                <div>
                  <p className="text-sm text-white">{log.scraper_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(log.started_at).toLocaleString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  log.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {log.status}
                </span>
              </div>
            )) : (
              <div className="border border-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-500">No activity yet</p>
                <p className="text-xs text-gray-600 mt-1">The autonomous runner will log activity here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
