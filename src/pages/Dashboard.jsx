import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAIStatus, loadAPIKeys } from '../lib/ai-engine';

// Strip markdown markers, section labels, and truncate text for card previews
function truncateText(text, maxLen = 150) {
  if (!text) return '';
  const clean = text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/---+|___+|\*\*\*+/g, ' ')
    .replace(/[-*]\s+/g, '')
    // Strip known section headers from AI briefs
    .replace(/(?:KEY HEADLINE|SUPPLY SITUATION|DEMAND SITUATION|MARKET OUTLOOK|TRADE SIGNAL|SUMMARY|OVERVIEW|CONCLUSION|RECOMMENDATION)\s*[:—\-]?\s*/gi, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

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
    yoy_analysis: { border: 'border-purple-500/30 bg-purple-500/5', icon: 'Y', iconBg: 'bg-purple-500/20 text-purple-400' },
    seasonal_pattern: { border: 'border-cyan-500/30 bg-cyan-500/5', icon: 'P', iconBg: 'bg-cyan-500/20 text-cyan-400' },
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
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{truncateText(analysis.summary, 180)}</p>
        </div>
      </div>
    </div>
  );
}

function SampleBadge() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase tracking-wider ml-2">
      Sample Data
    </span>
  );
}

function SupplyPositionWidget({ current, prior }) {
  if (!current) return null;

  const soldCurrent = (current.total_shipped_lbs || 0) + (current.total_committed_lbs || 0);
  const soldPctCurrent = current.total_supply_lbs > 0 ? (soldCurrent / current.total_supply_lbs * 100) : 0;
  const shippedPctCurrent = current.total_supply_lbs > 0 ? (current.total_shipped_lbs / current.total_supply_lbs * 100) : 0;

  let soldPctPrior = null;
  if (prior && prior.total_supply_lbs > 0) {
    const soldPrior = (prior.total_shipped_lbs || 0) + (prior.total_committed_lbs || 0);
    soldPctPrior = (soldPrior / prior.total_supply_lbs * 100);
  }

  const delta = soldPctPrior !== null ? (soldPctCurrent - soldPctPrior).toFixed(1) : null;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-1">Crop Sold Progress</h3>
      <p className="text-[10px] text-gray-500 mb-4">
        {current.crop_year} — shipped + committed as % of total supply
      </p>

      {/* Main progress bar */}
      <div className="relative mb-2">
        <div className="w-full bg-gray-800 rounded-full h-6 overflow-hidden">
          {/* Shipped portion */}
          <div
            className="absolute top-0 left-0 h-6 bg-green-500 rounded-l-full"
            style={{ width: `${Math.min(shippedPctCurrent, 100)}%` }}
          />
          {/* Committed portion (on top of shipped) */}
          <div
            className="absolute top-0 h-6 bg-blue-500/70 rounded-r-full"
            style={{ left: `${Math.min(shippedPctCurrent, 100)}%`, width: `${Math.min(soldPctCurrent - shippedPctCurrent, 100 - shippedPctCurrent)}%` }}
          />
        </div>
        {/* Prior year marker */}
        {soldPctPrior !== null && (
          <div
            className="absolute top-0 h-6 border-r-2 border-dashed border-amber-400"
            style={{ left: `${Math.min(soldPctPrior, 100)}%` }}
            title={`Prior year: ${soldPctPrior.toFixed(1)}%`}
          >
            <div className="absolute -top-5 -translate-x-1/2 text-[9px] text-amber-400 whitespace-nowrap">
              PY {soldPctPrior.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Percentage label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold text-white">{soldPctCurrent.toFixed(1)}%</span>
        {delta !== null && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            delta > 0 ? 'bg-green-500/15 text-green-400' : delta < 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-500/15 text-gray-400'
          }`}>
            {delta > 0 ? '+' : ''}{delta}pp vs prior year
          </span>
        )}
      </div>

      {/* Legend and breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-800">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            <span className="text-[10px] text-gray-400">Shipped</span>
          </div>
          <p className="text-xs text-white font-medium">{shippedPctCurrent.toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(current.total_shipped_lbs / 1e6).toFixed(0)}M lbs</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />
            <span className="text-[10px] text-gray-400">Committed</span>
          </div>
          <p className="text-xs text-white font-medium">{(soldPctCurrent - shippedPctCurrent).toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(current.total_committed_lbs / 1e6).toFixed(0)}M lbs</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-gray-700" />
            <span className="text-[10px] text-gray-400">Unsold</span>
          </div>
          <p className="text-xs text-white font-medium">{(100 - soldPctCurrent).toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(current.uncommitted_lbs / 1e6).toFixed(0)}M lbs</p>
        </div>
      </div>
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
      <div className="flex items-end gap-[1px] h-32">
        {sorted.map((r, i) => {
          const h = maxShip > 0 ? (r.total_shipped_lbs / maxShip * 100) : 0;
          const isLatest = i === sorted.length - 1;
          return (
            <div key={r.id} className="flex-1 flex flex-col items-center" title={`${r.report_year}/${String(r.report_month).padStart(2,'0')}: ${(r.total_shipped_lbs / 1e6).toFixed(0)}M lbs`}>
              <div
                className={`w-full rounded-t transition-all ${isLatest ? 'bg-green-500' : 'bg-green-500/30'}`}
                style={{ height: `${h}%`, minHeight: '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        {sorted.filter((r, i) => i === 0 || r.report_year !== sorted[i-1].report_year).map(r => (
          <span key={r.report_year} className="text-[10px] text-gray-600">{r.report_year}</span>
        ))}
      </div>
    </div>
  );
}

// Dashboard fallback data for when DB tables don't exist yet
const DASH_FALLBACK_PRICES = [
  { variety: 'Nonpareil', grade: 'Supreme', price_usd_per_lb: 3.85, maxons_price_per_lb: 3.97, price_date: '2025-04-15' },
  { variety: 'Carmel', grade: 'Standard', price_usd_per_lb: 3.20, maxons_price_per_lb: 3.30, price_date: '2025-04-15' },
  { variety: 'Butte/Padres', grade: 'US Extra #1', price_usd_per_lb: 2.95, maxons_price_per_lb: 3.04, price_date: '2025-04-15' },
  { variety: 'Monterey', grade: 'Standard', price_usd_per_lb: 3.10, maxons_price_per_lb: 3.19, price_date: '2025-04-15' },
  { variety: 'Independence', grade: 'Standard', price_usd_per_lb: 3.30, maxons_price_per_lb: 3.40, price_date: '2025-04-15' },
  { variety: 'Mission', grade: 'Standard', price_usd_per_lb: 2.75, maxons_price_per_lb: 2.83, price_date: '2025-04-15' },
];

const DASH_FALLBACK_NEWS = [
  { id: 'fn1', title: 'ABC Reports Record 2024/25 Shipments Through March', category: 'market', ai_sentiment: 'bullish', source: 'almonds.org', published_date: '2025-04-10', summary: 'Total shipments running 12% ahead of prior year with strong India and EU demand.' },
  { id: 'fn2', title: 'India Announces Reduction in Almond Import Duty', category: 'trade', ai_sentiment: 'bullish', source: 'Reuters', published_date: '2025-03-28', summary: 'Import duties dropping from 42% to 35%, boosting demand from world\'s largest market.' },
  { id: 'fn3', title: 'Almond Acreage Declines for Third Consecutive Year', category: 'crop', ai_sentiment: 'bullish', source: 'USDA-NASS', published_date: '2025-02-20', summary: 'Total acreage dropped to 1.29M, signaling tighter supply ahead.' },
  { id: 'fn4', title: 'Almond Prices Firm as New Crop Commitments Surge', category: 'market', ai_sentiment: 'bullish', source: 'Strata Markets', published_date: '2025-01-20', summary: 'New crop commitments running 18% ahead of last year.' },
  { id: 'fn5', title: 'Middle East Demand Hits 5-Year High', category: 'trade', ai_sentiment: 'bullish', source: 'ABC Position Report', published_date: '2024-12-15', summary: 'Exports to Middle East reached 145M lbs through December, highest in five years.' },
];

export default function Dashboard() {
  const [latestReport, setLatestReport] = useState(null);
  const [priorYearReport, setPriorYearReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  const [latestPrices, setLatestPrices] = useState([]);
  const [recentNews, setRecentNews] = useState([]);
  const [isSamplePrices, setIsSamplePrices] = useState(false);
  const [isSampleNews, setIsSampleNews] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { await loadAPIKeys(); setAiStatus(getAIStatus()); })();
  }, []);

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
          const py = reports.find(r =>
            r.report_month === reports[0].report_month &&
            r.report_year === reports[0].report_year - 1
          );
          if (py) setPriorYearReport(py);
        }

        // Fetch AI analyses
        const { data: aiData } = await supabase
          .from('ai_analyses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (aiData) {
          // Strict dedup: keep only ONE per analysis_type (most recent)
          const byType = {};
          aiData.forEach(a => {
            if (!byType[a.analysis_type]) byType[a.analysis_type] = a;
          });
          const deduped = Object.values(byType);
          // Sort: monthly_brief first, then trade_signal, then others
          const priority = { monthly_brief: 0, trade_signal: 1, anomaly: 2, yoy_comparison: 3, seasonal_pattern: 4 };
          deduped.sort((a, b) => (priority[a.analysis_type] ?? 9) - (priority[b.analysis_type] ?? 9));
          setAnalyses(deduped);
        }

        // Fetch recent scrape logs - deduplicated
        const { data: logs } = await supabase
          .from('scraping_logs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(20);

        if (logs) {
          // Deduplicate by scraper_name (keep only most recent per scraper)
          const byName = {};
          logs.forEach(l => {
            if (!byName[l.scraper_name]) byName[l.scraper_name] = l;
          });
          setScrapeLogs(Object.values(byName));
        }

        // Fetch latest Strata prices (one per variety, most recent)
        const { data: prices } = await supabase
          .from('strata_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(30);

        if (prices && prices.length > 0) {
          const byVariety = {};
          prices.forEach(p => { if (!byVariety[p.variety]) byVariety[p.variety] = p; });
          setLatestPrices(Object.values(byVariety).slice(0, 6));
          setIsSamplePrices(false);
        } else {
          setLatestPrices(DASH_FALLBACK_PRICES);
          setIsSamplePrices(true);
        }

        // Fetch recent news
        const { data: news } = await supabase
          .from('industry_news')
          .select('*')
          .order('published_date', { ascending: false })
          .limit(5);

        if (news && news.length > 0) {
          setRecentNews(news);
          setIsSampleNews(false);
        } else {
          setRecentNews(DASH_FALLBACK_NEWS);
          setIsSampleNews(true);
        }
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

  // Get the featured brief and signal for the Market Brief card
  const featuredBrief = analyses.find(a => a.analysis_type === 'monthly_brief');
  const featuredSignal = analyses.find(a => a.analysis_type === 'trade_signal');
  // Insight cards: exclude the featured brief/signal, show max 4
  const insightCards = analyses
    .filter(a => a.id !== featuredBrief?.id && a.id !== featuredSignal?.id)
    .slice(0, 4);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Market Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">
              {lr
                ? `${lr.crop_year} crop year | Report: ${lr.report_year}/${String(lr.report_month).padStart(2, '0')} | ${allReports.length} months loaded`
                : 'No data yet - run the scraper to populate'
              }
            </p>
          </div>
          {lr && (
            <div className="hidden md:flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400">Last update: {lr.report_year}/{String(lr.report_month).padStart(2, '0')}</span>
            </div>
          )}
        </div>
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

      {/* Market Brief - concise executive summary */}
      {(featuredBrief || featuredSignal) && (
        <div className="mb-6 bg-gradient-to-r from-green-500/10 via-blue-500/5 to-transparent border border-green-500/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
              <span className="text-green-400 font-bold text-sm">AI</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-semibold text-white">
                  {featuredBrief?.title || featuredSignal?.title || 'Market Intelligence'}
                </h3>
                {(() => {
                  const sig = featuredSignal?.data_context?.signal || 'neutral';
                  return (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      sig === 'bullish' ? 'bg-green-500/20 text-green-400' :
                      sig === 'bearish' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {sig}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {truncateText(featuredBrief?.summary || featuredSignal?.summary || '', 350)}
              </p>
              {featuredSignal && featuredSignal.id !== featuredBrief?.id && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  {truncateText(featuredSignal.summary, 150)}
                </p>
              )}
              <Link to="/analysis" className="inline-block text-xs text-green-400 mt-3 hover:text-green-300 transition-colors">
                Read full analysis &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Second row: Supply Position + Shipment trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Crop Sold Progress — correct concept: completion bar with prior year reference */}
        <SupplyPositionWidget current={lr} prior={py} />

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
          {insightCards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insightCards.map(a => <InsightCard key={a.id} analysis={a} />)}
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-500">No additional insights</p>
              <p className="text-xs text-gray-600 mt-1">Run the autonomous scraper to generate more insights</p>
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
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">AI Engine (4 Systems)</span>
                <Link to="/intelligence" className="text-[10px] text-green-400 hover:text-green-300">Open &rarr;</Link>
              </div>
              {aiStatus ? (
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(aiStatus).filter(([k]) => k !== 'council').map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${val.connected ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-[10px] text-gray-500 capitalize">{key}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-600">Loading...</span>
              )}
              {aiStatus?.council && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-800 flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${aiStatus.council.connected ? 'bg-purple-400' : 'bg-gray-600'}`} />
                  <span className="text-[10px] text-gray-500">Council: {aiStatus.council.modelsActive}/3</span>
                </div>
              )}
            </div>

            {scrapeLogs.length > 0 ? scrapeLogs.slice(0, 4).map(log => (
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

      {/* Live Pricing, News Feed, System Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Live Pricing Widget */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Live Almond Prices{isSamplePrices && <SampleBadge />}
            </h3>
            <Link to="/pricing" className="text-xs text-green-400 hover:text-green-300 transition-colors">
              View All &rarr;
            </Link>
          </div>
          {latestPrices.length > 0 ? (
            <div className="space-y-3">
              {latestPrices.map((p) => {
                const marketPrice = parseFloat(p.price_usd_per_lb || p.price) || 0;
                const maxonsPrice = p.maxons_price_per_lb ? parseFloat(p.maxons_price_per_lb).toFixed(2) : (marketPrice * 1.03).toFixed(2);
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.variety}</p>
                      <p className="text-[10px] text-gray-600">
                        {p.price_date ? new Date(p.price_date).toLocaleDateString() : '--'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300">
                        ${marketPrice.toFixed(2)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                        ${maxonsPrice}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2">
                <p className="text-[10px] text-gray-600 text-right">Market | MAXONS (+3%)</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-gray-500">No pricing data yet</p>
              <p className="text-[10px] text-gray-600 mt-1">Strata scraper will populate prices</p>
            </div>
          )}
        </div>

        {/* Industry News Feed Widget */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Latest News &amp; Intel{isSampleNews && <SampleBadge />}
            </h3>
            <Link to="/news" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View All &rarr;
            </Link>
          </div>
          {recentNews.length > 0 ? (
            <div className="space-y-3">
              {recentNews.map((item) => {
                const sent = item.ai_sentiment || item.sentiment;
                const sentimentColor = sent === 'bullish'
                  ? 'bg-green-500' : sent === 'bearish'
                  ? 'bg-red-500' : 'bg-gray-500';
                return (
                  <div key={item.id} className="group py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sentimentColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white leading-snug line-clamp-2">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.source && (
                            <span className="text-[10px] text-gray-500">{item.source}</span>
                          )}
                          {item.published_date && (
                            <span className="text-[10px] text-gray-600">
                              {new Date(item.published_date).toLocaleDateString()}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-gray-500">No news items yet</p>
              <p className="text-[10px] text-gray-600 mt-1">News scraper will populate intel</p>
            </div>
          )}
        </div>

        {/* Autonomous Pipeline Status Widget */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Pipeline Status</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-400">Active</span>
            </div>
          </div>
          <div className="space-y-3">
            {/* Email System */}
            <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">@</span>
                  <span className="text-xs text-white">intel@cropsintel.com</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
              </div>
            </div>

            {/* Scrapers */}
            {['ABC Position Reports', 'Strata Pricing', 'Bountiful Estimates', 'News Aggregator'].map((name) => {
              const shortName = name.split(' ')[0].toLowerCase();
              const log = scrapeLogs.find(l => l.scraper_name?.toLowerCase().includes(shortName));
              return (
                <div key={name} className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white">{name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      log?.status === 'success' ? 'bg-green-500/20 text-green-400' :
                      log?.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-600/20 text-gray-400'
                    }`}>
                      {log?.status || 'Pending'}
                    </span>
                  </div>
                  {log?.started_at && (
                    <p className="text-[10px] text-gray-600 mt-1">
                      Last: {new Date(log.started_at).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Next Scheduled */}
            <div className="pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Next scheduled run</span>
                <span className="text-[10px] text-gray-400">
                  {scrapeLogs[0]?.started_at
                    ? (() => {
                        const last = new Date(scrapeLogs[0].started_at);
                        const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
                        return next > new Date() ? next.toLocaleString() : 'Overdue';
                      })()
                    : 'Not scheduled'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
