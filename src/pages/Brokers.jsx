// BRM — Broker Relationship Management
//
// Phase 7 scaffolding (2026-04-24). Per vision handoff: brokers are a
// first-class counterparty with their own scoped portal. They see:
//   - Market intelligence (which markets to focus on, which to avoid)
//   - MAXONS' needs + margin targets (so they bring back best deals)
//   - Their own offer management surface
//
// Internal MAXONS team sees the admin view of this (all brokers across
// the market). A logged-in broker (future Phase 8) sees only their own.

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toNum } from '../lib/utils';
import { canAccess, projectArrayForRole, isInternal } from '../lib/permissions';
import { ACTIVE_COMMODITY } from '../lib/commodity';
import FilterBar, { CROP_YEAR_COLORS } from '../components/FilterBar';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const REGIONS = [
  { code: 'ME',    label: 'Middle East',       markets: ['UAE', 'Saudi Arabia', 'Jordan', 'Iraq', 'Lebanon'] },
  { code: 'EU',    label: 'Europe',            markets: ['Spain', 'Germany', 'Italy', 'Netherlands', 'France', 'United Kingdom'] },
  { code: 'ASIA',  label: 'Asia',              markets: ['India', 'China/Hong Kong', 'Japan', 'South Korea', 'Vietnam', 'Pakistan'] },
  { code: 'AMER',  label: 'Americas',          markets: ['Canada', 'Mexico', 'Brazil', 'Chile'] },
  { code: 'AFR',   label: 'Africa',            markets: ['Morocco', 'Algeria', 'Egypt'] },
];

