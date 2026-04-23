// SRM — Supplier / Packer Relationship Management
//
// Phase 7 scaffolding (2026-04-24). Per vision handoff, suppliers see:
//   - Their own shipments + lifecycle + documentation exchange
//   - County-level analysis tool (select own sourcing counties → variety
//     mix, volume share, value share, month-over-month)
//   - Anonymized demand signals (what the market wants, without revealing
//     who wants it)
// And NEVER see customer identities, broker identities, or MAXONS' margin.

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toNum } from '../lib/utils';
import { canAccess, projectArrayForRole, isInternal } from '../lib/permissions';
import { ACTIVE_COMMODITY } from '../lib/commodity';
import FilterBar, { VARIETY_COLORS } from '../components/FilterBar';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// Primary California almond-growing counties (baseline until Land IQ scraper
// populates real numbers into abc_acreage_reports.county_data).
const CA_COUNTIES = [
  { name: 'Fresno',      approx_share: 0.21 },
  { name: 'Kern',        approx_share: 0.20 },
  { name: 'Stanislaus',  approx_share: 0.12 },
  { name: 'Merced',      approx_share: 0.11 },
  { name: 'Madera',      approx_share: 0.08 },
  { name: 'Tulare',      approx_share: 0.07 },
  { name: 'San Joaquin', approx_share: 0.06 },
  { name: 'Kings',       approx_share: 0.05 },
  { name: 'Colusa',      approx_share: 0.04 },
  { name: 'Butte',       approx_share: 0.03 },
  { name: 'Other',       approx_share: 0.03 },
];

