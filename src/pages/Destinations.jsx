import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981', rose: '#f43f5e'
};

const DEST_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#10b981', '#f43f5e', '#6366f1', '#8b5cf6',
  '#14b8a6', '#eab308', '#f97316', '#ec4899', '#84cc16'
];

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
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

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('abc_shipment_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });
      if (data) {
        setShipments(data);
        const crops = [...new Set(data.map(r => r.crop_year))].sort();
        setSelectedCropYear(crops[crops.length - 1]);
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
      .reduce((s, r) => s + (r.monthly_lbs || 0), 0);
    const domesticTotal = filtered
      .filter(r => r.destination_region === 'domestic')
      .reduce((s, r) => s + (r.monthly_lbs || 0), 0);
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
          .reduce((s, r) => s + (r.monthly_lbs || 0), 0),
        domestic: monthData.filter(r => r.destination_region === 'domestic')
          .reduce((s, r) => s + (r.monthly_lbs || 0), 0),
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
        .reduce((s, r) => s + (r.monthly_lbs || 0), 0);
    };

    return topDestinations.slice(0, 10).map(d => {
      const current = getTotal(currentCY, d.country);
      const prior = getTotal(prevCY, d.country);
      const change = prior > 0 ? ((current - prior) / prior * 100) : 0;
      return { country: d.country, current, prior, change };
    });
  }, [shipments, selectedCropYear, topDestinations, allCropYears]);

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

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Destinations & Trade Flow</h2>
        <p className="text-gray-500 text-sm mt-1">Export destinations, domestic vs international split, and country-level trends</p>
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
        <ChartCard title="Export vs Domestic" subtitle={`${selectedCropYear} — total shipment volume split`}>
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

        <ChartCard title="Monthly Export vs Domestic" subtitle={`${selectedCropYear} — monthly shipment trend`}>
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
        <ChartCard title="Top Export Destinations" subtitle={`${selectedCropYear} — by total volume`}>
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

        <ChartCard title="Monthly Flow — Top 5 Destinations" subtitle={`${selectedCropYear} — monthly exports by country`}>
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
        <ChartCard title="Year-over-Year Comparison" subtitle={`${selectedCropYear} vs prior crop year — top export destinations`}>
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
        <ChartCard title="All Export Destinations" subtitle={`${selectedCropYear} — complete country breakdown`}>
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
    </div>
  );
}
