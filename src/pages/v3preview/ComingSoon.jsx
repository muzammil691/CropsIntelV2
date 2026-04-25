// CropsIntel V2 — V3 Preview · Coming Soon stub
// 2026-04-25 · Mini-Phase 6
//
// Generic placeholder for /v3-preview/<slug> routes that haven't been
// designed yet. Maintains the V3PreviewLayout shell so users can keep
// navigating; tells them which preview lands next.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import V3PreviewLayout from './Layout';

const ROADMAP = [
  { slug: 'data-hub',     status: 'live',     desc: 'Drag-drop uploads, coverage grid, scraper health' },
  { slug: 'layout',       status: 'next',     desc: 'New WORK / MARKET / INTEL / DATA / ADMIN sidebar across the app' },
  { slug: 'dashboard',    status: 'queued',   desc: 'Reordered widgets, inline Supply→CRM links, freight placeholder' },
  { slug: 'crm',          status: 'queued',   desc: 'New Contracts tab — upload PDF, renewal alerts, deal linkage' },
  { slug: 'trading',      status: 'queued',   desc: 'Honest portal copy, freight free-text, offer→deal link' },
  { slug: 'destinations', status: 'queued',   desc: 'Modeled-data banner with explicit "real data lands" date' },
  { slug: 'reports',      status: 'queued',   desc: 'Inline "Flag this row" / "Upload correction" → Data Hub' },
  { slug: 'sources',      status: 'queued',   desc: 'Per-scraper health page (sub-page of Data Hub)' },
];

export default function V3ComingSoon() {
  const location = useLocation();
  const slug = location.pathname.replace('/v3-preview/', '').replace(/\/$/, '') || 'unknown';
  const entry = ROADMAP.find(r => r.slug === slug);

  return (
    <V3PreviewLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider bg-gray-800 text-gray-400 border border-gray-700 uppercase">
            Preview not built yet
          </span>
          <h1 className="text-2xl font-bold text-white mt-3 mb-1">
            {slug === 'unknown' ? 'Unknown preview' : `/v3-preview/${slug}`}
          </h1>
          <p className="text-sm text-gray-400">
            {entry?.desc || 'This preview slug doesn\'t exist on the V3 roadmap yet.'}
          </p>
        </div>

        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">V3 preview roadmap</h2>
          <ul className="space-y-2">
            {ROADMAP.map(r => (
              <li
                key={r.slug}
                className={`flex items-start gap-3 p-2.5 rounded-lg ${
                  r.slug === slug ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-gray-950/50'
                }`}
              >
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider w-14 text-center shrink-0 ${
                  r.status === 'live'   ? 'bg-green-500/15 text-green-300 border border-green-500/30' :
                  r.status === 'next'   ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30' :
                  'bg-gray-700/30 text-gray-400 border border-gray-700/50'
                }`}>
                  {r.status}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">/v3-preview/{r.slug}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </div>
                {r.status === 'live' && (
                  <Link to={`/v3-preview/${r.slug}`} className="text-xs text-purple-400 hover:text-purple-300 underline">
                    Open →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/v3-preview/data-hub"
            className="px-4 py-2 text-sm font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/15 transition-colors"
          >
            ← Back to Data Hub
          </Link>
          <Link
            to="/dashboard"
            className="px-4 py-2 text-sm font-medium text-gray-400 border border-gray-700 rounded-lg hover:text-white hover:border-gray-600 transition-colors"
          >
            Exit preview
          </Link>
        </div>
      </div>
    </V3PreviewLayout>
  );
}