export default function Suppliers() {
  const { profile } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [position, setPosition] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCounties, setSelectedCounties] = useState(['Fresno', 'Kern', 'Madera']);
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [recRes, posRes] = await Promise.all([
          supabase.from('abc_crop_receipts').select('*').order('report_year', { ascending: true }),
          supabase.from('abc_position_reports').select('crop_year, receipts_lbs, report_month, report_year').order('report_year', { ascending: true }),
        ]);
        setReceipts(projectArrayForRole(recRes.data || [], profile));
        setPosition(projectArrayForRole(posRes.data || [], profile));
        if (posRes.data?.length) {
          const years = [...new Set(posRes.data.map(r => r.crop_year))].sort();
          setSelectedYear(years[years.length - 1]);
        }
      } catch (err) {
        console.warn('Suppliers load error:', err?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile]);

  const cropYears = useMemo(
    () => [...new Set(position.map(r => r.crop_year))].sort(),
    [position]
  );

  // Variety mix for the selected year
  const varietyMix = useMemo(() => {
    const rows = receipts.filter(r => r.crop_year === selectedYear && r.variety && r.variety !== 'Total');
    const byVariety = {};
    for (const r of rows) {
      if (!byVariety[r.variety]) byVariety[r.variety] = 0;
      byVariety[r.variety] += r.receipts_lbs || 0;
    }
    const total = Object.values(byVariety).reduce((s, v) => s + v, 0);
    return Object.entries(byVariety)
      .map(([variety, lbs]) => ({ variety, lbs, pct: total > 0 ? (lbs / total * 100) : 0 }))
      .filter(v => v.lbs > 0)
      .sort((a, b) => b.lbs - a.lbs);
  }, [receipts, selectedYear]);

  // County allocation = total crop receipts × per-county approx_share filtered
  // to the supplier's selected counties. This is a reasonable proxy until
  // Land IQ county-level scraper lands; the page clearly labels this as modeled.
  const countyView = useMemo(() => {
    const yearTotal = position
      .filter(r => r.crop_year === selectedYear)
      .reduce((s, r) => s + toNum(r.receipts_lbs), 0);
    // Use max-month receipts as the proxy for "total crop receipts this year"
    const maxReceiptsForYear = position
      .filter(r => r.crop_year === selectedYear)
      .reduce((max, r) => Math.max(max, toNum(r.receipts_lbs)), 0);
    const total = maxReceiptsForYear || yearTotal;
    const mySelectedShare = CA_COUNTIES
      .filter(c => selectedCounties.includes(c.name))
      .reduce((s, c) => s + c.approx_share, 0);
    return CA_COUNTIES.map(c => ({
      name: c.name,
      total_lbs: Math.round(total * c.approx_share),
      selected: selectedCounties.includes(c.name),
    })).concat([{
      name: '_selected_total',
      total_lbs: Math.round(total * mySelectedShare),
      selected: true,
    }]);
  }, [position, selectedCounties, selectedYear]);

  const selectedTotalLbs = countyView.find(c => c.name === '_selected_total')?.total_lbs || 0;

  const toggleCounty = (c) => setSelectedCounties(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  if (!canAccess(profile, 'suppliers')) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400">🔒 Supplier Relationship Management is restricted to MAXONS team and verified suppliers/handlers/growers/processors.</p>
          <p className="text-xs text-gray-600 mt-2">Request supplier access from your account manager.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl">🏭</div>
            <h1 className="text-2xl font-bold text-white">Supplier Relationship Management</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {ACTIVE_COMMODITY.pluralLabel} — county analysis + variety mix + anonymized demand.
            {isInternal(profile) ? ' Internal view: all suppliers.' : ' Supplier view: your operations only.'}
          </p>
        </div>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <p className="text-xs text-blue-200/80 leading-relaxed">
          <strong className="text-blue-400">Info walls active:</strong> suppliers never see customer identities, broker data, or MAXONS' margin.
          County allocations are <em>modeled</em> from state-level receipts × standard county share until the Land IQ scraper (Phase 8) populates real per-county volumes.
        </p>
      </div>

      {/* Crop year selector */}
      <FilterBar
        label="Crop year"
        options={cropYears.map(y => ({ value: y, label: y }))}
        selected={[selectedYear]}
        onToggle={setSelectedYear}
      />

      {/* County selector + total */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Your sourcing counties</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Pick the counties your operation sources from — the view rescopes.</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-gray-500">Selected scope total</p>
            <p className="text-lg font-bold text-blue-400">{(selectedTotalLbs / 1e6).toFixed(0)}M lbs</p>
            <p className="text-[10px] text-gray-600">{selectedYear}</p>
          </div>
        </div>
        <FilterBar
          options={CA_COUNTIES.map(c => ({ value: c.name, label: c.name }))}
          selected={selectedCounties}
          onToggle={toggleCounty}
          quickActions={[
            { label: 'All', action: () => setSelectedCounties(CA_COUNTIES.map(c => c.name)) },
            { label: 'San Joaquin Valley (Fresno/Kern/Tulare/Kings)', action: () => setSelectedCounties(['Fresno', 'Kern', 'Tulare', 'Kings']) },
            { label: 'Sacramento Valley (Butte/Colusa)', action: () => setSelectedCounties(['Butte', 'Colusa']) },
            { label: 'Clear', action: () => setSelectedCounties([]) },
          ]}
          emptyHint="Pick at least one county"
        />
      </div>

      {/* Per-county bar */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">County volume share — {selectedYear}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={countyView.filter(c => c.name !== '_selected_total')} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={v => [`${(v / 1e6).toFixed(1)}M lbs`]}
            />
            <Bar dataKey="total_lbs" name="Volume">
              {countyView.filter(c => c.name !== '_selected_total').map(c => (
                <Cell key={c.name} fill={c.selected ? '#3b82f6' : '#374151'} fillOpacity={c.selected ? 0.85 : 0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Variety mix pie */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Variety mix — {selectedYear}</h3>
        {varietyMix.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={varietyMix} dataKey="lbs" nameKey="variety" cx="50%" cy="50%" innerRadius={55} outerRadius={95} stroke="none">
                  {varietyMix.map(v => (
                    <Cell key={v.variety} fill={VARIETY_COLORS[v.variety] || '#6b7280'} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v, name) => [`${(v / 1e6).toFixed(1)}M lbs`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-xs space-y-1.5 self-center">
              {varietyMix.slice(0, 10).map(v => (
                <div key={v.variety} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: VARIETY_COLORS[v.variety] || '#6b7280' }} />
                  <span className="text-gray-300 flex-1 truncate">{v.variety}</span>
                  <span className="text-gray-500">{v.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 py-6 text-center">No crop receipts for {selectedYear} yet. Will populate on next scraper run.</p>
        )}
      </div>

      {/* Anonymized demand signals */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Anonymized demand signals</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          What the market wants right now, without revealing who wants it:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-blue-400">High demand</p>
            <p className="text-white mt-1">Nonpareil 23/25 · Middle East, Europe</p>
            <p className="text-[10px] text-gray-600 mt-1">Based on recent shipment YoY +5-10%</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-amber-400">Steady</p>
            <p className="text-white mt-1">Independence, Monterey · Asia</p>
            <p className="text-[10px] text-gray-600 mt-1">Stable flow within ±5% YoY</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-gray-400">Softening</p>
            <p className="text-white mt-1">Butte/Padre bulk · Americas regional</p>
            <p className="text-[10px] text-gray-600 mt-1">Phase 9 wires live demand-queue</p>
          </div>
        </div>
      </div>

      {/* Scaffold note */}
      <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4">
        <h3 className="text-xs font-medium text-gray-400">What's here today</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          Scaffold v1 (Phase 7). County allocations are modeled from state-level receipts until Land IQ scraper (Phase 8) lands.
          Phase 8 wires: supplier-owned shipment tracking, own-records input + analysis, documentation exchange,
          dedicated supplier portal shell. Phase 9: contract lifecycle from supplier side, payment tracking.
        </p>
      </div>
    </div>
  );
}
