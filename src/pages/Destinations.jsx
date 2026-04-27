import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toNum, normalizeCropYear } from '../lib/utils';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import FilterBar, { CROP_YEAR_COLORS } from '../components/FilterBar';
import MetricToggle from '../components/MetricToggle';
import Card from '../components/Card';
// W5 (2026-04-27): country picker switched from FilterBar (chips) to a
// search + autocomplete dropdown. User asked for "multi selection of
// countries with a drop down search and selection" multiple times — chips
// don't scale to 40+ countries.
import SearchableMultiSelect from '../components/SearchableMultiSelect';
import {
  CONTINENT_ORDER, CONTINENT_COLORS, continentOf,
  VOLUME_METRICS, getMetric, CONTAINER_LBS,
} from '../lib/continents';

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
    <Card title={title} subtitle={subtitle}>
      {children}
      {insight && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 leading-relaxed">{insight}</p>
        </div>
      )}
    </Card>
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
  const [comparedYears, setComparedYears] = useState([]);
  const [comparedCountries, setComparedCountries] = useState([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [displayLimitRank, setDisplayLimitRank] = useState(15);

  // 2026-04-24 overhaul: continent-aware hierarchy + multi-metric toggle.
  // Driven by user directive: "export destinations should be showing by
  // continent/country and should be navigateable in different metrics and
  // number of containers". The metric toggle re-paints every chart below
  // in a new unit without re-fetching data.
  const [selectedMetric, setSelectedMetric] = useState('lbs'); // lbs | containers | mt | kernels
  const [selectedContinents, setSelectedContinents] = useState([]); // empty = all continents

  const metric = getMetric(selectedMetric);

  useEffect(() => {
    async function load() {
      // Lift Supabase's silent 1000-row default — 45 countries × 12 months × 11 years
      // ≈ 5,940 rows; without .range() we silently truncate to ~3 visible crop years.
      const { data } = await supabase
        .from('abc_shipment_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true })
        .range(0, 49999);
      if (data) {
        const normalized = data.map(r => ({ ...r, crop_year: normalizeCropYear(r.crop_year) }));
        setShipments(normalized);
        const crops = [...new Set(normalized.map(r => r.crop_year))].sort();
        setSelectedCropYear(crops[crops.length - 1]);
        // Show every crop year by default — user can narrow via "Last 3 / 5 / All" quick actions.
        setComparedYears(crops);
      }
      setLoading(false);
    }
    load();
  }, []);

  const allCropYears = useMemo(() =>
    [...new Set(shipments.map(r => r.crop_year))].sort(),
    [shipments]
  );

  const exportDomesticSplit = useMemo(() => {
    const filtered = shipments.filter(r => r.crop_year === selectedCropYear);
    const exportTotal = filtered
      .filter(r => r.destination_region === 'export' && r.destination_country !== 'Total Export')
      .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    const domesticTotal = filtered
      .filter(r => r.destination_region === 'domestic')
      .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    return [
      { name: 'Export', value: exportTotal, color: COLORS.blue },
      { name: 'Domestic', value: domesticTotal, color: COLORS.green },
    ];
  }, [shipments, selectedCropYear]);

  // Full, unsliced per-country roll-up for the selected crop year.
  const allDestinationsSorted = useMemo(() => {
    const filtered = shipments.filter(
      r => r.crop_year === selectedCropYear &&
           r.destination_region === 'export' &&
           r.destination_country !== 'Total Export'
    );
    const byCountry = {};
    for (const r of filtered) {
      const c = r.destination_country;
      if (!byCountry[c]) byCountry[c] = { country: c, total: 0, months: 0, continent: continentOf(c) };
      byCountry[c].total += r.monthly_lbs || 0;
      byCountry[c].months++;
    }
    return Object.values(byCountry).sort((a, b) => b.total - a.total);
  }, [shipments, selectedCropYear]);

  // Continent roll-up: sum volume + country count per continent for the
  // selected crop year. This is the headline "show me the big picture first"
  // view the user asked for.
  const continentRollup = useMemo(() => {
    const byCont = {};
    for (const d of allDestinationsSorted) {
      if (!byCont[d.continent]) byCont[d.continent] = {
        continent: d.continent,
        total: 0,
        countries: 0,
        topCountry: null,
        topCountryTotal: 0,
      };
      byCont[d.continent].total += d.total;
      byCont[d.continent].countries++;
      if (d.total > byCont[d.continent].topCountryTotal) {
        byCont[d.continent].topCountry = d.country;
        byCont[d.continent].topCountryTotal = d.total;
      }
    }
    // Sort by CONTINENT_ORDER where defined, alpha otherwise
    return Object.values(byCont).sort((a, b) => {
      const ai = CONTINENT_ORDER.indexOf(a.continent);
      const bi = CONTINENT_ORDER.indexOf(b.continent);
      if (ai === -1 && bi === -1) return a.continent.localeCompare(b.continent);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [allDestinationsSorted]);

  // List of unique continents present in the current year (for filter UI)
  const continentsInData = useMemo(
    () => continentRollup.map(c => c.continent),
    [continentRollup]
  );

  // Destinations respecting the continent filter (if empty = show all).
  const destinationsInSelectedContinents = useMemo(() => {
    if (selectedContinents.length === 0) return allDestinationsSorted;
    const set = new Set(selectedContinents);
    return allDestinationsSorted.filter(d => set.has(d.continent));
  }, [allDestinationsSorted, selectedContinents]);

  const topDestinations = useMemo(
    () => destinationsInSelectedContinents.slice(0, displayLimitRank),
    [destinationsInSelectedContinents, displayLimitRank]
  );

  const searchedDestinations = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return destinationsInSelectedContinents;
    return destinationsInSelectedContinents.filter(d => d.country.toLowerCase().includes(q));
  }, [destinationsInSelectedContinents, countrySearch]);

  // Monthly flow driven by user's country picks (W5 — was hardcoded top-5).
  // Falls back to the top of `topDestinations` if nothing has been selected yet
  // so the chart still renders on first load before the seed-effect runs.
  const monthlyByDest = useMemo(() => {
    const picks = comparedCountries.length > 0
      ? comparedCountries
      : topDestinations.slice(0, 5).map(d => d.country);
    const filtered = shipments.filter(
      r => r.crop_year === selectedCropYear &&
           r.destination_region === 'export' &&
           picks.includes(r.destination_country)
    );
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label };
      for (const c of picks) {
        const r = filtered.find(rep => rep.report_month === month && rep.destination_country === c);
        row[c] = r?.monthly_lbs || 0;
      }
      return row;
    });
  }, [shipments, selectedCropYear, topDestinations, comparedCountries]);

  // Monthly flow grouped by CONTINENT (alternate view)
  const monthlyByContinent = useMemo(() => {
    const filtered = shipments.filter(
      r => r.crop_year === selectedCropYear &&
           r.destination_region === 'export' &&
           r.destination_country !== 'Total Export'
    );
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label };
      for (const cont of continentsInData) {
        row[cont] = 0;
      }
      for (const r of filtered) {
        if (r.report_month !== month) continue;
        const cont = continentOf(r.destination_country);
        if (selectedContinents.length > 0 && !selectedContinents.includes(cont)) continue;
        row[cont] = (row[cont] || 0) + (r.monthly_lbs || 0);
      }
      return row;
    });
  }, [shipments, selectedCropYear, continentsInData, selectedContinents]);

  const monthlyExpDom = useMemo(() => {
    const filtered = shipments.filter(r => r.crop_year === selectedCropYear);
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const monthData = filtered.filter(r => r.report_month === month);
      return {
        label,
        export: monthData
          .filter(r => r.destination_region === 'export' && r.destination_country !== 'Total Export')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0),
        domestic: monthData.filter(r => r.destination_region === 'domestic')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0),
      };
    });
  }, [shipments, selectedCropYear]);

  const yoyComparison = useMemo(() => {
    if (allCropYears.length < 2) return [];
    const currentCY = selectedCropYear;
    const prevIdx = allCropYears.indexOf(currentCY) - 1;
    if (prevIdx < 0) return [];
    const prevCY = allCropYears[prevIdx];

    const getTotal = (cy, country) => {
      return shipments
        .filter(r => r.crop_year === cy &&
                     r.destination_country === country &&
                     r.destination_country !== 'Total Export' &&
                     r.destination_region === 'export')
        .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
    };

    return topDestinations.map(d => {
      const current = getTotal(currentCY, d.country);
      const prior = getTotal(prevCY, d.country);
      const change = prior > 0 ? ((current - prior) / prior * 100) : 0;
      return { country: d.country, current, prior, change, continent: d.continent };
    });
  }, [shipments, selectedCropYear, topDestinations, allCropYears]);

  useEffect(() => {
    if (comparedCountries.length === 0 && allDestinationsSorted.length > 0) {
      setComparedCountries(allDestinationsSorted.slice(0, 5).map(d => d.country));
    }
  }, [allDestinationsSorted, comparedCountries.length]);

  const crossYearCountry = useMemo(() => {
    return comparedYears.map(cy => {
      const row = { crop_year: cy };
      for (const c of comparedCountries) {
        row[c] = shipments
          .filter(r => r.crop_year === cy &&
                       r.destination_country === c &&
                       r.destination_country !== 'Total Export' &&
                       r.destination_region === 'export')
          .reduce((s, r) => s + toNum(r.monthly_lbs), 0);
      }
      return row;
    });
  }, [shipments, comparedYears, comparedCountries]);

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
  const toggleContinent = (c) => setSelectedContinents(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

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
        <h2 className="text-2xl font-bold text-white mb-4">Destinations &amp; Trade Flow</h2>
        <Card padding="xl" className="text-center">
          <p className="text-gray-400 text-lg mb-2">No shipment data yet</p>
          <p className="text-gray-600 text-sm">Shipment data will be populated when ABC shipment reports are processed via the autonomous pipeline.</p>
        </Card>
      </div>
    );
  }

  // W5: chart layers respect the user's selection rather than hardcoded top 5.
  const flowCountries = comparedCountries.length > 0
    ? comparedCountries
    : topDestinations.slice(0, 5).map(d => d.country);

  const exportDestCSV = () => {
    const headers = ['Rank', 'Country', 'Continent', metric.csvLabel, 'Months Active', `Avg/Month (${metric.short})`, 'Share %'];
    const totalVol = allDestinationsSorted.reduce((s, d) => s + d.total, 0) || 1;
    const rows = allDestinationsSorted.map((d, i) => [
      i + 1,
      d.country,
      d.continent,
      metric.transform(d.total).toFixed(metric.key === 'lbs' ? 0 : 2),
      d.months,
      metric.transform(d.total / Math.max(d.months, 1)).toFixed(metric.key === 'lbs' ? 0 : 2),
      (d.total / totalVol * 100).toFixed(1)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cropsintel_destinations_${selectedCropYear?.replace('/', '-')}_${metric.key}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Destinations &amp; Trade Flow</h2>
          <p className="text-gray-500 text-sm mt-1">Export destinations grouped by continent, with drill-down to country &mdash; switch units to see volume, containers, or metric tons.</p>
        </div>
        <button
          onClick={exportDestCSV}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Export CSV ({metric.short})
        </button>
      </div>

      {/* Modeled data disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="text-amber-400 text-lg leading-none mt-0.5">&#x26A0;&#xFE0F;</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Modeled Destination Data</h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Country splits below are <strong>generated</strong> from real ABC position-report export totals using standard distribution shares (Spain ~12%, India ~11%, China/HK ~9%, Germany ~7%, UAE ~6%, etc.). Totals are accurate; the per-country split is a model, not an ABC Shipment Report PDF parse. Continent roll-ups aggregate the modeled country splits using the standard almond-trade regional buckets. Real per-country PDF scraping across 11 crop years is Phase B2 &mdash; tracking at cropsintel.com/map.
            </p>
          </div>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Start at the continent level to see where California almonds go in aggregate, then expand to the country level inside any continent you care about. Switch the <strong className="text-white">Metric</strong> toggle to see the same flow as container counts (40&prime; HC &asymp; {CONTAINER_LBS.toLocaleString()} lbs), metric tons, or raw pounds &mdash; useful for logistics planning and buyer conversations. Data covers {allCropYears.length} crop years with {shipments.length} destination-level records.
        </p>
      </div>

      {/* ── Global controls: Crop Year + Metric ── */}
      <Card padding="md" className="mb-6">
        <div className="flex flex-wrap items-start gap-6">
          {/* Crop Year Selector */}
          <div className="flex-1 min-w-[260px]">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block mb-2">Crop Year</span>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Metric Toggle */}
          <div className="min-w-[220px]">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block mb-2">Display Metric</span>
            <MetricToggle
              metrics={VOLUME_METRICS}
              value={selectedMetric}
              onChange={setSelectedMetric}
              label={null}
              compact
            />
          </div>
        </div>

        {/* Continent multi-select */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Continents {selectedContinents.length > 0 ? `(${selectedContinents.length} selected)` : '(all)'}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedContinents([])}
                className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 border border-gray-800 rounded"
              >
                All
              </button>
              <button
                onClick={() => setSelectedContinents(continentsInData.slice(0, 3))}
                className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 border border-gray-800 rounded"
              >
                Top 3
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {continentsInData.map(cont => {
              const active = selectedContinents.includes(cont);
              const color = CONTINENT_COLORS[cont] || '#888';
              const rollup = continentRollup.find(c => c.continent === cont);
              return (
                <button
                  key={cont}
                  onClick={() => toggleContinent(cont)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    active ? '' : 'bg-gray-800/50 text-gray-500 border-gray-800 hover:border-gray-600'
                  }`}
                  style={active ? {
                    backgroundColor: color + '20',
                    borderColor: color + '60',
                    color,
                  } : undefined}
                >
                  {cont}
                  {rollup && (
                    <span className="ml-2 text-[10px] opacity-70 font-mono">
                      {metric.formatter(rollup.total)} &middot; {rollup.countries}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── Continent rollup (hero chart) ── */}
      <div className="mb-6">
        <ChartCard
          title="Continent Rollup"
          subtitle={`${selectedCropYear} — where California almonds actually went, grouped by region`}
          insight="This is the big-picture view. Middle East + South Asia typically absorb ~40% of US exports; Europe ~25%; East Asia ~15%. When a continent's bar swings more than 15% year-on-year, it usually drags the whole pricing curve with it — the industry moves on the big buyers, not the small ones."
        >
          <ResponsiveContainer width="100%" height={Math.max(240, continentRollup.length * 38)}>
            <BarChart data={continentRollup} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
              <YAxis type="category" dataKey="continent" tick={{ fill: '#d1d5db', fontSize: 11 }} width={170} />
              <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
              <Bar dataKey="total" name="Volume" radius={[0, 4, 4, 0]}>
                {continentRollup.map((entry, i) => (
                  <Cell key={i} fill={CONTINENT_COLORS[entry.continent] || '#888'} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* W5: lifted slice(0, 8) — show every continent so the grid matches the chart. */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {continentRollup.map(c => (
              <div
                key={c.continent}
                className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5"
                style={{ borderLeftColor: CONTINENT_COLORS[c.continent] || '#888', borderLeftWidth: 3 }}
              >
                <p className="text-[10px] text-gray-500 uppercase tracking-wider truncate">{c.continent}</p>
                <p className="text-sm font-bold text-white mt-0.5">{metric.formatter(c.total)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {c.countries} {c.countries === 1 ? 'country' : 'countries'} &middot; top: {c.topCountry}
                </p>
              </div>
            ))}
          </div>
        </ChartCard>
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
                <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {exportDomesticSplit.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm text-white font-medium">{d.name}</span>
                  </div>
                  <p className="text-xs text-gray-400 ml-5">{metric.formatter(d.value)}</p>
                  <p className="text-xs text-gray-500 ml-5">
                    {((d.value / (exportDomesticSplit.reduce((s, x) => s + x.value, 0) || 1)) * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Monthly Export vs Domestic" subtitle={`${selectedCropYear} — monthly shipment trend`} insight="Monthly patterns reveal seasonal demand waves. Export shipments typically peak Oct–Dec as international buyers stock up for holiday seasons and Ramadan preparation. Domestic demand tends to be steadier. If export bars suddenly drop mid-season, it could signal trade disruption or currency headwinds.">
          {(() => {
            const monthsWithData = monthlyExpDom.filter(m => (m.export || 0) + (m.domestic || 0) > 0).length;
            const sparse = monthsWithData > 0 && monthsWithData < 6;
            return (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyExpDom}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
                    <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="export" name="Export" fill={COLORS.blue} fillOpacity={0.7} stackId="a" />
                    <Bar dataKey="domestic" name="Domestic" fill={COLORS.green} fillOpacity={0.7} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
                {sparse && (
                  <div className="mt-2 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2">
                    Only {monthsWithData} of 12 months have data for {selectedCropYear}. Modeled coverage is partial for this crop year &mdash; real ABC shipment PDFs fill in when Phase B2 scraper loop completes its next cycle.
                  </div>
                )}
                {monthsWithData === 0 && (
                  <div className="mt-2 text-[11px] text-gray-500 bg-gray-800/40 border border-gray-700/40 rounded-md px-3 py-2">
                    No monthly shipment data loaded yet for {selectedCropYear}.
                  </div>
                )}
              </>
            );
          })()}
        </ChartCard>
      </div>

      {/* Row 2: Country ranking + Monthly by Continent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard
          title={`Top Countries ${displayLimitRank < destinationsInSelectedContinents.length ? `(top ${displayLimitRank} of ${destinationsInSelectedContinents.length})` : `(all ${destinationsInSelectedContinents.length})`}`}
          subtitle={`${selectedCropYear}${selectedContinents.length ? ` — filtered to ${selectedContinents.join(', ')}` : ' — across all continents'}`}
          insight="These are the individual countries competing for California almonds. Colors match the continent palette above, so you can see at a glance whether the top-10 is concentrated in one region or genuinely global."
        >
          <div className="flex items-center gap-1.5 mb-2 text-[11px] flex-wrap">
            <span className="text-gray-500">Show:</span>
            {[10, 15, 25].map(n => (
              <button
                key={n}
                onClick={() => setDisplayLimitRank(n)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  displayLimitRank === n
                    ? 'bg-green-500/20 text-green-300 border-green-500/40'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                }`}
              >
                Top {n}
              </button>
            ))}
            <button
              onClick={() => setDisplayLimitRank(destinationsInSelectedContinents.length)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                displayLimitRank >= destinationsInSelectedContinents.length
                  ? 'bg-green-500/20 text-green-300 border-green-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
              }`}
            >
              All ({destinationsInSelectedContinents.length})
            </button>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(320, Math.min(displayLimitRank, destinationsInSelectedContinents.length) * 22)}>
            <BarChart data={topDestinations} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
              <YAxis type="category" dataKey="country" tick={{ fill: '#9ca3af', fontSize: 10 }} width={110} />
              <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
              <Bar dataKey="total" name="Volume" fillOpacity={0.75}>
                {topDestinations.map((d, i) => (
                  <Cell key={i} fill={CONTINENT_COLORS[d.continent] || DEST_COLORS[i % DEST_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly Flow by Continent"
          subtitle={`${selectedCropYear} — stacked continent shares per month`}
          insight="This view shows WHEN each continent buys. Middle East buying often front-loads August–October for the new crop; India's Diwali demand kicks in Sep–Nov; China is steadier. Watch for months where one continent's bar dominates — that's pricing pressure you can trade around."
        >
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={monthlyByContinent}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
              <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {(selectedContinents.length > 0 ? selectedContinents : continentsInData).map((cont) => (
                <Area
                  key={cont}
                  type="monotone"
                  dataKey={cont}
                  name={cont}
                  stroke={CONTINENT_COLORS[cont] || '#888'}
                  fill={CONTINENT_COLORS[cont] || '#888'}
                  fillOpacity={0.25}
                  strokeWidth={2}
                  stackId="1"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Monthly flow per selected country (W5: was hardcoded top-5) */}
      <div className="mb-6">
        <ChartCard
          title={`Monthly Flow — ${flowCountries.length} ${flowCountries.length === 1 ? 'Country' : 'Countries'}${selectedContinents.length ? ` in ${selectedContinents.join(', ')}` : ''}`}
          subtitle={`${selectedCropYear} — monthly exports per selected country (pick countries above to change)`}
          insight="Country-level cadence. If one country disappears mid-season while others keep buying, that's a specific signal (financing gap? policy change?) rather than a market-wide shift."
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyByDest}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
              <Tooltip content={<CustomTooltip formatter={metric.tooltipFormatter} />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {flowCountries.map((c, i) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  name={c}
                  stroke={DEST_COLORS[i % DEST_COLORS.length]}
                  fill={DEST_COLORS[i % DEST_COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  stackId="1"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: YoY Comparison Table */}
      {yoyComparison.length > 0 && (
        <div className="mb-6">
          <ChartCard title="Year-over-Year Comparison" subtitle={`${selectedCropYear} vs prior crop year — ${yoyComparison.length} destinations`} insight="YoY changes reveal which markets are expanding and which are contracting. Countries with strong positive growth are absorbing more supply, potentially supporting prices. Sharp declines may indicate economic issues, trade barriers, or competition from other origins like Australia or Spain.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400 text-xs">Destination</th>
                    <th className="text-left py-2 px-3 text-gray-400 text-xs">Continent</th>
                    <th className="text-right py-2 px-3 text-gray-400 text-xs">Current ({metric.short})</th>
                    <th className="text-right py-2 px-3 text-gray-400 text-xs">Prior ({metric.short})</th>
                    <th className="text-right py-2 px-3 text-gray-400 text-xs">Change</th>
                    <th className="text-left py-2 px-3 text-gray-400 text-xs w-32">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {yoyComparison.map((d, i) => (
                    <tr key={d.country} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CONTINENT_COLORS[d.continent] || DEST_COLORS[i % DEST_COLORS.length] }} />
                          <span className="text-white text-xs font-medium">{d.country}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-[11px]">{d.continent}</td>
                      <td className="py-2 px-3 text-right text-gray-300 text-xs font-mono">{metric.formatter(d.current)}</td>
                      <td className="py-2 px-3 text-right text-gray-500 text-xs font-mono">{metric.formatter(d.prior)}</td>
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
        </div>
      )}

      {/* Row 5: Full table */}
      <div className="mb-6">
        <ChartCard title="All Export Destinations" subtitle={`${selectedCropYear} — complete country breakdown${selectedContinents.length ? ` (filtered)` : ''}`} insight="The full table gives you the complete picture. Use the continent filter up top to narrow the list; use the search box below to jump to a specific country.">
          <div className="mb-3">
            <input
              type="text"
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              placeholder={`Search across ${destinationsInSelectedContinents.length} countries…`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">#</th>
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">Country</th>
                  <th className="text-left py-2 px-3 text-gray-400 text-xs">Continent</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">{metric.label}</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Months</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Avg/Month</th>
                  <th className="text-right py-2 px-3 text-gray-400 text-xs">Share</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const tableRows = countrySearch ? searchedDestinations : destinationsInSelectedContinents;
                  const totalExport = allDestinationsSorted.reduce((s, x) => s + x.total, 0);
                  const rankLookup = new Map(allDestinationsSorted.map((d, idx) => [d.country, idx + 1]));
                  return tableRows.map((d) => (
                    <tr key={d.country} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                      <td className="py-2 px-3 text-gray-600 text-xs">{rankLookup.get(d.country) ?? '—'}</td>
                      <td className="py-2 px-3">
                        <span className="text-white text-xs font-medium">{d.country}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-[11px]" style={{ color: CONTINENT_COLORS[d.continent] || '#888' }}>
                          {d.continent}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-blue-400 text-xs font-mono">{metric.formatter(d.total)}</td>
                      <td className="py-2 px-3 text-right text-gray-500 text-xs">{d.months}</td>
                      <td className="py-2 px-3 text-right text-gray-300 text-xs font-mono">{metric.formatter(d.total / Math.max(d.months, 1))}</td>
                      <td className="py-2 px-3 text-right text-amber-400 text-xs">{(d.total / Math.max(totalExport, 1) * 100).toFixed(1)}%</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* Cross-Year × Country Compare */}
      <div className="mt-6">
        <Card
          title="Cross-Year × Country Compare"
          subtitle='Pick any set of crop years and any set of countries to overlay — "India in 2023/24 vs 2024/25", "Spain vs UAE across 5 years", etc.'
        >
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

          {/* W5: SearchableMultiSelect — type to filter the full country
              list (40+), Enter or click to add as a chip. Replaces the
              chip-only FilterBar that didn't scale. The dropdown shows the
              continent as `meta` so users picking "India" can quickly tell
              it's Asia at a glance. */}
          <SearchableMultiSelect
            label={`Countries to compare${selectedContinents.length ? ` (filtered to ${selectedContinents.join(', ')})` : ''}`}
            placeholder={`Type to search across ${destinationsInSelectedContinents.length} countries…`}
            options={destinationsInSelectedContinents.map((d, i) => ({
              value: d.country,
              label: d.country,
              meta: d.continent,
              color: CONTINENT_COLORS[d.continent] || DEST_COLORS[i % DEST_COLORS.length],
            }))}
            selected={comparedCountries}
            onChange={setComparedCountries}
            quickActions={[
              { label: 'Top 5',  action: () => setComparedCountries(destinationsInSelectedContinents.slice(0, 5).map(d => d.country)) },
              { label: 'Top 10', action: () => setComparedCountries(destinationsInSelectedContinents.slice(0, 10).map(d => d.country)) },
              { label: 'Top 20', action: () => setComparedCountries(destinationsInSelectedContinents.slice(0, 20).map(d => d.country)) },
              { label: 'All',    action: () => setComparedCountries(destinationsInSelectedContinents.map(d => d.country)) },
            ]}
            emptyHint="Pick at least one country to overlay on the chart"
          />

          {comparedYears.length > 0 && comparedCountries.length > 0 ? (
            <>
              <div className="mt-5">
                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  {metric.label} by country &times; year
                </h4>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={crossYearCountry}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="crop_year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={metric.tickFormatter} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={metric.tooltipFormatter}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {comparedCountries.map((c, i) => {
                      const cont = continentOf(c);
                      const color = CONTINENT_COLORS[cont] || DEST_COLORS[i % DEST_COLORS.length];
                      return <Bar key={c} dataKey={c} name={c} fill={color} fillOpacity={0.8} />;
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-5 overflow-x-auto">
                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
                  Rank + total per year ({metric.label})
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
                                  <span className="text-blue-400 font-mono">{metric.formatter(total)}</span>
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
        </Card>
      </div>
    </div>
  );
}
