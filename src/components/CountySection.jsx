// County Intelligence section — reads abc_acreage_reports WHERE
// source_type='land_iq' and shows county-level bearing acreage.
// Falls back to a friendly empty state when Land IQ hasn't been scraped
// yet (the acreage_landiq URL in abc-scraper.js is declared but the scraper
// loop currently only fetches USDA-NASS).

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import FilterBar from './FilterBar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

const COUNTY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4',
  '#ef4444', '#10b981', '#eab308', '#f97316', '#ec4899',
  '#84cc16', '#14b8a6', '#8b5cf6', '#f43f5e', '#6366f1',
];

export default function CountySection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);
  const [comparedCounties, setComparedCounties] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('abc_acreage_reports')
        .select('*')
        .eq('source_type', 'land_iq')
        .order('report_year', { ascending: true });
      if (data) {
        setReports(data);
        if (data.length) setSelectedYear(data[data.length - 1].report_year);
      }
      setLoading(false);
    })();
  }, []);

  const yearRows = useMemo(
    () => reports.find(r => r.report_year === selectedYear),
    [reports, selectedYear]
  );

  // county_data is JSONB — format { "Fresno": 98000, "Kern": 160000, ... } (acres).
  // We accept either that object shape or {county: str, acres: number}[] rows.
  const countyList = useMemo(() => {
    if (!yearRows?.county_data) return [];
    const cd = yearRows.county_data;
    if (Array.isArray(cd)) {
      return cd.map(r => ({ county: r.county, acres: r.acres })).sort((a, b) => b.acres - a.acres);
    }
    if (typeof cd === 'object') {
      return Object.entries(cd)
        .map(([county, acres]) => ({ county, acres }))
        .filter(r => typeof r.acres === 'number' && r.acres > 0)
        .sort((a, b) => b.acres - a.acres);
    }
    return [];
  }, [yearRows]);

  const totalAcres = useMemo(
    () => countyList.reduce((s, c) => s + c.acres, 0),
    [countyList]
  );

  useEffect(() => {
    if (comparedCounties.length === 0 && countyList.length > 0) {
      setComparedCounties(countyList.slice(0, 5).map(c => c.county));
    }
  }, [countyList, comparedCounties.length]);

  const toggleCounty = (county) => {
    setComparedCounties(prev =>
      prev.includes(county) ? prev.filter(c => c !== county) : [...prev, county]
    );
  };

  // Trend: county acreage year-over-year for selected counties
  const trendData = useMemo(() => {
    return reports.map(r => {
      const row = { year: r.report_year };
      const cd = r.county_data || {};
      const obj = Array.isArray(cd)
        ? Object.fromEntries(cd.map(x => [x.county, x.acres]))
        : cd;
      for (const c of comparedCounties) {
        row[c] = (typeof obj[c] === 'number') ? obj[c] : 0;
      }
      return row;
    });
  }, [reports, comparedCounties]);

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-3">County Intelligence</h3>
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-2">County Intelligence</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          County-level bearing acreage (Fresno, Kern, Madera, Merced, Stanislaus, Tulare, Kings, San Joaquin, Colusa) will appear here once the Land IQ scraper ingests almonds.org acreage PDFs.
          The scraper URL <code className="text-gray-400">acreage_landiq</code> is declared in <code className="text-gray-400">abc-scraper.js</code>; hooking it into the main loop is Phase B5b.
        </p>
      </div>
    );
  }

  if (countyList.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-2">County Intelligence</h3>
        <p className="text-xs text-gray-500">
          Land IQ report for {selectedYear} is in the table but has no <code>county_data</code> JSONB yet.
          The parser needs to be updated to populate county rows.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">County Intelligence — Bearing Acreage</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Land IQ county-level acreage from almonds.org — {reports.length} year{reports.length > 1 ? 's' : ''} × {countyList.length} counties
        </p>
      </div>

      <FilterBar
        label="Land IQ report year"
        options={reports.map(r => ({ value: r.report_year, label: String(r.report_year) }))}
        selected={[selectedYear]}
        onToggle={v => setSelectedYear(v)}
      />

      {/* Top counties bar chart for selected year */}
      <div className="mt-4">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
          Top counties — {selectedYear}
        </h4>
        <ResponsiveContainer width="100%" height={Math.max(260, countyList.length * 22)}>
          <BarChart data={countyList.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
            <YAxis type="category" dataKey="county" tick={{ fill: '#9ca3af', fontSize: 10 }} width={100} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={v => [`${v?.toLocaleString()} acres`]}
            />
            <Bar dataKey="acres" name="Bearing acres">
              {countyList.slice(0, 15).map((c, i) => (
                <Cell key={c.county} fill={COUNTY_COLORS[i % COUNTY_COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* County compare across years */}
      {reports.length > 1 && (
        <div className="mt-6">
          <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Year-over-year — pick counties to compare
          </h4>
          <FilterBar
            options={countyList.slice(0, 15).map((c, i) => ({
              value: c.county,
              label: c.county,
              color: COUNTY_COLORS[i % COUNTY_COLORS.length],
            }))}
            selected={comparedCounties}
            onToggle={toggleCounty}
            quickActions={[
              { label: 'Top 5', action: () => setComparedCounties(countyList.slice(0, 5).map(c => c.county)) },
              { label: 'Clear', action: () => setComparedCounties([]) },
            ]}
            emptyHint="Pick at least one county"
          />
          {comparedCounties.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={v => [`${v?.toLocaleString()} acres`]}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {comparedCounties.map((c, i) => (
                  <Bar
                    key={c}
                    dataKey={c}
                    name={c}
                    fill={COUNTY_COLORS[countyList.findIndex(x => x.county === c) % COUNTY_COLORS.length] || '#3b82f6'}
                    fillOpacity={0.8}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-600 mt-4">
        Source: <code>abc_acreage_reports</code> (source_type='land_iq'). Total {selectedYear}: {totalAcres.toLocaleString()} acres across {countyList.length} counties.
      </p>
    </div>
  );
}
