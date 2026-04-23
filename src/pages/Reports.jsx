import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toNum } from '../lib/utils';
import FilterBar, { CROP_YEAR_COLORS } from '../components/FilterBar';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COLUMNS = [
  { key: 'period', label: 'Period', align: 'left', sortKey: r => r.report_year * 100 + r.report_month },
  { key: 'crop_year', label: 'Crop Year', align: 'left', sortKey: r => r.crop_year },
  { key: 'total_supply_lbs', label: 'Total Supply', align: 'right', color: 'text-green-400' },
  { key: 'carry_in_lbs', label: 'Carry In', align: 'right', color: 'text-gray-300' },
  { key: 'receipts_lbs', label: 'Receipts', align: 'right', color: 'text-gray-300' },
  { key: 'domestic_shipped_lbs', label: 'Dom Ship', align: 'right', color: 'text-gray-300' },
  { key: 'export_shipped_lbs', label: 'Exp Ship', align: 'right', color: 'text-gray-300' },
  { key: 'total_shipped_lbs', label: 'Total Ship', align: 'right', color: 'text-white font-medium' },
  { key: 'domestic_committed_lbs', label: 'Dom Commit', align: 'right', color: 'text-cyan-400' },
  { key: 'export_committed_lbs', label: 'Exp Commit', align: 'right', color: 'text-cyan-400' },
  { key: 'total_committed_lbs', label: 'Total Commit', align: 'right', color: 'text-blue-400' },
  { key: 'domestic_new_commitments_lbs', label: 'New Dom', align: 'right', color: 'text-purple-400' },
  { key: 'export_new_commitments_lbs', label: 'New Exp', align: 'right', color: 'text-purple-400' },
  { key: 'total_new_commitments_lbs', label: 'New Total', align: 'right', color: 'text-purple-300' },
  { key: 'uncommitted_lbs', label: 'Uncommitted', align: 'right', color: 'text-amber-400' },
  { key: 'sold_pct', label: 'Sold %', align: 'right' },
];

function fmtM(lbs) {
  const n = toNum(lbs);
  if (!n && n !== 0) return '--';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString();
}