function MarketCard({ name, volume, yoy, signal }) {
  const signalColors = {
    focus:   { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', label: '▲ Focus' },
    neutral: { bg: 'bg-gray-500/10',  border: 'border-gray-500/30',  text: 'text-gray-400',  label: '● Hold' },
    avoid:   { bg: 'bg-red-500/10',   border: 'border-red-500/30',   text: 'text-red-400',   label: '▼ Avoid' },
  }[signal] || { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', label: '—' };

  return (
    <div className={`${signalColors.bg} border ${signalColors.border} rounded-xl p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-white truncate">{name}</h4>
        <span className={`text-[9px] px-2 py-0.5 rounded-full ${signalColors.text} border ${signalColors.border}`}>
          {signalColors.label}
        </span>
      </div>
      <p className="text-lg font-bold text-white">{(volume / 1e6).toFixed(0)}M lbs</p>
      <p className={`text-[10px] mt-1 ${yoy > 0 ? 'text-green-400' : yoy < 0 ? 'text-red-400' : 'text-gray-500'}`}>
        {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}% YoY
      </p>
    </div>
  );
}

export default function Brokers() {
  const { profile } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('abc_shipment_reports')
          .select('*')
          .eq('destination_region', 'export')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false });
        const safe = projectArrayForRole(data || [], profile);
        setShipments(safe);
      } catch (err) {
        console.warn('Brokers data load error:', err?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile]);

  // Signal per market: latest crop year vs the *single* prior crop year
  // (not summed across all prior years — that was a logic bug producing
  // bogus -87% YoYs). Focus 8-30% growth, avoid >30% (overheated) or
  // below -8% (contracting), neutral otherwise.
  const marketSignals = useMemo(() => {
    if (!shipments.length) return [];
    // All crop years present in the data, newest first
    const years = [...new Set(shipments.map(s => s.crop_year))].filter(Boolean).sort().reverse();
    if (years.length === 0) return [];
    const latestYear = years[0];
    const priorYear  = years[1] || null;
    const byCountry = {};
    for (const s of shipments) {
      const c = s.destination_country;
      if (!c || c === 'Total Export') continue;
      if (!byCountry[c]) byCountry[c] = { current: 0, prior: 0 };
      if (s.crop_year === latestYear)        byCountry[c].current += toNum(s.monthly_lbs);
      else if (priorYear && s.crop_year === priorYear) byCountry[c].prior += toNum(s.monthly_lbs);
    }
    return Object.entries(byCountry).map(([name, v]) => {
      const yoy = v.prior > 0 ? (v.current - v.prior) / v.prior * 100 : (v.current > 0 ? 0 : 0);
      let signal = 'neutral';
      if (yoy > 8 && yoy < 30) signal = 'focus';
      else if (yoy >= 30) signal = 'avoid'; // overheated → will weaken
      else if (yoy < -8) signal = 'avoid';
      return { name, volume: v.current, yoy, signal, latestYear, priorYear };
    }).filter(r => r.volume > 0).sort((a, b) => b.volume - a.volume);
  }, [shipments]);

  const visibleMarkets = useMemo(() => {
    if (selectedRegion === 'all') return marketSignals;
    const region = REGIONS.find(r => r.code === selectedRegion);
    if (!region) return marketSignals;
    return marketSignals.filter(m => region.markets.includes(m.name));
  }, [marketSignals, selectedRegion]);

  if (!canAccess(profile, 'brokers')) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400">🔒 Broker Relationship Management is restricted to MAXONS team members and verified brokers.</p>
          <p className="text-xs text-gray-600 mt-2">Request broker access from your account manager.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const focus  = visibleMarkets.filter(m => m.signal === 'focus').length;
  const hold   = visibleMarkets.filter(m => m.signal === 'neutral').length;
  const avoid  = visibleMarkets.filter(m => m.signal === 'avoid').length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl">🤝</div>
            <h1 className="text-2xl font-bold text-white">Broker Relationship Management</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {ACTIVE_COMMODITY.pluralLabel} — market intelligence surface + broker pipeline.
            {isInternal(profile) ? ' Internal view: all brokers + all markets.' : ' Broker view: your markets only.'}
          </p>
        </div>
      </div>

      {/* Info-walls note */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <p className="text-xs text-amber-200/80 leading-relaxed">
          <strong className="text-amber-400">Info walls active:</strong> brokers never see customer identities, customer pricing, or other brokers' data.
          This view is scoped by your role via <code>projectArrayForRole()</code>.
          Phase 8 wires the audit log on every query here.
        </p>
      </div>

      {/* Region filter */}
      <FilterBar
        label="Region"
        options={[{ value: 'all', label: 'All regions' }, ...REGIONS.map(r => ({ value: r.code, label: r.label }))]}
        selected={[selectedRegion]}
        onToggle={setSelectedRegion}
      />

      {/* Signal KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-green-500/20 bg-green-500/5 rounded-xl p-3">
          <p className="text-[10px] uppercase text-gray-500">▲ Focus markets</p>
          <p className="text-xl font-bold text-green-400 mt-1">{focus}</p>
          <p className="text-[10px] text-gray-600 mt-1">demand climbing 8-30% YoY</p>
        </div>
        <div className="border border-gray-500/20 bg-gray-500/5 rounded-xl p-3">
          <p className="text-[10px] uppercase text-gray-500">● Hold</p>
          <p className="text-xl font-bold text-gray-400 mt-1">{hold}</p>
          <p className="text-[10px] text-gray-600 mt-1">stable — steady buying</p>
        </div>
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-3">
          <p className="text-[10px] uppercase text-gray-500">▼ Avoid</p>
          <p className="text-xl font-bold text-red-400 mt-1">{avoid}</p>
          <p className="text-[10px] text-gray-600 mt-1">overheated (&gt;30% YoY) or contracting</p>
        </div>
      </div>

      {/* Market signals grid */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Market signals — {selectedRegion === 'all' ? 'all regions' : REGIONS.find(r => r.code === selectedRegion)?.label}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleMarkets.slice(0, 16).map(m => <MarketCard key={m.name} {...m} />)}
          {visibleMarkets.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-600 text-sm">
              No market data for the selected region yet.
            </div>
          )}
        </div>
      </div>

      {/* YoY chart */}
      {visibleMarkets.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top 10 markets — YoY change</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={visibleMarkets.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} width={110} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                formatter={v => `${v.toFixed(1)}%`}
              />
              <Bar dataKey="yoy" name="YoY change" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* MAXONS' needs + margin targets (internal only) */}
      {isInternal(profile) && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">MAXONS Needs + Margin Targets</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Brokers need to know what MAXONS is sourcing and at what margin target so they bring back the best deals.
            This surface is Phase 9 (trade lifecycle integration) — it'll pull from an open-needs queue + MAXONS config.
          </p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">Active needs</p>
              <p className="text-white mt-1">Queued for Phase 9</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">Margin target</p>
              <p className="text-white mt-1">3% baseline · per-deal overrides in Phase 9</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">Open offers</p>
              <Link to="/trading" className="text-green-400 hover:text-green-300 mt-1 block">Trading Portal →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Scaffold note */}
      <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4">
        <h3 className="text-xs font-medium text-gray-400">What's here today</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          Scaffold v1 (Phase 7). Market-signal logic reads from abc_shipment_reports and computes focus/hold/avoid.
          Phase 8 adds: broker-owned offer management, broker-scoped contacts, info-wall verification, audit logging,
          dedicated broker portal shell (today this renders inside the MAXONS-team app).
          Phase 9: open-needs queue, margin-target per deal, direct offer posting from broker → MAXONS verification.
        </p>
      </div>
    </div>
  );
}
