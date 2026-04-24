import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { seedStrataPrices } from '../lib/seed-strata';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import FilterBar from '../components/FilterBar';
import { useAuth } from '../lib/auth';
import { isInternal } from '../lib/permissions';

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


function PriceCard({ variety, price, maxonsPrice, grade, form, date, trend, internal }) {
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
      {internal ? (
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
      ) : (
        <div className="mt-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide">Price</p>
          <p className="text-2xl font-bold text-green-400">${maxonsPrice?.toFixed(2)}</p>
          <p className="text-[10px] text-gray-500">per lb</p>
        </div>
      )}
      <p className="text-[10px] text-gray-600 mt-2">Updated: {date}</p>
    </div>
  );
}

export default function Pricing() {
  const { profile } = useAuth();
  const internal = isInternal(profile);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table' | 'chart' | 'compare'
  const [varietyFilter, setVarietyFilter] = useState('all');
  // Phase C3 compare-mode state
  const [comparedVarieties, setComparedVarieties] = useState([]);
  const [comparedGrades, setComparedGrades] = useState([]);

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
      } else {
        // Auto-seed if table is empty
        const seeded = await seedStrataPrices(supabase);
        if (seeded) {
          // Reload after seeding
          const { data: d2 } = await supabase
            .from('strata_prices')
            .select('*')
            .order('price_date', { ascending: false })
            .limit(500);
          setPrices(d2 || []);
        } else {
          setPrices([]);
        }
      }
    } catch (err) {
      console.error('Load error:', err);
      setPrices([]);
    }
    setLoading(false);
  }

  // Get unique varieties + grades
  const varieties = [...new Set(prices.map(p => p.variety))].filter(Boolean).sort();
  const grades = [...new Set(prices.map(p => p.grade))].filter(Boolean).sort();

  // Phase C3: default compare to top 3 varieties + all grades once data loads
  useEffect(() => {
    if (comparedVarieties.length === 0 && varieties.length > 0) {
      setComparedVarieties(varieties.slice(0, 3));
    }
    if (comparedGrades.length === 0 && grades.length > 0) {
      setComparedGrades(grades);
    }
  }, [varieties.length, grades.length]);

  const toggleVariety = v => setComparedVarieties(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  const toggleGrade = g => setComparedGrades(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);

  // Phase C3: history trend for compared varieties, filtered to compared grades.
  // Non-internal users see the offered price (maxons) \u2014 internals see market.
  const compareHistory = useMemo(() => {
    if (comparedVarieties.length === 0) return [];
    const priceField = internal ? 'price_usd_per_lb' : 'maxons_price_per_lb';
    const filtered = prices.filter(p =>
      p.variety && comparedVarieties.includes(p.variety) &&
      (comparedGrades.length === 0 || (p.grade && comparedGrades.includes(p.grade))) &&
      p[priceField]
    );
    // Group by date, aggregate per variety (average across grades if multiple)
    const byDate = {};
    for (const p of filtered) {
      if (!byDate[p.price_date]) byDate[p.price_date] = { date: p.price_date };
      const k = p.variety;
      if (!byDate[p.price_date][`${k}_sum`]) { byDate[p.price_date][`${k}_sum`] = 0; byDate[p.price_date][`${k}_n`] = 0; }
      byDate[p.price_date][`${k}_sum`] += p[priceField];
      byDate[p.price_date][`${k}_n`] += 1;
    }
    return Object.values(byDate).map(row => {
      const out = { date: row.date };
      for (const v of comparedVarieties) {
        if (row[`${v}_n`] > 0) out[v] = row[`${v}_sum`] / row[`${v}_n`];
      }
      return out;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [prices, comparedVarieties, comparedGrades, internal]);

  // Phase C3: current-level table — latest price per (variety, grade) cross-tab
  const crossTable = useMemo(() => {
    const bestByKey = {};
    for (const p of prices) {
      if (!p.variety || !comparedVarieties.includes(p.variety)) continue;
      if (comparedGrades.length > 0 && p.grade && !comparedGrades.includes(p.grade)) continue;
      const key = `${p.variety}|${p.grade || '-'}`;
      const existing = bestByKey[key];
      if (!existing || (p.price_date > existing.price_date)) {
        bestByKey[key] = p;
      }
    }
    return Object.values(bestByKey).sort((a, b) => a.variety.localeCompare(b.variety) || (a.grade || '').localeCompare(b.grade || ''));
  }, [prices, comparedVarieties, comparedGrades]);

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
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {internal
              ? 'Strata Markets almond prices with MAXONS 3% margin applied'
              : 'Live almond pricing \u2014 updated on each autonomous cycle'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {['cards', 'table', 'chart', 'compare'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  viewMode === mode ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'cards' ? '📋' : mode === 'table' ? '📊' : mode === 'chart' ? '📈' : '⚖️'} {mode.charAt(0).toUpperCase() + mode.slice(1)}
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
          {/* CSV Export */}
          <button
            onClick={() => {
              const rows = internal
                ? [['Date','Variety','Grade','Form','Market_USD_per_lb','MAXONS_USD_per_lb','Bid','Ask']]
                : [['Date','Variety','Grade','Form','Price_USD_per_lb']];
              filteredPrices.forEach(p => rows.push(internal
                ? [
                    p.price_date, p.variety, p.grade || '', p.form || '',
                    p.price_usd_per_lb, p.maxons_price_per_lb || '',
                    p.bid_price || '', p.ask_price || ''
                  ]
                : [
                    p.price_date, p.variety, p.grade || '', p.form || '',
                    p.maxons_price_per_lb || ''
                  ]
              ));
              const csv = rows.map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'cropsintel_pricing.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs text-gray-500 hover:text-green-400 transition-colors px-2 py-1 rounded border border-gray-800 hover:border-green-500/30"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          {internal
            ? `Prices come from Strata Markets, the primary exchange for California almond trading. Each variety card shows the latest market price alongside the MAXONS price (market + 3% margin). The trend arrow shows direction vs. the previous data point. Switch between card, table, and chart views to analyze from different angles.`
            : `Each variety card shows the latest CropsIntel offered price, per pound, for the indicated grade and form. The trend arrow shows direction vs. the previous data point. Switch between card, table, and chart views to analyze from different angles.`}
          {varieties.length > 0 ? ` Currently tracking ${varieties.length} varieties across ${prices.length} data points.` : ''}
        </p>
      </div>

      {/* Summary Row */}
      <div className={`grid grid-cols-2 gap-3 ${internal ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Varieties Tracked</p>
          <p className="text-xl font-bold text-white">{varieties.length}</p>
        </div>
        {internal && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">Avg Market Price</p>
            <p className="text-xl font-bold text-white">${avgPrice.toFixed(2)}/lb</p>
          </div>
        )}
        <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-green-600">{internal ? 'Avg MAXONS Price' : 'Avg Price'}</p>
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
              internal={internal}
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
        <ChartCard
          title="Price History"
          subtitle={internal ? "All recorded prices with MAXONS margin" : "All recorded prices"}
          insight={internal
            ? "The full price history shows how each variety's price has moved over time. Watch the spread between bid and ask prices \u2014 a narrow spread means a liquid, active market. Wide spreads suggest uncertainty. The MAXONS column shows your selling price with the 3% margin pre-applied."
            : "The full price history shows how each variety's price has moved over time. Use this to track direction per variety and plan order timing."}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Date</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Variety</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Grade</th>
                  {internal && <th className="text-right py-2 px-2 text-gray-500 font-medium">Market $/lb</th>}
                  <th className="text-right py-2 px-2 text-green-600 font-medium">{internal ? 'MAXONS $/lb' : '$/lb'}</th>
                  {internal && <th className="text-right py-2 px-2 text-gray-500 font-medium">Bid</th>}
                  {internal && <th className="text-right py-2 px-2 text-gray-500 font-medium">Ask</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPrices.slice(0, 100).map((p, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-2 text-gray-400">{p.price_date}</td>
                    <td className="py-2 px-2 text-white">{p.variety}</td>
                    <td className="py-2 px-2 text-gray-400">{p.grade || '\u2014'}</td>
                    {internal && <td className="py-2 px-2 text-right text-white font-mono">${p.price_usd_per_lb?.toFixed(4)}</td>}
                    <td className="py-2 px-2 text-right text-green-400 font-mono">${p.maxons_price_per_lb?.toFixed(4)}</td>
                    {internal && <td className="py-2 px-2 text-right text-gray-400 font-mono">{p.bid_price ? `$${p.bid_price.toFixed(4)}` : '\u2014'}</td>}
                    {internal && <td className="py-2 px-2 text-right text-gray-400 font-mono">{p.ask_price ? `$${p.ask_price.toFixed(4)}` : '\u2014'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredPrices.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                No pricing data yet &mdash; Strata scraper will populate this automatically
              </div>
            )}
          </div>
        </ChartCard>
      )}

      {viewMode === 'chart' && (
        <ChartCard
          title="Price Trends"
          subtitle={internal ? "Market prices over time by variety" : "Prices over time by variety"}
          insight={internal
            ? "Price trends reveal the direction of the market. Parallel lines mean varieties are moving together (macro-driven). Diverging lines suggest variety-specific demand shifts \u2014 Nonpareil premium may widen or narrow vs. other varieties. Time your purchases when lines are trending down and sell positions when they curve up."
            : "Price trends reveal direction by variety. Parallel lines mean varieties are moving together. Diverging lines suggest variety-specific demand shifts \u2014 Nonpareil premium may widen or narrow vs. other varieties. Consider timing orders when lines are trending down."}
        >
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
                    dataKey={internal ? v : `${v}_maxons`}
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

      {/* Phase C3: Compare view mode — variety × grade overlay + cross-tab */}
      {viewMode === 'compare' && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-white">Variety × Grade Compare</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick any set of varieties and grades to overlay their price history + see the latest cross-tab.
              Answer trader questions like "Nonpareil 23/25 vs 27/30" or "How is Butte tracking against Fritz this quarter?"
            </p>
          </div>

          <FilterBar
            label="Varieties"
            options={varieties.map(v => ({ value: v, label: v, color: VARIETY_COLORS[v] || COLORS.green }))}
            selected={comparedVarieties}
            onToggle={toggleVariety}
            quickActions={[
              { label: 'All', action: () => setComparedVarieties(varieties) },
              { label: 'Top 3', action: () => setComparedVarieties(varieties.slice(0, 3)) },
              { label: 'Clear', action: () => setComparedVarieties([]) },
            ]}
            emptyHint="Pick at least one variety"
          />

          {grades.length > 0 && (
            <FilterBar
              label="Grades"
              options={grades.map(g => ({ value: g, label: g }))}
              selected={comparedGrades}
              onToggle={toggleGrade}
              quickActions={[
                { label: 'All', action: () => setComparedGrades(grades) },
                { label: 'Clear', action: () => setComparedGrades([]) },
              ]}
              emptyHint="Empty = all grades included"
            />
          )}

          {/* Price history overlay */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Price history — {comparedVarieties.length} {comparedVarieties.length === 1 ? 'variety' : 'varieties'}
              {comparedGrades.length > 0 && comparedGrades.length < grades.length && ` × ${comparedGrades.length} grade${comparedGrades.length > 1 ? 's' : ''}`}
            </h4>
            {compareHistory.length > 0 && comparedVarieties.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={compareHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={v => [v != null ? `$${v.toFixed(4)}/lb` : 'N/A']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {comparedVarieties.map(v => (
                    <Line
                      key={v}
                      type="monotone"
                      dataKey={v}
                      stroke={VARIETY_COLORS[v] || COLORS.green}
                      name={v}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[360px] text-gray-600 text-sm border border-dashed border-gray-800 rounded">
                Pick at least one variety above to see the price history.
              </div>
            )}
          </div>

          {/* Latest cross-tab table */}
          {crossTable.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                Latest prices — cross-tab
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-400">Variety</th>
                      <th className="text-left py-2 px-3 text-gray-400">Grade</th>
                      <th className="text-left py-2 px-3 text-gray-400">Form</th>
                      {internal && <th className="text-right py-2 px-3 text-gray-400">Market $/lb</th>}
                      <th className="text-right py-2 px-3 text-green-400">{internal ? 'MAXONS $/lb' : '$/lb'}</th>
                      <th className="text-right py-2 px-3 text-gray-400">As of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossTable.map((p, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 px-3 text-white font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: VARIETY_COLORS[p.variety] || COLORS.green }} />
                            {p.variety}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-300">{p.grade || '—'}</td>
                        <td className="py-2 px-3 text-gray-300">{p.form || '—'}</td>
                        {internal && <td className="py-2 px-3 text-right text-white font-mono">${p.price_usd_per_lb?.toFixed(4)}</td>}
                        <td className="py-2 px-3 text-right text-green-400 font-mono">${p.maxons_price_per_lb?.toFixed(4)}</td>
                        <td className="py-2 px-3 text-right text-gray-500 font-mono">{p.price_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MAXONS Margin Info \u2014 INTERNAL ONLY.
          Information-walls rule: customers/suppliers/brokers never see cost basis,
          margin, or the source exchange. See src/lib/permissions.js. */}
      {internal && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <h3 className="text-sm font-medium text-green-400">MAXONS Pricing Policy</h3>
            <span className="ml-auto text-[10px] text-green-500/70 uppercase tracking-wide">Internal only</span>
          </div>
          <p className="text-xs text-gray-400">
            All prices include MAXONS 3% margin automatically applied. Market prices are sourced from
            Strata Markets (online.stratamarkets.com) and updated on each autonomous cycle.
            Formula: MAXONS Price = Market Price &times; 1.03
          </p>
        </div>
      )}
    </div>
  );
}
