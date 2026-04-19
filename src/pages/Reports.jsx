import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReports() {
      const { data } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false })
        .limit(24);

      if (data) setReports(data);
      setLoading(false);
    }
    loadReports();
  }, []);

  const formatLbs = (lbs) => {
    if (!lbs) return '—';
    return (lbs / 1e6).toFixed(1) + 'M';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-white mb-6">Position Reports</h2>

      {reports.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Crop Year</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Shipments</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Committed</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Uncommitted</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Supply</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-3 px-4 text-white">{r.report_year}/{r.report_month}</td>
                  <td className="py-3 px-4 text-gray-400">{r.crop_year}</td>
                  <td className="py-3 px-4 text-right text-white">{formatLbs(r.total_shipped_lbs)}</td>
                  <td className="py-3 px-4 text-right text-blue-400">{formatLbs(r.total_committed_lbs)}</td>
                  <td className="py-3 px-4 text-right text-amber-400">{formatLbs(r.uncommitted_lbs)}</td>
                  <td className="py-3 px-4 text-right text-green-400">{formatLbs(r.total_supply_lbs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-xl text-gray-400 mb-2">No reports yet</p>
          <p className="text-sm text-gray-600">
            Run <code className="bg-gray-800 px-2 py-1 rounded text-green-400">npm run scrape</code> to fetch ABC data
          </p>
        </div>
      )}
    </div>
  );
}
