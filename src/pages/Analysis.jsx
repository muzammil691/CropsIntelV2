import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981', rose: '#f43f5e'
};

const CROP_COLORS = {
  '2016/2017': '#6366f1', '2017/2018': '#8b5cf6', '2018/2019': '#a855f7',
  '2019/2020': '#06b6d4', '2020/2021': '#14b8a6', '2021/2022': '#22c55e',
  '2022/2023': '#eab308', '2023/2024': '#f97316', '2024/2025': '#ef4444',
};

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
        <p key={i} style={{ color: p.color || p.stroke || COLORS.green }}>
          {p.name}: {formatter ? formatter(p.value) : (p.value / 1e6).toFixed(0) + 'M lbs'}
        </p>
      ))}
    </div>
  );
}

export default function Analysis() {
  const [reports, setReports] = useState([]);
  const [selectedCrops, setSelectedCrops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });
      if (data) {
        setReports(data);
        // Default: show last 3 crop years
        const crops = [...new Set(data.map(r => r.crop_year))].sort();
        setSelectedCrops(crops.slice(-3));
      }
      setLoading(false);
    }
    load();
  }, []);

  const allCropYears = useMemo(() =>
    [...new Set(reports.map(r => r.crop_year))].sort(),
    [reports]
  );

  const toggleCrop = (cy) => {
    setSelectedCrops(prev =>
      prev.includes(cy) ? prev.filter(c => c !== cy) : [...prev, cy]
    );
  };

  // Monthly trend data (all time)
  const monthlyTrend = useMemo(() =>
    reports.map(r => ({
      label: `${r.report_year}/${String(r.report_month).padStart(2, '0')}`,
      totalShipped: r.total_shipped_lbs,
      domShipped: r.domestic_shipped_lbs,
      expShipped: r.export_shipped_lbs,
      committed: r.total_committed_lbs,
      uncommitted: r.uncommitted_lbs,
      supply: r.total_supply_lbs,
      newCommit: r.total_new_commitments_lbs,
    })),
    [reports]
  );

  // Crop year comparison (months 1-12 of crop year)
  const cropComparison = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    const months = monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1; // Aug=8, Sep=9, ... Jul=7
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r) {
          row[`ship_${cy}`] = r.total_shipped_lbs;
          row[`commit_${cy}`] = r.total_committed_lbs;
          row[`uncommit_${cy}`] = r.uncommitted_lbs;
          row[`supply_${cy}`] = r.total_supply_lbs;
          row[`newcommit_${cy}`] = r.total_new_commitments_lbs;
        }
      }
      return row;
    });
    return months;
  }, [reports, selectedCrops]);

  // Crop year summary stats
  const cropSummaries = useMemo(() => {
    return allCropYears.map(cy => {
      const cyReports = reports.filter(r => r.crop_year === cy);
      const last = cyReports[cyReports.length - 1];
      const totalShipped = cyReports.reduce((s, r) => s + (r.total_shipped_lbs || 0), 0);
      return {
        cropYear: cy,
        supply: last?.total_supply_lbs || 0,
        carryIn: last?.carry_in_lbs || 0,
        receipts: last?.receipts_lbs || 0,
        totalShipped,
        avgMonthlyShip: totalShipped / cyReports.length,
        peakShip: Math.max(...cyReports.map(r => r.total_shipped_lbs || 0)),
        months: cyReports.length,
      };
    });
  }, [reports, allCropYears]);

  // Export ratio over time
  const exportRatio = useMemo(() =>
    reports.map(r => ({
      label: `${r.report_year}/${String(r.report_month).padStart(2, '0')}`,
      exportPct: r.total_shipped_lbs > 0 ? (r.export_shipped_lbs / r.total_shipped_lbs * 100) : 0,
      domesticPct: r.total_shipped_lbs > 0 ? (r.domestic_shipped_lbs / r.total_shipped_lbs * 100) : 0,
    })),
    [reports]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Market Analysis</h2>
        <p className="text-gray-500 text-sm mt-1">10-year almond industry trends and crop year comparisons</p>
      </div>

      {/* Crop Year Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {allCropYears.map(cy => (
          <button
            key={cy}
            onClick={() => toggleCrop(cy)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedCrops.includes(cy)
                ? 'text-white border'
                : 'bg-gray-800/50 text-gray-500 border border-gray-800 hover:border-gray-600'
            }`}
            style={selectedCrops.includes(cy) ? {
              backgroundColor: (CROP_COLORS[cy] || '#888') + '20',
              borderColor: (CROP_COLORS[cy] || '#888') + '60',
              color: CROP_COLORS[cy] || '#888'
            } : undefined}
          >
            {cy}
          </button>
        ))}
        <button
          onClick={() => setSelectedCrops(allCropYears)}
          className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-800 hover:border-gray-600"
        >
          All
        </button>
        <button
          onClick={() => setSelectedCrops(allCropYears.slice(-3))}
          className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-800 hover:border-gray-600"
        >
          Last 3
        </button>
      </div>

      {/* Row 1: Shipment Comparison + Supply Over Crop Years */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Shipments by Crop Year" subtitle="Monthly total shipments overlaid by crop year">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cropComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`ship_${cy}`}
                  name={cy}
                  stroke={CROP_COLORS[cy] || '#888'}
                  strokeWidth={cy === allCropYears[allCropYears.length - 1] ? 3 : 1.5}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="New Commitments by Crop Year" subtitle="Monthly new sales commitments">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cropComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`newcommit_${cy}`}
                  name={cy}
                  stroke={CROP_COLORS[cy] || '#888'}
                  strokeWidth={cy === allCropYears[allCropYears.length - 1] ? 3 : 1.5}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Uncommitted Trend + Export vs Domestic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Uncommitted Inventory" subtitle="Available inventory by crop year month">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={cropComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              {selectedCrops.map(cy => (
                <Area
                  key={cy}
                  type="monotone"
                  dataKey={`uncommit_${cy}`}
                  name={cy}
                  stroke={CROP_COLORS[cy] || '#888'}
                  fill={CROP_COLORS[cy] || '#888'}
                  fillOpacity={0.1}
                  strokeWidth={cy === allCropYears[allCropYears.length - 1] ? 2 : 1}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Export vs Domestic Ratio" subtitle="Export share of total shipments over time">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={exportRatio}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                interval={11}
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(1) + '%'} />} />
              <Area type="monotone" dataKey="exportPct" name="Export" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.3} stackId="1" />
              <Area type="monotone" dataKey="domesticPct" name="Domestic" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.3} stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Full timeline shipments + committed */}
      <div className="mb-6">
        <ChartCard title="10-Year Shipment & Commitment Trend" subtitle="Monthly shipments vs outstanding commitments across all crop years">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                interval={11}
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="totalShipped" name="Total Shipped" fill={COLORS.green} fillOpacity={0.6} />
              <Line type="monotone" dataKey="committed" name="Committed" stroke={COLORS.blue} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="uncommitted" name="Uncommitted" stroke={COLORS.amber} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: Crop Year Summary Table */}
      <ChartCard title="Crop Year Summary" subtitle="Key metrics by crop year">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 text-gray-400 text-xs">Crop Year</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Total Supply</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Carry-In</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Receipts</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Cum. Shipped</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Avg Ship/Mo</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Peak Ship</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Months</th>
              </tr>
            </thead>
            <tbody>
              {cropSummaries.map((cs, i) => {
                const prev = cropSummaries[i - 1];
                const supplyDelta = prev ? ((cs.supply - prev.supply) / prev.supply * 100).toFixed(1) : null;
                return (
                  <tr key={cs.cropYear} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: CROP_COLORS[cs.cropYear] || '#888' }} />
                      <span className="text-white text-xs font-medium">{cs.cropYear}</span>
                    </td>
                    <td className="py-2 px-3 text-right text-green-400 text-xs">
                      {(cs.supply / 1e9).toFixed(2)}B
                      {supplyDelta && (
                        <span className={`ml-1 ${supplyDelta > 0 ? 'text-green-600' : 'text-red-400'} text-[10px]`}>
                          {supplyDelta > 0 ? '+' : ''}{supplyDelta}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400 text-xs">{(cs.carryIn / 1e6).toFixed(0)}M</td>
                    <td className="py-2 px-3 text-right text-gray-300 text-xs">{(cs.receipts / 1e9).toFixed(2)}B</td>
                    <td className="py-2 px-3 text-right text-white text-xs">{(cs.totalShipped / 1e9).toFixed(2)}B</td>
                    <td className="py-2 px-3 text-right text-gray-300 text-xs">{(cs.avgMonthlyShip / 1e6).toFixed(0)}M</td>
                    <td className="py-2 px-3 text-right text-amber-400 text-xs">{(cs.peakShip / 1e6).toFixed(0)}M</td>
                    <td className="py-2 px-3 text-right text-gray-500 text-xs">{cs.months}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
