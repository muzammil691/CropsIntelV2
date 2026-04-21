import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981'
};

const VARIETY_COLORS = {
  'Nonpareil': '#22c55e',
  'Carmel': '#f59e0b',
  'Butte/Padres': '#3b82f6',
  'Monterey': '#a855f7',
  'Independence': '#06b6d4',
  'Mission': '#ef4444',
  'California': '#10b981',
};

function ChartCard({ title, subtitle, insight, children }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
      {insight && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 leading-relaxed">{insight}</p>
        </div>
      )}
    </div>
  );
}

// Fallback pricing data when strata_prices table doesn't exist yet
const FALLBACK_PRICES = [
  { variety: 'Nonpareil', grade: 'Supreme', form: '23/25', price_usd_per_lb: 3.85, price_date: '2025-04-15', maxons_price_per_lb: 3.97 },
  { variety: 'Nonpareil', grade: 'Supreme', form: '23/25', price_usd_per_lb: 3.80, price_date: '2025-04-01', maxons_price_per_lb: 3.91 },
  { variety: 'Nonpareil', grade: 'Supreme', form: '23/25', price_usd_per_lb: 3.72, price_date: '2025-03-15', maxons_price_per_lb: 3.83 },
  { variety: 'Nonpareil', grade: 'Supreme', form: '23/25', price_usd_per_lb: 3.68, price_date: '2025-03-01', maxons_price_per_lb: 3.79 },
  { variety: 'Carmel', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.20, price_date: '2025-04-15', maxons_price_per_lb: 3.30 },
  { variety: 'Carmel', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.15, price_date: '2025-04-01', maxons_price_per_lb: 3.24 },
  { variety: 'Carmel', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.10, price_date: '2025-03-15', maxons_price_per_lb: 3.19 },
  { variety: 'Carmel', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.05, price_date: '2025-03-01', maxons_price_per_lb: 3.14 },
  { variety: 'Butte/Padres', grade: 'US Extra #1', form: 'Whole', price_usd_per_lb: 2.95, price_date: '2025-04-15', maxons_price_per_lb: 3.04 },
  { variety: 'Butte/Padres', grade: 'US Extra #1', form: 'Whole', price_usd_per_lb: 2.90, price_date: '2025-04-01', maxons_price_per_lb: 2.99 },
  { variety: 'Butte/Padres', grade: 'US Extra #1', form: 'Whole', price_usd_per_lb: 2.85, price_date: '2025-03-15', maxons_price_per_lb: 2.94 },
  { variety: 'Monterey', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.10, price_date: '2025-04-15', maxons_price_per_lb: 3.19 },
  { variety: 'Monterey', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.05, price_date: '2025-04-01', maxons_price_per_lb: 3.14 },
  { variety: 'Monterey', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.00, price_date: '2025-03-15', maxons_price_per_lb: 3.09 },
  { variety: 'Independence', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.30, price_date: '2025-04-15', maxons_price_per_lb: 3.40 },
  { variety: 'Independence', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.25, price_date: '2025-04-01', maxons_price_per_lb: 3.35 },
  { variety: 'Independence', grade: 'Standard', form: 'Whole', price_usd_per_lb: 3.18, price_date: '2025-03-15', maxons_price_per_lb: 3.28 },
  { variety: 'Mission', grade: 'Standard', form: 'Whole', price_usd_per_lb: 2.75, price_date: '2025-04-15', maxons_price_per_lb: 2.83 },
  { variety: 'Mission', grade: 'Standard', form: 'Whole', price_usd_per_lb: 2.70, price_date: '2025-04-01', maxons_price_per_lb: 2.78 },
  { variety: 'Mission', grade: 'Standard', form: 'Whole', price_usd_per_lb: 2.65, price_date: '2025-03-15', maxons_price_per_lb: 2.73 },
];

