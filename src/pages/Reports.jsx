import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState('all');

  useEffect(() => {
    async function loadReports() {
      const { data } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false });

      if (data) setReports(data);
      setLoading(false);
    }
    loadReports();
  }, []);

  const fmtM = (lbs) => {
    if (!lbs) return '--';
    return (lbs / 1e6).toFixed(0) + 'M';
  };

  const cropYears = [...new Set(reports.map(r => r.crop_year))].sort().reverse();
  const filtered = selectedCrop === 'all' ? reports : reports.filter(r => r.crop_year === selectedCrop);

  // Find YoY match for a report
  const findPriorYear = (report) => {
    return reports.find(r =>
      r.report_month === report.report_month &&
      r.report_year === report.report_year - 1
    );
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Position Reports</h2>
          <p className="text-sm text-gray-500 mt-1">{reports.length} months of ABC data</p>
        </div>
        <select
          value={selectedCrop}
          onChange={e => setSelectedCrop(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All Crop Years</option>
          {cropYears.map(cy => <option key={cy} value={cy}>{cy}</option>)}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-3 text-gray-400 font-medium text-xs">Period</th>
                <th className="text-left py-3 px-3 text-gray-400 font-medium text-xs">Crop</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Supply</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Dom Ship</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Exp Ship</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Total Ship</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Committed</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Uncommitted</th>
                <th className="text-right py-3 px-3 text-gray-400 font-medium text-xs">Sold %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const py = findPriorYear(r);
                const soldPct = r.total_supply_lbs > 0
                  ? ((r.total_shipped_lbs + r.total_committed_lbs) / r.total_supply_lbs * 100).toFixed(1)
                  : '--';
                return (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 px-3 text-white font-medium">
                      {r.report_year}/{String(r.report_month).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-3 text-gray-500 text-xs">{r.crop_year}</td>
                    <td className="py-3 px-3 text-right text-green-400">
                      {fmtM(r.total_supply_lbs)}
                      {yoyBadge(r.total_supply_lbs, py?.total_supply_lbs)}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300">{fmtM(r.domestic_shipped_lbs)}</td>
                    <td className="py-3 px-3 text-right text-gray-300">{fmtM(r.export_shipped_lbs)}</td>
                    <td className="py-3 px-3 text-right text-white font-medium">
                      {fmtM(r.total_shipped_lbs)}
                      {yoyBadge(r.total_shipped_lbs, py?.total_shipped_lbs)}
                    </td>
                    <td className="py-3 px-3 text-right text-blue-400">
                      {fmtM(r.total_committed_lbs)}
                      {yoyBadge(r.total_committed_lbs, py?.total_committed_lbs)}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400">{fmtM(r.uncommitted_lbs)}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        soldPct >= 30 ? 'bg-green-500/15 text-green-400' :
                        soldPct >= 20 ? 'bg-blue-500/15 text-blue-400' :
                        'bg-gray-500/15 text-gray-400'
                      }`}>
                        {soldPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-xl text-gray-400 mb-2">No reports yet</p>
          <p className="text-sm text-gray-600">
            Run the scraper to fetch ABC data
          </p>
        </div>
      )}
    </div>
  );
}