function fmtFull(lbs) {
  const n = toNum(lbs);
  if (!n && n !== 0) return '--';
  return n.toLocaleString();
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [sortCol, setSortCol] = useState('period');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [viewMode, setViewMode] = useState('compact'); // compact | expanded
  // Phase C7: multi-year compare chip bar (overlay of multiple crop years)
  const [compareYears, setCompareYears] = useState([]);
  const [compareMode, setCompareMode] = useState(false);

  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false });
        if (cancelled) return;
        if (error) {
          setLoadError(error.message || String(error));
        } else if (data) {
          setReports(data);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        // ALWAYS clear loading — a thrown supabase call was silently leaving
        // the page stuck on the spinner forever (symptom reported 2026-04-23).
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cropYears = useMemo(() =>
    [...new Set(reports.map(r => r.crop_year))].sort().reverse(),
    [reports]
  );

  const months = useMemo(() => {
    const m = [...new Set(reports.map(r => r.report_month))].sort((a, b) => a - b);
    return m;
  }, [reports]);

  // Filter
  const filtered = useMemo(() => {
    let data = reports;
    if (selectedCrop !== 'all') data = data.filter(r => r.crop_year === selectedCrop);
    if (selectedMonth !== 'all') data = data.filter(r => r.report_month === Number(selectedMonth));
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        r.crop_year?.toLowerCase().includes(q) ||
        `${r.report_year}/${String(r.report_month).padStart(2, '0')}`.includes(q) ||
        MONTH_NAMES[r.report_month]?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [reports, selectedCrop, selectedMonth, search]);

  // Sort
  const sorted = useMemo(() => {
    const colDef = COLUMNS.find(c => c.key === sortCol);
    return [...filtered].sort((a, b) => {
      let va, vb;
      if (colDef?.sortKey) {
        va = colDef.sortKey(a);
        vb = colDef.sortKey(b);
      } else if (sortCol === 'sold_pct') {
        va = a.total_supply_lbs > 0 ? (a.total_supply_lbs - (a.uncommitted_lbs || 0)) / a.total_supply_lbs : 0;
        vb = b.total_supply_lbs > 0 ? (b.total_supply_lbs - (b.uncommitted_lbs || 0)) / b.total_supply_lbs : 0;
      } else {
        va = a[sortCol] || 0;
        vb = b[sortCol] || 0;
      }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [filtered, sortCol, sortAsc]);

  // Prior year lookup
  const priorMap = useMemo(() => {
    const map = {};
    reports.forEach(r => {
      map[`${r.report_year}/${r.report_month}`] = r;
    });
    return map;
  }, [reports]);

  const findPrior = (r) => priorMap[`${r.report_year - 1}/${r.report_month}`];

  // Summary stats
  const summary = useMemo(() => {
    if (!filtered.length) return null;
    const latest = [...filtered].sort((a, b) => (b.report_year * 100 + b.report_month) - (a.report_year * 100 + a.report_month))[0];
    const totalSupply = filtered.reduce((s, r) => s + toNum(r.total_supply_lbs), 0);
    const totalShipped = filtered.reduce((s, r) => s + toNum(r.total_shipped_lbs), 0);
    const totalCommitted = filtered.reduce((s, r) => s + toNum(r.total_committed_lbs), 0);
    const supplyCount = filtered.filter(r => toNum(r.total_supply_lbs) > 0).length;
    const avgSold = supplyCount === 0 ? 0 : filtered.reduce((s, r) => {
      if (!toNum(r.total_supply_lbs)) return s;
      return s + (toNum(r.total_supply_lbs) - toNum(r.uncommitted_lbs)) / toNum(r.total_supply_lbs);
    }, 0) / supplyCount;
    return { latest, totalSupply, totalShipped, totalCommitted, avgSold, count: filtered.length };
  }, [filtered]);

  // Phase C7: per-year totals used when compare mode is on
  const compareStats = useMemo(() => {
    if (!compareYears.length) return [];
    return compareYears.map(cy => {
      const rows = reports.filter(r => r.crop_year === cy);
      const totalSupply    = rows.reduce((s, r) => s + toNum(r.total_supply_lbs), 0);
      const totalShipped   = rows.reduce((s, r) => s + toNum(r.total_shipped_lbs), 0);
      const totalCommitted = rows.reduce((s, r) => s + toNum(r.total_committed_lbs), 0);
      const uncommitted    = rows.reduce((s, r) => s + toNum(r.uncommitted_lbs), 0);
      const latestSoldPct  = rows.length && totalSupply > 0
        ? ((totalSupply - uncommitted) / totalSupply) * 100
        : 0;
      return {
        cropYear: cy,
        color: CROP_YEAR_COLORS[cy] || '#6b7280',
        rowCount: rows.length,
        totalSupply, totalShipped, totalCommitted, uncommitted,
        latestSoldPct,
      };
    });
  }, [reports, compareYears]);

  const yoyBadge = (current, prior) => {
    if (!current || !prior || prior === 0) return null;
    const pct = ((current - prior) / prior * 100).toFixed(1);
    const isUp = pct > 0;
    return (
      <span className={`text-[10px] ml-1 ${isUp ? 'text-green-500' : 'text-red-400'}`}>
        {isUp ? '+' : ''}{pct}%
      </span>
    );
  };

  const handleSort = (colKey) => {
    if (sortCol === colKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colKey);
      setSortAsc(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Period', 'Crop Year', 'Supply (lbs)', 'Carry In', 'Receipts', 'Dom Shipped', 'Exp Shipped', 'Total Shipped', 'Dom Committed', 'Exp Committed', 'Total Committed', 'New Dom Commit', 'New Exp Commit', 'Total New Commit', 'Uncommitted'];
    const rows = sorted.map(r => [
      `${r.report_year}/${String(r.report_month).padStart(2, '0')}`,
      r.crop_year,
      r.total_supply_lbs, r.carry_in_lbs, r.receipts_lbs,
      r.domestic_shipped_lbs, r.export_shipped_lbs, r.total_shipped_lbs,
      r.domestic_committed_lbs, r.export_committed_lbs, r.total_committed_lbs,
      r.domestic_new_commitments_lbs, r.export_new_commitments_lbs, r.total_new_commitments_lbs,
      r.uncommitted_lbs
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cropsintel_reports_${selectedCrop === 'all' ? 'all' : selectedCrop.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Visible columns based on view mode
  const visibleCols = viewMode === 'compact'
    ? COLUMNS.filter(c => ['period', 'crop_year', 'total_supply_lbs', 'total_shipped_lbs', 'total_committed_lbs', 'uncommitted_lbs', 'sold_pct'].includes(c.key))
    : COLUMNS;

  const fmt = showFull ? fmtFull : fmtM;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Position Reports</h2>
          <p className="text-sm text-gray-500 mt-1">
            {reports.length} months of ABC data
            {filtered.length !== reports.length && ` (showing ${filtered.length})`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          This is the raw ABC Position Report data — the official monthly snapshot of California's almond industry.
          "Supply" = Carry-In + Receipts (total available). "Shipped" = actual deliveries that month. "Committed" = sold but not yet shipped. "Uncommitted" = available to sell.
          The "Sold %" column shows what fraction of total supply has been committed or shipped. Higher Sold % = tighter market = stronger pricing power for sellers.
          Use crop year and month filters to drill into specific periods. Export CSV for your own analysis.
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Latest Report</p>
            <p className="text-lg font-bold text-white">
              {MONTH_NAMES[summary.latest.report_month]} {summary.latest.report_year}
            </p>
            <p className="text-xs text-gray-500">{summary.latest.crop_year}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Latest Supply</p>
            <p className="text-lg font-bold text-green-400">{fmtM(summary.latest.total_supply_lbs)}</p>
            <p className="text-xs text-gray-500">{fmtFull(summary.latest.total_supply_lbs)} lbs</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Latest Shipped</p>
            <p className="text-lg font-bold text-white">{fmtM(summary.latest.total_shipped_lbs)}</p>
            <p className="text-xs text-gray-500">{fmtFull(summary.latest.total_shipped_lbs)} lbs</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Avg Sold Rate</p>
            <p className="text-lg font-bold text-blue-400">{(summary.avgSold * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-500">across {summary.count} reports</p>
          </div>
        </div>
      )}

      {/* Phase C7: crop-year compare panel */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-white">Crop Year Compare</h3>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`text-[11px] px-3 py-1 rounded-lg border transition-colors ${
              compareMode
                ? 'border-green-500/40 bg-green-500/10 text-green-400'
                : 'border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {compareMode ? 'Hide compare' : 'Compare mode'}
          </button>
        </div>
        {compareMode && (
          <>
            <FilterBar
              label="Pick crop years to compare"
              options={cropYears.map(cy => ({
                value: cy, label: cy, color: CROP_YEAR_COLORS[cy] || '#6b7280',
              }))}
              selected={compareYears}
              onToggle={(v) => setCompareYears(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
              quickActions={[
                { label: 'Last 3', action: () => setCompareYears(cropYears.slice(0, 3)) },
                { label: 'Last 5', action: () => setCompareYears(cropYears.slice(0, 5)) },
                { label: 'Clear',  action: () => setCompareYears([]) },
              ]}
              emptyHint="Pick 2 or more for side-by-side"
            />
            {compareStats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
                {compareStats.map(stat => (
                  <div
                    key={stat.cropYear}
                    className="rounded-xl p-3 border"
                    style={{ borderColor: stat.color + '44', backgroundColor: stat.color + '0D' }}
                  >
                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: stat.color }}>{stat.cropYear}</p>
                    <p className="text-[10px] text-gray-500 mb-2">{stat.rowCount} monthly reports</p>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-gray-500">Supply</span><span className="text-green-400 font-medium">{fmtM(stat.totalSupply)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Shipped</span><span className="text-white">{fmtM(stat.totalShipped)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Committed</span><span className="text-blue-400">{fmtM(stat.totalCommitted)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Uncommitted</span><span className="text-amber-400">{fmtM(stat.uncommitted)}</span></div>
                      <div className="flex justify-between border-t border-gray-800/60 pt-1 mt-1"><span className="text-gray-500">Sold %</span><span className="text-white font-semibold">{stat.latestSoldPct.toFixed(1)}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl p-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white w-40 focus:outline-none focus:border-green-500 transition-colors"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-500 text-sm">&#128269;</span>
        </div>

        {/* Crop Year */}
        <select
          value={selectedCrop}
          onChange={e => setSelectedCrop(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All Crop Years</option>
          {cropYears.map(cy => <option key={cy} value={cy}>{cy}</option>)}
        </select>

        {/* Month */}
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All Months</option>
          {months.map(m => <option key={m} value={m}>{MONTH_NAMES[m]} ({m})</option>)}
        </select>

        <div className="flex-1" />

        {/* View toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'compact' ? 'expanded' : 'compact')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              viewMode === 'expanded'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {viewMode === 'compact' ? 'Show All Columns' : 'Compact View'}
          </button>
          <button
            onClick={() => setShowFull(!showFull)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showFull
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                : 'border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {showFull ? 'Abbreviated' : 'Full Numbers'}
          </button>
        </div>
      </div>

      {/* Data Table */}
      {sorted.length > 0 ? (
        <div className="overflow-x-auto border border-gray-800 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/80">
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`py-3 px-3 font-medium text-xs cursor-pointer select-none transition-colors hover:text-white ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${sortCol === col.key ? 'text-green-400' : 'text-gray-400'}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && (
                        <span className="text-green-400">{sortAsc ? '\u25B2' : '\u25BC'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const py = findPrior(r);
                const rSupply = toNum(r.total_supply_lbs);
                const soldPct = rSupply > 0
                  ? ((rSupply - toNum(r.uncommitted_lbs)) / rSupply * 100).toFixed(1)
                  : '--';
                return (
                  <tr
                    key={r.id || idx}
                    className="border-t border-gray-800/50 hover:bg-gray-900/50 transition-colors"
                  >
                    {visibleCols.map(col => {
                      if (col.key === 'period') {
                        return (
                          <td key={col.key} className="py-2.5 px-3 text-white font-medium whitespace-nowrap">
                            {MONTH_NAMES[r.report_month]} {r.report_year}
                          </td>
                        );
                      }
                      if (col.key === 'crop_year') {
                        return (
                          <td key={col.key} className="py-2.5 px-3 text-gray-400 text-xs">{r.crop_year}</td>
                        );
                      }
                      if (col.key === 'sold_pct') {
                        return (
                          <td key={col.key} className="py-2.5 px-3 text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              soldPct >= 80 ? 'bg-green-500/15 text-green-400' :
                              soldPct >= 60 ? 'bg-blue-500/15 text-blue-400' :
                              soldPct >= 40 ? 'bg-amber-500/15 text-amber-400' :
                              'bg-gray-500/15 text-gray-400'
                            }`}>
                              {soldPct}%
                            </span>
                            {yoyBadge(
                              rSupply > 0 ? (rSupply - toNum(r.uncommitted_lbs)) / rSupply : 0,
                              py && toNum(py.total_supply_lbs) > 0 ? (toNum(py.total_supply_lbs) - toNum(py.uncommitted_lbs)) / toNum(py.total_supply_lbs) : 0
                            )}
                          </td>
                        );
                      }
                      // Numeric columns
                      const val = r[col.key];
                      const pyVal = py?.[col.key];
                      return (
                        <td key={col.key} className={`py-2.5 px-3 text-right ${col.color || 'text-gray-300'} whitespace-nowrap`}>
                          {fmt(val)}
                          {['total_supply_lbs', 'total_shipped_lbs', 'total_committed_lbs', 'uncommitted_lbs'].includes(col.key) && yoyBadge(val, pyVal)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-xl text-gray-400 mb-2">No reports found</p>
          <p className="text-sm text-gray-600">
            {search || selectedCrop !== 'all' || selectedMonth !== 'all'
              ? 'Try adjusting your filters'
              : 'Run the scraper to fetch ABC data'}
          </p>
        </div>
      )}

      {/* Row count */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Showing {sorted.length} of {reports.length} reports</span>
          <span>
            Sort: {COLUMNS.find(c => c.key === sortCol)?.label} ({sortAsc ? 'ascending' : 'descending'})
          </span>
        </div>
      )}
    </div>
  );
}