function PriceCard({ variety, price, maxonsPrice, grade, form, date, trend }) {
  const trendColor = trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400';
  const trendIcon = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-semibold text-white">{variety}</h4>
          <p className="text-xs text-gray-500">{[grade, form].filter(Boolean).join(' • ') || 'Standard'}</p>
        </div>
        <span className={`text-xs font-medium ${trendColor}`}>
          {trendIcon} {trend ? `${Math.abs(trend).toFixed(1)}%` : '—'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide">Market</p>
          <p className="text-lg font-bold text-white">${price?.toFixed(2)}</p>
          <p className="text-[10px] text-gray-500">per lb</p>
        </div>
        <div>
          <p className="text-[10px] text-green-600 uppercase tracking-wide">MAXONS</p>
          <p className="text-lg font-bold text-green-400">${maxonsPrice?.toFixed(2)}</p>
          <p className="text-[10px] text-gray-500">per lb (+3%)</p>
        </div>
      </div>
      <p className="text-[10px] text-gray-600 mt-2">Updated: {date}</p>
    </div>
  );
}

export default function Pricing() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table' | 'chart'
  const [varietyFilter, setVarietyFilter] = useState('all');

  useEffect(() => {
    loadPrices();
  }, []);

  async function loadPrices() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('strata_prices')
        .select('*')
        .order('price_date', { ascending: false })
        .limit(500);

      if (!error && data && data.length > 0) {
        setPrices(data);
        setIsSample(false);
      } else {
        setPrices(FALLBACK_PRICES);
        setIsSample(true);
      }
    } catch (err) {
      console.error('Load error, using fallback:', err);
      setPrices(FALLBACK_PRICES);
      setIsSample(true);
    }
    setLoading(false);
  }

  // Get unique varieties
  const varieties = [...new Set(prices.map(p => p.variety))].filter(Boolean).sort();

  // Filter prices
  const filteredPrices = varietyFilter === 'all' ? prices : prices.filter(p => p.variety === varietyFilter);

  // Latest price per variety (for cards view)
  const latestByVariety = varieties.map(v => {
    const latest = prices.filter(p => p.variety === v).sort((a, b) => b.price_date.localeCompare(a.price_date));
    const current = latest[0];
    const previous = latest[1];
    const trend = current && previous && previous.price_usd_per_lb > 0
      ? ((current.price_usd_per_lb - previous.price_usd_per_lb) / previous.price_usd_per_lb * 100)
      : 0;
    return { ...current, trend };
  }).filter(p => p.price_usd_per_lb);

  // Chart data — prices over time by variety
  const chartData = prices
    .filter(p => p.price_usd_per_lb)
    .reduce((acc, p) => {
      const date = p.price_date;
      let entry = acc.find(d => d.date === date);
      if (!entry) {
        entry = { date };
        acc.push(entry);
      }
      entry[p.variety] = p.price_usd_per_lb;
      entry[`${p.variety}_maxons`] = p.maxons_price_per_lb;
      return acc;
    }, [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60); // Last 60 data points

  // Summary stats
  const avgPrice = latestByVariety.length > 0
    ? latestByVariety.reduce((s, p) => s + p.price_usd_per_lb, 0) / latestByVariety.length
    : 0;
  const avgMaxons = latestByVariety.length > 0
    ? latestByVariety.reduce((s, p) => s + (p.maxons_price_per_lb || 0), 0) / latestByVariety.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Live Pricing
            {isSample && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase tracking-wider ml-2 align-middle">Sample Data</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Strata Markets almond prices with MAXONS 3% margin applied
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {['cards', 'table', 'chart'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  viewMode === mode ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'cards' ? '📋' : mode === 'table' ? '📊' : '📈'} {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {/* Variety filter */}
          <select
            value={varietyFilter}
            onChange={e => setVarietyFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300"
          >
            <option value="all">All Varieties</option>
            {varieties.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Prices come from Strata Markets, the primary exchange for California almond trading. Each variety card shows the latest market price alongside the MAXONS price (market + 3% margin).
          The trend arrow shows direction vs. the previous data point. Switch between card, table, and chart views to analyze from different angles.
          {varieties.length > 0 ? ` Currently tracking ${varieties.length} varieties across ${prices.length} data points.` : ''}
        </p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Varieties Tracked</p>
          <p className="text-xl font-bold text-white">{varieties.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Avg Market Price</p>
          <p className="text-xl font-bold text-white">${avgPrice.toFixed(2)}/lb</p>
        </div>
        <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-green-600">Avg MAXONS Price</p>
          <p className="text-xl font-bold text-green-400">${avgMaxons.toFixed(2)}/lb</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Data Points</p>
          <p className="text-xl font-bold text-white">{prices.length}</p>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {latestByVariety.length > 0 ? latestByVariety.map((p, i) => (
            <PriceCard
              key={i}
              variety={p.variety}
              price={p.price_usd_per_lb}
              maxonsPrice={p.maxons_price_per_lb}
              grade={p.grade}
              form={p.form}
              date={p.price_date}
              trend={p.trend}
            />
          )) : (
            <div className="col-span-full flex items-center justify-center h-48 text-gray-600">
              <div className="text-center">
                <p className="text-3xl mb-2">💰</p>
                <p>Pricing data will appear here once Strata scraper runs</p>
                <p className="text-xs mt-1">The scraper logs into Strata Markets automatically</p>
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <ChartCard title="Price History" subtitle="All recorded prices with MAXONS margin" insight="The full price history shows how each variety's price has moved over time. Watch the spread between bid and ask prices — a narrow spread means a liquid, active market. Wide spreads suggest uncertainty. The MAXONS column shows your selling price with the 3% margin pre-applied.">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Date</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Variety</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Grade</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Market $/lb</th>
                  <th className="text-right py-2 px-2 text-green-600 font-medium">MAXONS $/lb</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Bid</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Ask</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrices.slice(0, 100).map((p, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-2 text-gray-400">{p.price_date}</td>
                    <td className="py-2 px-2 text-white">{p.variety}</td>
                    <td className="py-2 px-2 text-gray-400">{p.grade || '—'}</td>
                    <td className="py-2 px-2 text-right text-white font-mono">${p.price_usd_per_lb?.toFixed(4)}</td>
                    <td className="py-2 px-2 text-right text-green-400 font-mono">${p.maxons_price_per_lb?.toFixed(4)}</td>
                    <td className="py-2 px-2 text-right text-gray-400 font-mono">{p.bid_price ? `$${p.bid_price.toFixed(4)}` : '—'}</td>
                    <td className="py-2 px-2 text-right text-gray-400 font-mono">{p.ask_price ? `$${p.ask_price.toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredPrices.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                No pricing data yet — Strata scraper will populate this automatically
              </div>
            )}
          </div>
        </ChartCard>
      )}

      {viewMode === 'chart' && (
        <ChartCard title="Price Trends" subtitle="Market prices over time by variety" insight="Price trends reveal the direction of the market. Parallel lines mean varieties are moving together (macro-driven). Diverging lines suggest variety-specific demand shifts — Nonpareil premium may widen or narrow vs. other varieties. Time your purchases when lines are trending down and sell positions when they curve up.">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={v => [`$${v?.toFixed(4)}/lb`]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {varieties.slice(0, 6).map(v => (
                  <Line
                    key={v}
                    type="monotone"
                    dataKey={v}
                    stroke={VARIETY_COLORS[v] || COLORS.green}
                    name={v}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-gray-600 text-sm">
              <div className="text-center">
                <p className="text-3xl mb-2">📈</p>
                <p>Price charts will render once data flows in</p>
              </div>
            </div>
          )}
        </ChartCard>
      )}

      {/* MAXONS Margin Info */}
      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <h3 className="text-sm font-medium text-green-400">MAXONS Pricing Policy</h3>
        </div>
        <p className="text-xs text-gray-400">
          All prices include MAXONS 3% margin automatically applied. Market prices are sourced from
          Strata Markets (online.stratamarkets.com) and updated on each autonomous cycle.
          Formula: MAXONS Price = Market Price × 1.03
        </p>
      </div>
    </div>
  );
}
