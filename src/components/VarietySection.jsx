// Variety Intelligence section — reads abc_crop_receipts, shows variety
// share pie for the selected crop year + variety trend over time with
// multi-select compare (Nonpareil vs Carmel vs etc.).
//
// Placed on the Forecasts page because variety is about crop composition,
// not a separate persona concern. Phase D may promote it to a persona view.

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import FilterBar, { SingleSelectBar, VARIETY_COLORS } from './FilterBar';
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function fmtLbs(v) {
  if (v == null) return '-';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B lbs`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M lbs`;
  return `${v.toLocaleString()} lbs`;
}

export default function VarietySection() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);
  const [comparedVarieties, setComparedVarieties] = useState([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('abc_crop_receipts')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });
      if (!error && data) {
        setReceipts(data);
        const years = [...new Set(data.map(r => r.crop_year))].sort();
        if (years.length) setSelectedYear(years[years.length - 1]);
      }
      setLoading(false);
    })();
  }, []);

  const allYears = useMemo(
    () => [...new Set(receipts.map(r => r.crop_year))].sort(),
    [receipts]
  );

  // Variety totals for the selected year (excludes the synthetic "Total" row).
  const yearTotals = useMemo(() => {
    const rows = receipts.filter(r => r.crop_year === selectedYear && r.variety !== 'Total');
    const byVariety = {};
    for (const r of rows) {
      if (!byVariety[r.variety]) byVariety[r.variety] = 0;
      byVariety[r.variety] += r.receipts_lbs || 0;
    }
    const out = Object.entries(byVariety)
      .map(([variety, total]) => ({ variety, total }))
      .filter(v => v.total > 0)
      .sort((a, b) => b.total - a.total);
    const grandTotal = out.reduce((s, v) => s + v.total, 0);
    return out.map(v => ({ ...v, pct: grandTotal > 0 ? v.total / grandTotal * 100 : 0 }));
  }, [receipts, selectedYear]);

  const allVarieties = useMemo(
    () => yearTotals.map(v => v.variety),
    [yearTotals]
  );

  // Default compare selection = top 3 varieties once data loads.
  useEffect(() => {
    if (comparedVarieties.length === 0 && allVarieties.length > 0) {
      setComparedVarieties(allVarieties.slice(0, 3));
    }
  }, [allVarieties, comparedVarieties.length]);

  // Trend: annual totals per selected variety, across all crop years.
  const trendData = useMemo(() => {
    return allYears.map(cy => {
      const row = { crop_year: cy };
      for (const v of comparedVarieties) {
        const total = receipts
          .filter(r => r.crop_year === cy && r.variety === v)
          .reduce((s, r) => s + (r.receipts_lbs || 0), 0);
        row[v] = total;
      }
      return row;
    });
  }, [receipts, allYears, comparedVarieties]);

  const toggleCompare = (variety) => {
    setComparedVarieties(prev =>
      prev.includes(variety) ? prev.filter(v => v !== variety) : [...prev, variety]
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-3">Variety Intelligence</h3>
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-2">Variety Intelligence</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Variety-level breakdown will appear here once the next auto-scrape run populates <code className="text-gray-400">abc_crop_receipts</code>.
          The backfill covers all 11 crop years × 18 varieties (Nonpareil, Independence, Monterey, Butte/Padre, Fritz, Carmel, etc.)
          derived from ABC Position Reports. Real parsed data will overlay modeled shares as months land.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-white">Variety Intelligence</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Variety breakdown from ABC Crop Receipts — {allYears.length} crop years × {allVarieties.length} varieties
            </p>
          </div>
        </div>

        <SingleSelectBar
          label="Crop year"
          options={allYears.map(y => ({ value: y, label: y }))}
          value={selectedYear}
          onChange={setSelectedYear}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
          {/* Share pie — selected year */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Variety share — {selectedYear}
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={yearTotals}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  dataKey="total"
                  nameKey="variety"
                  stroke="none"
                >
                  {yearTotals.map(v => (
                    <Cell key={v.variety} fill={VARIETY_COLORS[v.variety] || '#6b7280'} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v, name) => [fmtLbs(v), name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px]">
              {yearTotals.slice(0, 8).map(v => (
                <div key={v.variety} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: VARIETY_COLORS[v.variety] || '#6b7280' }} />
                  <span className="text-gray-400 truncate">{v.variety}</span>
                  <span className="text-gray-600 ml-auto">{v.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trend compare — multi-variety across crop years */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Year-over-year trend — pick varieties to compare
            </h4>
            <FilterBar
              options={allVarieties.map(v => ({ value: v, label: v, color: VARIETY_COLORS[v] || '#6b7280' }))}
              selected={comparedVarieties}
              onToggle={toggleCompare}
              quickActions={[
                { label: 'Top 3', action: () => setComparedVarieties(allVarieties.slice(0, 3)) },
                { label: 'Top 5', action: () => setComparedVarieties(allVarieties.slice(0, 5)) },
                { label: 'Clear', action: () => setComparedVarieties([]) },
              ]}
              emptyHint="Pick at least one variety"
            />
            {comparedVarieties.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="crop_year" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={v => fmtLbs(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  {comparedVarieties.map(v => (
                    <Area
                      key={v}
                      type="monotone"
                      dataKey={v}
                      name={v}
                      stroke={VARIETY_COLORS[v] || '#6b7280'}
                      fill={VARIETY_COLORS[v] || '#6b7280'}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-gray-600 text-xs border border-dashed border-gray-800 rounded">
                Pick at least one variety above to see the trend.
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] text-gray-600 mt-4 leading-relaxed">
          Source: <code>abc_crop_receipts</code> (populated from ABC Position Reports via piggy-back parser + backfill generator).
          Nonpareil is the dominant variety (~38% share); Independence and Monterey are the next largest.
          Variety share affects pricing — Nonpareil-heavy years typically see premium demand.
        </p>
      </div>
    </div>
  );
}
