// Almanac Intelligence section — reads abc_almanac (annual year-end
// industry reports from ABC). Each row is one year with pages, crop_year,
// summary_text excerpt, and optional key_stats JSONB.
//
// Renders as a year-grid with year, page count, summary snippet, and a
// click-to-expand full summary modal (inline expansion).

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function AlmanacCard({ row, expanded, onToggle }) {
  const stats = row.key_stats || {};
  const statEntries = Object.entries(stats).slice(0, 4);
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-base font-semibold text-white">{row.almanac_year} Almanac</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">Crop year {row.crop_year} · {row.num_pages || '—'} pages</p>
        </div>
        {row.source_pdf && (
          <a href={row.source_pdf} target="_blank" rel="noopener noreferrer"
             className="text-[10px] text-blue-400 hover:text-blue-300">PDF ↗</a>
        )}
      </div>

      {statEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
          {statEntries.map(([k, v]) => (
            <div key={k} className="bg-gray-800/40 rounded-lg p-2">
              <p className="text-[9px] uppercase tracking-wider text-gray-500">{k.replace(/_/g, ' ')}</p>
              <p className="text-xs text-white mt-0.5 truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</p>
            </div>
          ))}
        </div>
      )}

      {row.summary_text && (
        <>
          <p className={`text-xs text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>
            {row.summary_text}
          </p>
          {row.summary_text.length > 280 && (
            <button
              onClick={onToggle}
              className="text-[10px] text-green-400 hover:text-green-300 mt-2"
            >
              {expanded ? '▲ Less' : '▼ More'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function AlmanacSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedYear, setExpandedYear] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('abc_almanac')
        .select('*')
        .order('almanac_year', { ascending: false });
      if (data) setRows(data);
      setLoading(false);
    })();
  }, []);

  const aggregate = useMemo(() => ({
    years: rows.length,
    totalPages: rows.reduce((s, r) => s + (r.num_pages || 0), 0),
    latestYear: rows[0]?.almanac_year,
  }), [rows]);

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-3">Almanac Intelligence</h3>
        <div className="flex items-center justify-center h-28">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-2">Almanac Intelligence</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          ABC Almond Almanac (annual year-end report, typically 100+ pages of industry statistics, pricing summaries,
          and trade data) will appear here once the scraper ingests PDFs from almonds.org/tools-and-resources/crop-reports/almond-almanac.
          The scraper (<code className="text-gray-400">scrapeAlmanac</code> in <code className="text-gray-400">src/scrapers/abc-scraper.js</code>)
          is built but the workflow currently runs in 'position' mode only — needs mode change to 'all' to fire.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Almanac Intelligence</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Annual year-end industry reports from ABC — {aggregate.years} year{aggregate.years !== 1 ? 's' : ''}
            {aggregate.totalPages > 0 && ` · ${aggregate.totalPages} pages`}
            {aggregate.latestYear && ` · latest ${aggregate.latestYear}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(r => (
          <AlmanacCard
            key={r.id}
            row={r}
            expanded={expandedYear === r.almanac_year}
            onToggle={() => setExpandedYear(x => x === r.almanac_year ? null : r.almanac_year)}
          />
        ))}
      </div>

      <p className="text-[10px] text-gray-600 mt-4 leading-relaxed">
        Source: <code>abc_almanac</code> (populated by <code>scrapeAlmanac()</code> in abc-scraper.js).
        Click "PDF ↗" on any card to view the original ABC publication. Summary text is extracted from the first ~5000 chars of the PDF.
        AI-summarized key stats are Phase-B6b.
      </p>
    </div>
  );
}
