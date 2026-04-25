// CropsIntel V2 — V3 Preview Layout
// 2026-04-25 · Mini-Phase 6 (V3 preview foundation)
//
// Self-contained sidebar + top-bar shell for the /v3-preview/* tree. Users
// reach this from a "View V3 preview ↗" toggle pill in the current app's
// top bar (team-gated). Renders the proposed new IA from
// docs/V2_GAP_AUDIT.md §3:
//
//   WORK     — Dashboard, Trading Desk, CRM
//   MARKET   — Supply, Destinations, Pricing, Forecasts, Analysis
//   INTEL    — News, Intelligence, Reports
//   DATA     — Data Hub (NEW), Sources
//   ADMIN    — Team & Users, Broadcasts, Autonomous, Settings
//
// Each preview page sits at /v3-preview/<slug> and is wrapped by this layout.
// A persistent banner reminds the user this is a preview and feedback drives
// per-page approval before the preview replaces the current page.

import React from 'react';
import { Link, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const PREVIEW_NAV = [
  {
    label: 'WORK',
    items: [
      { path: '/v3-preview/dashboard', label: 'Dashboard', icon: '📊', stub: true },
      { path: '/v3-preview/trading',   label: 'Trading Desk', icon: '💼', stub: true },
      { path: '/v3-preview/crm',       label: 'CRM',          icon: '🤝', stub: true },
    ],
  },
  {
    label: 'MARKET',
    items: [
      { path: '/v3-preview/supply',       label: 'Supply',       icon: '⚖️',  stub: true },
      { path: '/v3-preview/destinations', label: 'Destinations', icon: '🌍',  stub: true },
      { path: '/v3-preview/pricing',      label: 'Pricing',      icon: '💰',  stub: true },
      { path: '/v3-preview/forecasts',    label: 'Forecasts',    icon: '🔮',  stub: true },
      { path: '/v3-preview/analysis',     label: 'Analysis',     icon: '📈',  stub: true },
    ],
  },
  {
    label: 'INTEL',
    items: [
      { path: '/v3-preview/news',         label: 'News',         icon: '📰', stub: true },
      { path: '/v3-preview/intelligence', label: 'Intelligence', icon: '🧠', stub: true },
      { path: '/v3-preview/reports',      label: 'Reports',      icon: '📋', stub: true },
    ],
  },
  {
    label: 'DATA',
    items: [
      { path: '/v3-preview/data-hub', label: 'Data Hub',  icon: '📥', stub: false },
      { path: '/v3-preview/sources',  label: 'Sources',   icon: '🩺', stub: true },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { path: '/v3-preview/team',       label: 'Team & Users', icon: '👥', stub: true },
      { path: '/v3-preview/broadcasts', label: 'Broadcasts',   icon: '📣', stub: true },
      { path: '/v3-preview/autonomous', label: 'Autonomous',   icon: '🤖', stub: true },
      { path: '/v3-preview/settings',   label: 'Settings',     icon: '⚙️', stub: true },
    ],
  },
];

export default function V3PreviewLayout({ children }) {
  const { profile, user } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* V3 Preview sidebar (new IA) */}
      <aside className="hidden lg:flex w-64 bg-gray-900 border-r border-purple-900/50 flex-col min-h-screen shrink-0">
        {/* Brand header — purple accent so this can't be confused with prod */}
        <div className="p-5 border-b border-purple-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/20">
              CI
            </div>
            <div>
              <h1 className="text-base font-bold text-white">CropsIntel</h1>
              <p className="text-[10px] text-purple-400 tracking-wide font-semibold">V3 PREVIEW</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {PREVIEW_NAV.map(section => (
            <div key={section.label}>
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all border ${
                        isActive
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-sm shadow-purple-500/10'
                          : item.stub
                          ? 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50 border-transparent'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border-transparent'
                      }`}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="truncate flex-1">{item.label}</span>
                      {item.stub && !isActive && (
                        <span className="text-[8px] text-gray-700 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-800 uppercase tracking-wider">soon</span>
                      )}
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Back-to-current button */}
        <div className="p-3 border-t border-purple-900/50">
          <Link
            to="/dashboard"
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-800 transition-colors border border-gray-700/50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">Back to current app</span>
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* V3 preview top bar */}
        <header className="bg-gray-900 border-b border-purple-900/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
              V3 PREVIEW
            </div>
            <span className="text-xs text-gray-500">
              Shaped by <Link to="/v3-preview/audit" className="text-purple-400 hover:text-purple-300 underline">V2_GAP_AUDIT.md</Link> · Feedback in chat replaces this with the live page
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-white font-medium leading-tight truncate max-w-[140px]">
                {profile?.full_name || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-[9px] text-gray-500 truncate max-w-[140px]">
                {profile?.role || ''} · preview mode
              </p>
            </div>
            <Link
              to="/dashboard"
              className="px-3 py-1.5 text-[11px] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            >
              ← Exit preview
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>

        {/* Bottom feedback banner */}
        <div className="bg-purple-950/30 border-t border-purple-900/50 px-6 py-3">
          <p className="text-[11px] text-purple-300/80 text-center">
            🧪 You're previewing the V3 redesign. Approve in chat → this preview replaces the current production page in the next push.
            Reject or request changes → I revise based on your feedback.
          </p>
        </div>
      </div>
    </div>
  );
}
