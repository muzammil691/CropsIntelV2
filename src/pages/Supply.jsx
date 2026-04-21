import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toNum } from '../lib/utils';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, ReferenceLine
} from 'recharts';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981', rose: '#f43f5e'
};

const CROP_COLORS = {
  '2015/16': '#4f46e5', '2016/17': '#6366f1', '2017/18': '#8b5cf6', '2018/19': '#a855f7',
  '2019/20': '#06b6d4', '2020/21': '#14b8a6', '2021/22': '#22c55e',
  '2022/23': '#eab308', '2023/24': '#f97316', '2024/25': '#ef4444',
  '2025/26': '#3b82f6',
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

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke || COLORS.green }}>
          {p.name}: {formatter ? formatter(p.value) : p.value != null ? (p.value / 1e6).toFixed(0) + 'M lbs' : 'N/A'}
        </p>
      ))}
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon, color = 'green' }) {
  const colors = {
    green: 'border-green-500/20 bg-green-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    cyan: 'border-cyan-500/20 bg-cyan-500/5',
  };
  const textColors = {
    green: 'text-green-400', blue: 'text-blue-400', amber: 'text-amber-400',
    red: 'text-red-400', purple: 'text-purple-400', cyan: 'text-cyan-400',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <p className={`text-xl font-bold ${textColors[color]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export default function Supply() {
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

  // Key metrics from latest report
  const latestMetrics = useMemo(() => {
    if (!reports.length) return null;
    const latest = reports[reports.length - 1];
    const supply = toNum(latest.total_supply_lbs);
    const committed = toNum(latest.total_committed_lbs);
    const uncommitted = toNum(latest.uncommitted_lbs);
    const shipped = toNum(latest.total_shipped_lbs);
    const newCommitments = toNum(latest.total_new_commitments_lbs);
    const commitRate = supply > 0 ? ((committed / supply) * 100).toFixed(1) : 0;
    const shipRate = supply > 0 ? ((shipped / supply) * 100).toFixed(1) : 0;
    const uncommittedPct = supply > 0 ? ((uncommitted / supply) * 100).toFixed(1) : 0;
    return {
      cropYear: latest.crop_year,
      month: latest.report_month,
      year: latest.report_year,
      supply,
      committed,
      uncommitted,
      shipped,
      commitRate,
      shipRate,
      uncommittedPct,
      newCommitments,
    };
  }, [reports]);

  // Commitment rate by crop year month
  const commitmentRateData = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r && r.total_supply_lbs > 0) {
          row[`rate_${cy}`] = (r.total_committed_lbs / r.total_supply_lbs * 100);
        }
      }
      return row;
    });
  }, [reports, selectedCrops]);

  // Supply draw-down (uncommitted as % of total supply)
  const drawDownData = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r && r.total_supply_lbs > 0) {
          row[`drawdown_${cy}`] = (r.uncommitted_lbs / r.total_supply_lbs * 100);
        }
      }
      return row;
    });
  }, [reports, selectedCrops]);

  // Supply utilization (shipped / supply %) over crop year months
  const utilizationData = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r && r.total_supply_lbs > 0) {
          row[`util_${cy}`] = (r.total_shipped_lbs / r.total_supply_lbs * 100);
        }
      }
      return row;
    });
  }, [reports, selectedCrops]);

  // New commitments velocity (monthly new commitments as % of uncommitted)
  const velocityData = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r && r.uncommitted_lbs > 0 && r.total_new_commitments_lbs > 0) {
          row[`vel_${cy}`] = (r.total_new_commitments_lbs / r.uncommitted_lbs * 100);
        }
      }
      return row;
    });
  }, [reports, selectedCrops]);

  // Supply balance overview (full timeline)
  const supplyBalance = useMemo(() =>
    reports.map(r => ({
      label: `${r.report_year}/${String(r.report_month).padStart(2, '0')}`,
      supply: toNum(r.total_supply_lbs),
      committed: toNum(r.total_committed_lbs),
      uncommitted: toNum(r.uncommitted_lbs),
      shipped: toNum(r.total_shipped_lbs),
    })),
    [reports]
  );

  // Coverage ratio: committed / shipped (months of forward coverage)
  const coverageData = useMemo(() => {
    const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return monthLabels.map((label, i) => {
      const month = ((i + 8 - 1) % 12) + 1;
      const row = { label, monthNum: month };
      for (const cy of selectedCrops) {
        const r = reports.find(rep => rep.crop_year === cy && rep.report_month === month);
        if (r && r.total_shipped_lbs > 0) {
          row[`cov_${cy}`] = (r.total_committed_lbs / r.total_shipped_lbs);
        }
      }
      return row;
    });
  }, [reports, selectedCrops]);

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
        <h2 className="text-2xl font-bold text-white">Supply & Demand Intelligence</h2>
        <p className="text-gray-500 text-sm mt-1">Commitment rates, inventory draw-down, and supply utilization metrics</p>
      </div>

      {/* Key Metrics */}
      {latestMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <MetricCard
            icon="📦"
            title="Total Supply"
            value={`${(latestMetrics.supply / 1e9).toFixed(2)}B`}
            subtitle={`${latestMetrics.cropYear}`}
            color="green"
          />
          <MetricCard
            icon="📝"
            title="Commit Rate"
            value={`${latestMetrics.commitRate}%`}
            subtitle="of total supply"
            color="blue"
          />
          <MetricCard
            icon="🚚"
            title="Ship Rate"
            value={`${latestMetrics.shipRate}%`}
            subtitle="of total supply"
            color="cyan"
          />
          <MetricCard
            icon="📊"
            title="Uncommitted"
            value={`${latestMetrics.uncommittedPct}%`}
            subtitle={`${(latestMetrics.uncommitted / 1e6).toFixed(0)}M lbs`}
            color="amber"
          />
          <MetricCard
            icon="🆕"
            title="New Commits"
            value={`${(latestMetrics.newCommitments / 1e6).toFixed(0)}M`}
            subtitle="this month"
            color="purple"
          />
          <MetricCard
            icon="📅"
            title="Report Month"
            value={`${latestMetrics.month}/${latestMetrics.year}`}
            subtitle="latest data"
            color="green"
          />
        </div>
      )}

      {/* Market Context — explains what the numbers mean */}
      {latestMetrics && (
        <div className="mb-6 bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">What This Means for Traders</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            {parseFloat(latestMetrics.uncommittedPct) > 20
              ? `With ${latestMetrics.uncommittedPct}% of supply still uncommitted (${(latestMetrics.uncommitted / 1e6).toFixed(0)}M lbs), the market has adequate availability. Buyers have negotiating leverage, and there is no urgency to lock in positions. However, watch for seasonal acceleration in Q2/Q3 when commitment velocity typically increases.`
              : parseFloat(latestMetrics.uncommittedPct) > 10
              ? `Uncommitted inventory at ${latestMetrics.uncommittedPct}% (${(latestMetrics.uncommitted / 1e6).toFixed(0)}M lbs) signals a moderately tight market. Forward buyers should begin securing positions, as remaining availability will decline through the crop year. Export demand typically intensifies from here.`
              : `At just ${latestMetrics.uncommittedPct}% uncommitted, the market is tight. Remaining availability is limited and prices may firm. Buyers should act promptly to secure needed volumes, particularly for popular export varieties.`
            }
            {' '}The commitment rate of {latestMetrics.commitRate}% and ship rate of {latestMetrics.shipRate}% together indicate
            {parseFloat(latestMetrics.commitRate) > parseFloat(latestMetrics.shipRate) * 2
              ? ' strong forward demand well ahead of actual shipments — a bullish signal.'
              : parseFloat(latestMetrics.commitRate) > parseFloat(latestMetrics.shipRate)
              ? ' healthy forward commitments running ahead of shipments — balanced market conditions.'
              : ' shipments tracking close to commitments — indicating prompt demand rather than forward buying.'
            }
          </p>
        </div>
      )}

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

      {/* Row 1: Commitment Rate + Draw-Down */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Commitment Rate by Crop Year" subtitle="% of total supply committed — higher = tighter market" insight="The commitment rate shows how much of the total crop has been sold forward. When this line rises steeply early in the crop year, it signals strong buyer confidence and potential supply tightness later. A rate above 75% (red line) means most supply is spoken for.">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={commitmentRateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(1) + '%'} />} />
              <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Tight', fill: '#ef4444', fontSize: 10 }} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`rate_${cy}`}
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

        <ChartCard title="Inventory Draw-Down Curve" subtitle="Uncommitted % remaining — steeper = faster selling" insight="This chart tracks how quickly available inventory is being claimed. A steeper curve means demand is absorbing supply faster. When inventory drops below 20% (amber line), remaining buyers face limited options and potentially higher prices. Compare crop years to see if this year is selling faster or slower than prior years.">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={drawDownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(1) + '%'} />} />
              <ReferenceLine y={20} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Low Stock', fill: '#f59e0b', fontSize: 10 }} />
              {selectedCrops.map(cy => (
                <Area
                  key={cy}
                  type="monotone"
                  dataKey={`drawdown_${cy}`}
                  name={cy}
                  stroke={CROP_COLORS[cy] || '#888'}
                  fill={CROP_COLORS[cy] || '#888'}
                  fillOpacity={0.08}
                  strokeWidth={cy === allCropYears[allCropYears.length - 1] ? 2.5 : 1.5}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Supply Utilization + Commitment Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Supply Utilization (Shipped %)" subtitle="Cumulative shipments as % of total supply" insight="This shows how much of the crop has actually been shipped (not just committed). A gap between commitment rate and utilization rate means buyers have committed but not yet taken delivery — common in export markets where shipping logistics add lead time.">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={utilizationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(1) + '%'} />} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`util_${cy}`}
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

        <ChartCard title="Commitment Velocity" subtitle="New commitments as % of uncommitted inventory — selling speed" insight="Velocity measures the rate at which remaining supply is being committed each month. High velocity (big spikes) means buyers are aggressively securing positions — often a leading indicator of price support. Declining velocity may signal buyer hesitation or sufficient coverage.">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(0) + '%'} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(1) + '%'} />} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`vel_${cy}`}
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

      {/* Row 3: Forward Coverage Ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Forward Coverage Ratio" subtitle="Committed ÷ Shipped — months of forward sales cover" insight="This ratio shows how many times over current shipments are covered by commitments. A ratio above 2.5x means strong forward demand; below 2x suggests the market may be shifting to more spot/prompt buying rather than forward planning.">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={coverageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v.toFixed(1) + 'x'} />
              <Tooltip content={<CustomTooltip formatter={v => v.toFixed(2) + 'x'} />} />
              {selectedCrops.map(cy => (
                <Line
                  key={cy}
                  type="monotone"
                  dataKey={`cov_${cy}`}
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

        {/* Supply Balance Timeline */}
        <ChartCard title="Supply Balance Timeline" subtitle="10-year supply vs committed vs shipped" insight="The long-term timeline shows how California almond supply has grown over the decade. The gap between total supply and committed volumes represents available inventory. A narrowing gap over time indicates the industry is becoming more demand-driven.">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={supplyBalance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} interval={11} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => (v / 1e9).toFixed(1) + 'B'} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Area type="monotone" dataKey="supply" name="Total Supply" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.1} />
              <Line type="monotone" dataKey="committed" name="Committed" stroke={COLORS.blue} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="uncommitted" name="Uncommitted" stroke={COLORS.amber} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: Crop Year Supply Health Table */}
      <ChartCard title="Supply Health by Crop Year" subtitle="Key supply-demand ratios at latest available month per crop year" insight="Compare each crop year's supply health at the same point in the marketing year. This helps identify whether the current crop year is tighter or looser than historical norms — essential context for pricing and buying decisions.">
        <div className="flex justify-end mb-3">
          <button
            onClick={() => {
              const headers = ['Crop Year', 'Supply (lbs)', 'Commit %', 'Ship %', 'Uncommitted %', 'Velocity %', 'Status'];
              const rows = allCropYears.map(cy => {
                const cyR = reports.filter(r => r.crop_year === cy);
                const last = cyR[cyR.length - 1];
                if (!last) return null;
                const commitPct = last.total_supply_lbs > 0 ? (last.total_committed_lbs / last.total_supply_lbs * 100).toFixed(1) : '0';
                const shipPct = last.total_supply_lbs > 0 ? (last.total_shipped_lbs / last.total_supply_lbs * 100).toFixed(1) : '0';
                const uncommittedPct = last.total_supply_lbs > 0 ? (last.uncommitted_lbs / last.total_supply_lbs * 100).toFixed(1) : '0';
                const velocity = last.uncommitted_lbs > 0 && last.total_new_commitments_lbs > 0 ? (last.total_new_commitments_lbs / last.uncommitted_lbs * 100).toFixed(1) : '0';
                const status = parseFloat(uncommittedPct) < 15 ? 'Tight' : parseFloat(uncommittedPct) < 30 ? 'Balanced' : 'Loose';
                return [cy, last.total_supply_lbs, commitPct, shipPct, uncommittedPct, velocity, status];
              }).filter(Boolean);
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'cropsintel_supply_health.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs text-gray-500 hover:text-green-400 transition-colors px-2 py-1 rounded border border-gray-800 hover:border-green-500/30"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 text-gray-400 text-xs">Crop Year</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Supply</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Commit %</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Ship %</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Uncommitted</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Velocity</th>
                <th className="text-right py-2 px-3 text-gray-400 text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {allCropYears.map(cy => {
                const cyReports = reports.filter(r => r.crop_year === cy);
                const last = cyReports[cyReports.length - 1];
                if (!last) return null;
                const lSupply = toNum(last.total_supply_lbs);
                const commitPct = lSupply > 0 ? (toNum(last.total_committed_lbs) / lSupply * 100) : 0;
                const shipPct = lSupply > 0 ? (toNum(last.total_shipped_lbs) / lSupply * 100) : 0;
                const uncommittedPct = lSupply > 0 ? (toNum(last.uncommitted_lbs) / lSupply * 100) : 0;
                const lUncommitted = toNum(last.uncommitted_lbs);
                const velocity = lUncommitted > 0 && toNum(last.total_new_commitments_lbs) > 0
                  ? (toNum(last.total_new_commitments_lbs) / lUncommitted * 100) : 0;
                const status = uncommittedPct < 15 ? 'Tight' : uncommittedPct < 30 ? 'Balanced' : 'Loose';
                const statusColor = status === 'Tight' ? 'text-red-400' : status === 'Balanced' ? 'text-green-400' : 'text-amber-400';

                return (
                  <tr key={cy} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: CROP_COLORS[cy] || '#888' }} />
                      <span className="text-white text-xs font-medium">{cy}</span>
                      <span className="text-gray-600 text-[10px] ml-1">({cyReports.length}mo)</span>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300 text-xs">{(last.total_supply_lbs / 1e9).toFixed(2)}B</td>
                    <td className="py-2 px-3 text-right text-blue-400 text-xs">{commitPct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right text-cyan-400 text-xs">{shipPct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right text-amber-400 text-xs">{uncommittedPct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right text-purple-400 text-xs">{velocity.toFixed(1)}%</td>
                    <td className={`py-2 px-3 text-right text-xs font-medium ${statusColor}`}>{status}</td>
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
