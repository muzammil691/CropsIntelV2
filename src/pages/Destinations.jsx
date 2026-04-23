import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toNum, normalizeCropYear } from '../lib/utils';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import FilterBar, { CROP_YEAR_COLORS } from '../components/FilterBar';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981', rose: '#f43f5e'
};

const DEST_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#10b981', '#f43f5e', '#6366f1', '#8b5cf6',
  '#14b8a6', '#eab308', '#f97316', '#ec4899', '#84cc16'
];

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

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill || p.stroke || COLORS.green }}>
          {p.name}: {formatter ? formatter(p.value) : (p.value / 1e6).toFixed(1) + 'M lbs'}
        </p>
      ))}
    </div>
  );
}

export default function Destinations() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCropYear, setSelectedCropYear] = useState(null);
  // Phase C2 compare-mode state: multi-year + multi-country overlay
  const [comparedYears, setComparedYears] = useState([]);
  const [comparedCountries, setComparedCountries] = useState([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('abc_shipment_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });
      if (data) {
        // Launch L1 F6 fix: collapse mixed crop_year formats (the DB had
        // both "2016/17" and "2016/2017" from different writers). Normalize
        // every row at read-time so chips + filters see one format only.
        const normalized = data.map(r => ({ ...r, crop_year: normalizeCropYear(r.crop_year) }));
        setShipments(normalized);
        const crops = [...new Set(normalized.map(r => r.crop_year))].sort();
        setSelectedCropYear(crops[crops.length - 1]);
        setComparedYears(crops.slice(-3));
      }
      setLoading(false);
    }
    load();
  }, []);

  const allCropYears = useMemo(() =>
    [...new Set(shipments.map(r => r.crop_year))].sort(),
    [shipments]
  );

  // Export vs Domestic split for selected crop year
  const exportDomesticSplit = useMemo(() => {
    const filtered = shipments.filter(r => r.crop_year === selectedCropYear);
    const exportTotal = filtered
      .filter(r => r.destination_region === 'export')
      .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    const domesticTotal = filtered
      .filter(r => r.destination_region === 'domestic')
      .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    return [
      { name: 'Export', value: exportTotal, color: COLORS.blue },
      { name: 'Domestic', value: domesticTotal, color: COLORS.green },
    ];
  }, [shipments, selectedCropYear]);

  // Top export destinations for selected crop year
  const topDestinations = useMemo(() => {
    const filtered = shipments.filter(
      r => r.crop_year === selectedCropYear &&
           r.destination_region === 'export' &&
           r.destination_country !== 'Total Export'
    );
    const byCountry = {};
    for (const r of filtered) {
      const c = r.destination_country;
      if (!byCountry[c]) byCountry[c] = { country: c, total: 0, months: 0 };
      byCountry[c].total += r.monthly_lbs || 0;
      byCountry[c].months++;
    }
    return Object.values(byCountry)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [shipments, selectedCropYear]);

  // Monthly export trend by top 5 destinations
  const monthlyByDest = useMemo(() => {
    const top5 = topDestinations.slice(0, 5).map(d => d.country);
    const filtered = shipments.filter(
      r => r.crop_year === selectedCropYear &&
           r.destination_region === 'export' &&
           top5.includes(r.destination_country)
    );

    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label };
      for (const c of top5) {
        const r = filtered.find(rep => rep.report_month === month && rep.destination_country === c);
        row[c] = r?.monthly_lbs || 0;
      }
      return row;
    });
  }, [shipments, selectedCropYear, topDestinations]);

  // Export vs Domestic monthly trend
  const monthlyExpDom = useMemo(() => {
    const filtered = shipments.filter(r => r.crop_year === selectedCropYear);
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const monthData = filtered.filter(r => r.report_month === month);
      return {
        label,
        export: monthData.filter(r => r.destination_region === 'export' && r.destination_country === 'Total Export')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0),
        domestic: monthData.filter(r => r.destination_region === 'domestic')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0),
      };
    });
  }, [shipments, selectedCropYear]);

  // Year-over-year comparison for top destinations
  const yoyComparison = useMemo(() => {
    if (allCropYears.length < 2) return [];
    const currentCY = selectedCropYear;
    const prevIdx = allCropYears.indexOf(currentCY) - 1;
    if (prevIdx < 0) return [];
    const prevCY = allCropYears[prevIdx];

    const getTotal = (cy, country) => {
      return shipments
        .filter(r => r.crop_year === cy && r.destination_country === country && r.destination_region === 'export')
        .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    };

    return topDestinations.slice(0, 10).map(d => {
      const current = getTotal(currentCY, d.country);
      const prior = getTotal(prevCY, d.country);
      const change = prior > 0 ? ((current - prior) / prior * 100) : 0;
      return { country: d.country, current, prior, change };
    });
  }, [shipments, selectedCropYear, topDestinations, allCropYears]);

  // Phase C2: initialize comparedCountries to top 5 once data is loaded
  useEffect(() => {
    if (comparedCountries.length === 0 && topDestinations.length > 0) {
      setComparedCountries(topDestinations.slice(0, 5).map(d => d.country));
    }
  }, [topDestinations, comparedCountries.length]);

  // Phase C2: cross-year × country compare — one row per crop year with a
  // column per selected country (total export lbs for that year/country).
  const crossYearCountry = useMemo(() => {
    return comparedYears.map(cy => {
      const row = { crop_year: cy };
      for (const c of comparedCountries) {
        row[c] = shipments
          .filter(r => r.crop_year === cy && r.destination_country === c && r.destination_region === 'export')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
      }
      return row;
    });
  }, [shipments, comparedYears, comparedCountries]);

  // Phase C2: rankings table — for each selected country, its total + rank in each selected year
  const compareRankings = useMemo(() => {
    return comparedCountries.map(country => {
      const row = { country };
      for (const cy of comparedYears) {
        const yearDests = shipments
          .filter(r => r.crop_year === cy && r.destination_region === 'export' && r.destination_country !== 'Total Export');
        const byCountry = {};
        for (const r of yearDests) {
          byCountry[r.destination_country] = (byCountry[r.destination_country] || 0) + (r.monthly_lbs || 0);
        }
        const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(([c]) => c === country) + 1;
        const total = byCountry[country] || 0;
        row[`rank_${cy}`] = rank || null;
        row[`total_${cy}`] = total;
      }
      return row;
    });
  }, [shipments, comparedYears, comparedCountries]);

  const toggleYear = (y) => setComparedYears(p => p.includes(y) ? p.filter(x => x !== y) : [...p, y]);
  const toggleCountry = (c) => setComparedCountries(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (shipments.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl">
        <h2 className="text-2xl font-bold text-white mb-4">Destinations & Trade Flow</h2>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No shipment data yet</p>
          <p className="text-gray-600 text-sm">Shipment data will be populated when ABC shipment reports are processed via the autonomous pipeline.</p>
        </div>
      </div>
    );
  }

  const top5Countries = topDestinations.slice(0, 5).map(d => d.country);

  const exportDestCSV = () => {
    const headers = ['Rank', 'Country', 'Total Volume (lbs)', 'Months Active', 'Avg/Month', 'Share %'];
    const totalVol = topDestinations.reduce((s, d) => s + d.total, 0);
    const rows = topDestinations.map((d, i) => [
      i + 1, d.country, d.total, d.months, Math.round(d.total / d.months), (d.total / totalVol * 100).toFixed(1)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cropsintel_destinations_${selectedCropYear?.replace('/', '-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Destinations & Trade Flow</h2>
          <p className="text-gray-500 text-sm mt-1">Export destinations, domestic vs international split, and country-level trends</p>
        </div>
        <button
          onClick={exportDestCSV}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Modeled data disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="text-amber-400 text-lg leading-none mt-0.5">⚠️</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Modeled Destination Data</h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              The country splits below are <strong>modeled</strong> from ABC position-report export totals using standard distribution shares (Spain ~12%, India ~11%, China/HK ~9%, Germany ~7%, UAE ~6%, etc.). They are <em>not</em> yet populated from real ABC Shipment Report PDFs.
              Real PDF scraping across all 11 crop years × 45 destinations is Phase B2 of the current sprint — live tracking at cropsintel.com/map.
            </p>
          </div>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          This page maps where California almonds go after leaving the handler. Understanding destination flows helps traders identify growing markets, spot demand shifts, and time offers to buyers in specific regions.
          Select a crop year to see that year's trade flow breakdown. Data covers {allCropYears.length} crop years with {shipments.length} destination-level records (currently modeled; real ABC Shipment PDFs are Phase B2).
        </p>
      </div>

      {/* Crop Year Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {allCropYears.map(cy => (
          <button
            key={cy}
            onClick={() => setSelectedCropYear(cy)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedCropYear === cy
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-800/50 text-gray-500 border border-gray-800 hover:border-gray-600'
            }`}
          >
            {cy}
          </button>
        ))}
      </div>

      {/* Row 1: Export/Domestic Pie + Monthly Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Export vs Domestic" subtitle={`${selectedCropYear} — total shipment volume split`} insight="The export/domestic split tells you where the industry's revenue center of gravity lies. When exports dominate, international pricing dynamics and shipping logistics matter more. For MAXONS as an international trader, a higher export share means more competitive supply flowing into your buying channels.">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie
                  data={exportDomesticSplit}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {exportDomesticSplit.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {exportDomesticSplit.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm text-white font-medium">{d.name}</span>
                  </div>
                  <p className="text-xs text-gray-400 ml-5">{(d.value / 1e6).toFixed(0)}M lbs</p>
                  <p className="text-xs text-gray-500 ml-5">
                    {((d.value / (exportDomesticSplit.reduce((s, x) => s + x.value, 0) || 1)) * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Monthly Export vs Domestic" subtitle={`${selectedCropYear} — monthly shipment trend`} insight="Monthly patterns reveal seasonal demand waves. Export shipments typically peak Oct-Dec as international buyers stock up for holiday seasons and Ramadan preparation. Domestic demand tends to be steadier. If export bars suddenly drop mid-season, it could signal trade disruption or currency headwinds.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyExpDom}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="export" name="Export" fill={COLORS.blue} fillOpacity={0.7} stackId="a" />
              <Bar dataKey="domestic" name="Domestic" fill={COLORS.green} fillOpacity={0.7} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Top Destinations Bar + Monthly by Destination */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Top Export Destinations" subtitle={`${selectedCropYear} — by total volume`} insight="These are your competitors' customers. The ranking shows which countries are the biggest buyers. India, Spain, and Germany consistently lead, but shifts in the rankings signal new opportunities. A country climbing the list may be worth pursuing before prices firm up in that market.">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topDestinations} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <YAxis type="category" dataKey="country" tick={{ fill: '#9ca3af', fontSize: 10 }} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Volume" fill={COLORS.blue} fillOpacity={0.7}>
                {topDestinations.map((_, i) => (
                  <Cell key={i} fill={DEST_COLORS[i % DEST_COLORS.length]} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Flow — Top 5 Destinations" subtitle={`${selectedCropYear} — monthly exports by country`} insight="This stacked view shows the rhythm of each major market. India often has strong early-season buying, while European markets may peak later. Watch for months where a single country dominates the flow, as that concentration can create pricing pressure.">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={monthlyByDest}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {top5Countries.map((c, i) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  name={c}
                  stroke={DEST_COLORS[i]}
                  fill={DEST_COLORS[i]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  stackId="1"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: YoY Comparison Table */}
      {yoyComparison.length > 0 && (
        <ChartCard title="Year-over-Year Comparison" subtitle={`${selectedCropYear} vs prior crop year — top export destinations`} insight="Year-over-year changes reveal which markets are expanding and which are contracting. Countries with strong positive growth are absorbing more supply, potentially supporting prices. Sharp declines may indicate economic issues, trade barriers, or competition from other origins like Australia or Spain.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">Destination</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Current CY</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Prior CY</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Change</th>
                  <th className="text-left py-2 px-3 text-gray-400 text-xs w-32">Trend</th>
                </tr>
              </thead>
              <tbody>
                {yoyComparison.map((d, i) => (
                  <tr key={d.country} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEST_COLORS[i % DEST_COLORS.length] }} />
                        <span className="text-white text-xs font-medium">{d.country}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300 text-xs">{(d.current / 1e6).toFixed(1)}M</td>
                    <td className="py-2 px-3 text-right text-gray-500 text-xs">{(d.prior / 1e6).toFixed(1)}M</td>
                    <td className={`py-2 px-3 text-right text-xs font-medium ${d.change > 0 ? 'text-green-400' : d.change < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {d.change > 0 ? '+' : ''}{d.change.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3">
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${d.change > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(Math.abs(d.change), 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* Full Destinations Table */}
      <div className="mt-6">
        <ChartCard title="All Export Destinations" subtitle={`${selectedCropYear} — complete country breakdown`} insight="The full table gives you the complete picture. Countries with high share but few active months may be bulk seasonal buyers. Countries with consistent monthly presence are steady demand anchors. Use this to find underserved markets where MAXONS could build relationships.">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">#</th>
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">Country</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Total Volume</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Months</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Avg/Month</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Share</th>
                </tr>
              </thead>
              <tbody>
                {topDestinations.map((d, i) => {
                  const totalExport = topDestinations.reduce((s, x) => s + x.total, 0);
                  return (
                    <tr key={d.country} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-2 px-3 text-gray-600 text-xs">{i + 1}</td>
                      <td className="py-2 px-3">
                        <span className="text-white text-xs font-medium">{d.country}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-blue-400 text-xs">{(d.total / 1e6).toFixed(1)}M</td>
                      <td className="py-2 px-3 text-right text-gray-500 text-xs">{d.months}</td>
                      <td className="py-2 px-3 text-right text-gray-300 text-xs">{(d.total / d.months / 1e6).toFixed(1)}M</td>
                      <td className="py-2 px-3 text-right text-amber-400 text-xs">{(d.total / totalExport * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* ─── Phase C2: Cross-Year × Country Compare ─── */}
      <div className="mt-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Cross-Year × Country Compare</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick any set of crop years and any set of countries to overlay — answer trader questions like "India in 2023/24 vs 2024/25" or "Spain vs UAE across the last 5 years" directly.
            </p>
          </div>

          <FilterBar
            label="Crop years to compare"
            options={allCropYears.map(y => ({ value: y, label: y, color: CROP_YEAR_COLORS[y] }))}
            selected={comparedYears}
            onToggle={toggleYear}
            quickActions={[
              { label: 'All', action: () => setComparedYears(allCropYears) },
              { label: 'Last 3', action: () => setComparedYears(allCropYears.slice(-3)) },
              { label: 'Last 5', action: () => setComparedYears(allCropYears.slice(-5)) },
              { label: 'Clear', action: () => setComparedYears([]) },
            ]}
            emptyHint="Pick at least one year"
          />

          <FilterBar
            label="Countries to compare"
            options={topDestinations.slice(0, 15).map((d, i) => ({
              value: d.country,
              label: d.country,
              color: DEST_COLORS[i % DEST_COLORS.length],
            }))}
            selected={comparedCountries}
            onToggle={toggleCountry}
            quickActions={[
              { label: 'Top 5', action: () => setComparedCountries(topDestinations.slice(0, 5).map(d => d.country)) },
              { label: 'Top 10', action: () => setComparedCountries(topDestinations.slice(0, 10).map(d => d.country)) },
              { label: 'Clear', action: () => setComparedCountries([]) },
            ]}
            emptyHint="Pick at least one country"
          />

          {comparedYears.length > 0 && comparedCountries.length > 0 ? (
            <>
              {/* Grouped bar: countries × years */}
              <div className="mt-5">
                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  Export volume by country × year
                </h4>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={crossYearCountry}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="crop_year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={v => `${(v / 1e6).toFixed(1)}M lbs`}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {comparedCountries.map((c, i) => (
                      <Bar key={c} dataKey={c} name={c} fill={DEST_COLORS[topDestinations.findIndex(d => d.country === c) % DEST_COLORS.length] || '#3b82f6'} fillOpacity={0.8} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rankings table */}
              <div className="mt-5 overflow-x-auto">
                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  Rank + total per year
                </h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-400">Country</th>
                      {comparedYears.map(cy => (
                        <th key={cy} className="text-right py-2 px-3 text-gray-400">{cy}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRankings.map(r => (
                      <tr key={r.country} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-2 px-3 text-white font-medium">{r.country}</td>
                        {comparedYears.map(cy => {
                          const rank = r[`rank_${cy}`];
                          const total = r[`total_${cy}`];
                          return (
                            <td key={cy} className="py-2 px-3 text-right">
                              {total > 0 ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="text-[9px] text-gray-500 font-mono bg-gray-800 px-1.5 py-0.5 rounded">#{rank}</span>
                                  <span className="text-blue-400 font-mono">{(total / 1e6).toFixed(1)}M</span>
                                </span>
                              ) : (
                                <span className="text-gray-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-5 flex items-center justify-center h-32 border border-dashed border-gray-800 rounded text-xs text-gray-600">
              Pick at least one crop year AND one country above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
