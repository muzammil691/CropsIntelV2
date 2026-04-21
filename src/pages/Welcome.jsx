import React from 'react';
import { Link } from 'react-router-dom';

const CAPABILITIES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Supply & Demand Intelligence',
    desc: '10+ years of ABC position reports with carry-in, receipts, commitments, shipments, and uncommitted inventory tracking.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Global Trade Flow',
    desc: 'Shipments by destination country with year-over-year comparison. Track where almonds are going and spot emerging markets.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Live Almond Pricing',
    desc: 'Real-time market prices from Strata and industry sources. MAXONS pricing with competitive margins on every variety.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: 'Crop Forecasts & Acreage',
    desc: 'USDA subjective and objective forecasts, bearing and non-bearing acreage trends, and AI-enhanced yield projections.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    title: 'AI News & Market Impact',
    desc: 'Auto-scraped industry news analyzed by AI for sentiment and market impact. Know what matters before the market reacts.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: '116 Monthly Reports',
    desc: '9 crop years of position reports with full drill-down. Every data point traceable to its source PDF.',
  },
];

const STATS = [
  { value: '10+', label: 'Years of Data' },
  { value: '116', label: 'Position Reports' },
  { value: '9', label: 'Crop Years' },
  { value: '50+', label: 'Countries Tracked' },
];

export default function Welcome() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/20 via-gray-950 to-gray-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-green-500/5 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
          {/* Brand */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
              CI
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">CropsIntel</h1>
              <p className="text-[10px] text-gray-500 tracking-widest uppercase">Autonomous Market Intelligence</p>
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto">
            The World's Most Complete{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
              Almond Market
            </span>{' '}
            Intelligence Platform
          </h2>
          <p className="text-base sm:text-lg text-gray-400 mt-5 max-w-2xl mx-auto leading-relaxed">
            10+ years of ABC data, live pricing, crop forecasts, AI-analyzed news,
            and global trade flows — all in one self-maintaining platform built for
            serious almond traders.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              to="/"
              className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-green-500/20"
            >
              Enter Dashboard
            </Link>
            <Link
              to="/register"
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
            >
              Create Free Account
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-14 max-w-2xl mx-auto">
            {STATS.map(s => (
              <div key={s.label} className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Capabilities Grid */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <p className="text-[10px] text-green-400 uppercase tracking-widest mb-2">Platform Capabilities</p>
          <h3 className="text-2xl font-bold text-white">Everything You Need to Trade Smarter</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPABILITIES.map((cap, i) => (
            <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400 mb-3 group-hover:bg-green-500/20 transition-colors">
                {cap.icon}
              </div>
              <h4 className="text-sm font-semibold text-white mb-1.5">{cap.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Powered By / MAXONS */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="bg-gradient-to-r from-gray-900 to-gray-900/80 border border-gray-800 rounded-2xl p-8 sm:p-10 text-center">
          <p className="text-[10px] text-amber-400 uppercase tracking-widest mb-2">Powered By</p>
          <h3 className="text-xl font-bold text-white mb-3">MAXONS International Trading</h3>
          <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
            CropsIntel is the intelligence backbone of MAXONS — connecting California almond data
            with global trade corridors across the Middle East, Europe, and Asia.
            Every insight is built to help traders make faster, better-informed decisions.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-500">
            <span>Dubai, UAE</span>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <span>California, USA</span>
            <span className="w-1 h-1 rounded-full bg-gray-700" />
            <span>Global Markets</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-[8px]">
              CI
            </div>
            <span>CropsIntel V2</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <Link to="/login" className="hover:text-gray-400 transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-gray-400 transition-colors">Register</Link>
            <Link to="/" className="hover:text-gray-400 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
