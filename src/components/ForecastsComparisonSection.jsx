// Forecast-accuracy section — reads abc_forecasts (populated by
// scrapeSubjectiveForecasts + scrapeObjectiveForecasts in abc-scraper.js)
// and compares each forecast against the corresponding actual crop receipts
// from abc_position_reports.
//
// Why this matters: traders rely on ABC's May Subjective and July Objective
// forecasts to position ahead of harvest. The delta between the forecast
// and the eventual final receipts tells you how much trust to put in the
// NEXT year's forecasts.

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = {
  subjective: '#a855f7',   // purple — May forecast
  objective:  '#3b82f6',   // blue — July forecast
  actual:     '#22c55e',   // green — final receipts
};

function fmtB(v) {
  if (v == null) return '—';
  return `${(v / 1e9).toFixed(2)}B`;
}

function fmtPct(p) {
  if (p == null) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export default function ForecastsComparisonSection() {
  const [forecasts, setForecasts] = useState([]);
  const [positionReports, setPositionReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [fcRes, posRes] = await Promise.all([
        supabase.from('abc_forecasts').select('*').order('forecast_year', { ascending: true }),
        supabase.from('abc_position_reports').select('crop_year, receipts_lbs').order('crop_year', { ascending: true }),
      ]);
      if (fcRes.data) setForecasts(fcRes.data);
      if (posRes.data) setPositionReports(posRes.data);
      setLoading(false);
    })();
  }, []);

  // Actual receipts per crop year = max(receipts_lbs) across months for that year.
  const actualByCropYear = useMemo(() => {
    const byYear = {};
    for (const r of positionReports) {
      const lbs = r.receipts_lbs || 0;
      if (!byYear[r.crop_year] || lbs > byYear[r.crop_year]) byYear[r.crop_year] = lbs;
    }
    return byYear;
  }, [positionReports]);

  // Comparison rows: for each forecast year, pull the subjective + objective
  // (if present) and the actual from the matching crop year (same year).
  const comparisonRows = useMemo(() => {
    const byYear = {};
    for (const f of forecasts) {
      if (!byYear[f.forecast_year]) byYear[f.forecast_year] = { forecast_year: f.forecast_year, crop_year: f.crop_year };
      byYear[f.forecast_year][f.forecast_type] = f.forecast_lbs;
    }
    return Object.values(byYear)
      .map(row => {
        const actual = actualByCropYear[row.crop_year] || null;
        return {
          ...row,
          actual,
          subj_delta_pct: row.subjective && actual ? ((actual - row.subjective) / row.subjective * 100) : null,
          obj_delta_pct:  row.objective  && actual ? ((actual - row.objective)  / row.objective  * 100) : null,
        };
      })
      .sort((a, b) => a.forecast_year - b.forecast_year);
  }, [forecasts, actualByCropYear]);

  // Accuracy KPIs
  const kpis = useMemo(() => {
    const withSubj = comparisonRows.filter(r => r.subj_delta_pct != null);
    const withObj  = comparisonRows.filter(r => r.obj_delta_pct  != null);
    const mae = arr => arr.length === 0 ? null : arr.reduce((s, r) => s + Math.abs(r), 0) / arr.length;
    return {
      subjMAE: mae(withSubj.map(r => r.subj_delta_pct)),
      objMAE:  mae(withObj.map(r => r.obj_delta_pct)),
      subjWithin5: withSubj.length === 0 ? null : withSubj.filter(r => Math.abs(r.subj_delta_pct) <= 5).length / withSubj.length * 100,
      objWithin5:  withObj.length  === 0 ? null : withObj.filter(r  => Math.abs(r.obj_delta_pct)  <= 5).length / withObj.length  * 100,
      years: comparisonRows.length,
    };
  }, [comparisonRows]);

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-3">Forecast Accuracy</h3>
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-2">Forecast Accuracy</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Subjective (May) + Objective (July) ABC forecasts will appear here once
          the scraper ingests them. <code className="text-gray-400">abc-scraper.js</code>
          has <code className="text-gray-400">scrapeSubjectiveForecasts</code> and
          <code className="text-gray-400">scrapeObjectiveForecasts</code> built; they run
          on every workflow push alongside the position-report scrape.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">Forecast Accuracy — Subjective vs Objective vs Actual</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          How close were ABC's May Subjective and July Objective forecasts to the final crop?
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Subjective MAE</p>
          <p className="text-lg font-bold text-purple-400 mt-1">{fmtPct(kpis.subjMAE)}</p>
          <p className="text-[10px] text-gray-600 mt-1">mean abs delta</p>
        </div>
        <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Objective MAE</p>
          <p className="text-lg font-bold text-blue-400 mt-1">{fmtPct(kpis.objMAE)}</p>
          <p className="text-[10px] text-gray-600 mt-1">mean abs delta</p>
        </div>
        <div className="border border-purple-500/20 bg-purple-500/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Subjective within 5%</p>
          <p className="text-lg font-bold text-purple-400 mt-1">{kpis.subjWithin5 != null ? `${kpis.subjWithin5.toFixed(0)}%` : '—'}</p>
          <p className="text-[10px] text-gray-600 mt-1">hit rate</p>
        </div>
        <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Objective within 5%</p>
          <p className="text-lg font-bold text-blue-400 mt-1">{kpis.objWithin5 != null ? `${kpis.objWithin5.toFixed(0)}%` : '—'}</p>
          <p className="text-[10px] text-gray-600 mt-1">hit rate</p>
        </div>
      </div>

      {/* Overlay line chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={comparisonRows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="forecast_year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `${(v / 1e9).toFixed(1)}B`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(v, name) => [fmtB(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Line type="monotone" dataKey="subjective" stroke={COLORS.subjective} name="Subjective (May)" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="objective"  stroke={COLORS.objective}  name="Objective (July)" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="actual"     stroke={COLORS.actual}     name="Actual (receipts)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Comparison table */}
      <div className="overflow-x-auto mt-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Year</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Subjective</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Objective</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Actual</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Subj Δ</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Obj Δ</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(r => (
              <tr key={r.forecast_year} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2 px-3 text-white font-medium">{r.forecast_year}</td>
                <td className="py-2 px-3 text-right text-purple-400 font-mono">{fmtB(r.subjective)}</td>
                <td className="py-2 px-3 text-right text-blue-400 font-mono">{fmtB(r.objective)}</td>
                <td className="py-2 px-3 text-right text-green-400 font-mono">{fmtB(r.actual)}</td>
                <td className={`py-2 px-3 text-right font-mono ${r.subj_delta_pct == null ? 'text-gray-600' : Math.abs(r.subj_delta_pct) <= 5 ? 'text-green-400' : 'text-amber-400'}`}>
                  {fmtPct(r.subj_delta_pct)}
                </td>
                <td className={`py-2 px-3 text-right font-mono ${r.obj_delta_pct == null ? 'text-gray-600' : Math.abs(r.obj_delta_pct) <= 5 ? 'text-green-400' : 'text-amber-400'}`}>
                  {fmtPct(r.obj_delta_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-600 mt-4 leading-relaxed">
        Source: <code>abc_forecasts</code> (Subjective May + Objective July from almonds.org) vs
        <code>abc_position_reports</code> (max-monthly receipts per crop year = actual final marketable).
        Green delta = forecast was within 5% of actual; amber = miss &gt; 5%.
      </p>
    </div>
  );
}
