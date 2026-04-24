// PersonaBanner — role-aware welcome + 3 quick actions on /dashboard.
//
// MVP of Phase D (Persona Views). Reads profile.role from useAuth and
// renders a tagline + 3 curated shortcuts for the user's role. Every role
// also gets a 4th link to /intelligence (Zyra) which is universal.
//
// This is the first real persona-aware UI in V2 — previously every role
// saw the exact same dashboard. Future phases can build full role-specific
// page layouts; this banner surfaces the rule immediately.

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// role -> { icon, title, tagline, actions[] }
const PERSONA_MAP = {
  grower: {
    icon: '🌱',
    title: 'Grower',
    tagline: 'Harvest timing, variety mix, and packer-call insights for your orchard.',
    accent: 'emerald',
    actions: [
      { label: 'Variety Intelligence', to: '/forecasts', desc: 'Nonpareil vs Monterey vs Independence by crop year' },
      { label: 'Crop Production', to: '/forecasts', desc: 'Actual receipts + forecast accuracy' },
      { label: 'County Breakdown', to: '/forecasts', desc: 'Land IQ acreage trends (when available)' },
    ],
  },
  supplier: {
    icon: '🏭',
    title: 'Handler / Packer',
    tagline: 'Handler-level position, pool selling dynamics, and quality mix.',
    accent: 'blue',
    actions: [
      { label: 'Supply & Demand', to: '/supply', desc: 'Commit rate, ship rate, uncommitted inventory' },
      { label: 'Variety Mix', to: '/forecasts', desc: 'Crop receipts breakdown by variety' },
      { label: 'Pricing', to: '/pricing', desc: 'Live almond pricing across every variety and grade' },
    ],
  },
  processor: {
    icon: '⚙️',
    title: 'Processor / Manufacturer',
    tagline: 'Inbound variety contracts, crop composition, and market trends.',
    accent: 'cyan',
    actions: [
      { label: 'Variety Intelligence', to: '/forecasts', desc: 'Variety share + YoY trend compare' },
      { label: 'Pricing', to: '/pricing', desc: 'Variety × grade compare with history' },
      { label: 'Forecast Accuracy', to: '/forecasts', desc: 'How reliable are ABC forecasts?' },
    ],
  },
  broker: {
    icon: '🤝',
    title: 'Broker',
    tagline: 'Cross-market arbitrage intel, destination flow trends, and offer building.',
    accent: 'amber',
    actions: [
      { label: 'Destinations Compare', to: '/destinations', desc: 'Country × year volume overlay' },
      { label: 'Market Analysis', to: '/analysis', desc: '11-year crop-year overlay' },
      { label: 'Trading Portal', to: '/trading', desc: 'Offer builder + CRM pipeline' },
    ],
  },
  buyer: {
    icon: '🛒',
    title: 'Buyer / Importer',
    tagline: 'Sourcing strategies, price alerts, and personalized market briefs.',
    accent: 'green',
    actions: [
      { label: 'Pricing', to: '/pricing', desc: 'Variety × grade compare — what to buy when' },
      { label: 'Destinations', to: '/destinations', desc: 'Where the flow is going + YoY' },
      { label: 'Market Sentiment', to: '/news', desc: 'Source × category × weekly sentiment' },
    ],
  },
  trader: {
    icon: '📊',
    title: 'Trader',
    tagline: 'Timing signals, deal analytics, and AI trade prescriptions.',
    accent: 'purple',
    actions: [
      { label: 'Market Analysis', to: '/analysis', desc: 'Overlay any 11 crop years' },
      { label: 'Supply & Demand', to: '/supply', desc: 'Commit/ship rates, uncommitted' },
      { label: 'Trading Portal', to: '/trading', desc: 'Offer builder + deal pipeline' },
    ],
  },
  analyst: {
    icon: '📈',
    title: 'Market Analyst',
    tagline: 'Conference-ready trend reports with 10+ years of verified data.',
    accent: 'purple',
    actions: [
      { label: 'Analysis', to: '/analysis', desc: 'Crop-year overlays, deltas, summaries' },
      { label: 'Reports', to: '/reports', desc: 'Full position-report data + CSV' },
      { label: 'Forecast Accuracy', to: '/forecasts', desc: 'Subjective vs Objective vs Actual' },
    ],
  },
  logistics: {
    icon: '🚚',
    title: 'Logistics / Freight',
    tagline: 'Destination flow patterns, trade-lane trends, and capacity signals.',
    accent: 'cyan',
    actions: [
      { label: 'Destinations', to: '/destinations', desc: 'Country-level export flow' },
      { label: 'Trade News', to: '/news', desc: 'Trade-policy + regulatory updates' },
      { label: 'Reports', to: '/reports', desc: 'Monthly shipment detail + CSV' },
    ],
  },
  finance: {
    icon: '💼',
    title: 'Trade Finance',
    tagline: 'Deal compatibility scoring, counterparty intel, and price-risk visibility.',
    accent: 'amber',
    actions: [
      { label: 'CRM Pipeline', to: '/crm', desc: 'Deal stages, counterparties, activities' },
      { label: 'Pricing', to: '/pricing', desc: 'Price volatility + variety comparison' },
      { label: 'Analysis', to: '/analysis', desc: 'Long-term supply-demand trends' },
    ],
  },
  other: {
    icon: '👋',
    title: 'Welcome',
    tagline: 'CropsIntel intelligence at your fingertips — start wherever you need.',
    accent: 'gray',
    actions: [
      { label: 'Dashboard', to: '/dashboard', desc: 'KPIs + Monthly AI Brief' },
      { label: 'Market Analysis', to: '/analysis', desc: '11-year overlay comparisons' },
      { label: 'AI Intelligence', to: '/intelligence', desc: 'Ask Zyra anything about the market' },
    ],
  },
  admin: {
    icon: '🛡️',
    title: 'MAXONS Admin',
    tagline: 'Full platform view — CRM, BRM, SRM, scrapers, users. All relationships, all systems.',
    accent: 'purple',
    actions: [
      { label: 'CRM & Deals', to: '/crm', desc: 'Pipeline + Users (tier filter + Verify)' },
      { label: 'Brokers (BRM)', to: '/brokers', desc: 'Market signals + broker pipeline' },
      { label: 'Suppliers (SRM)', to: '/suppliers', desc: 'County analysis + demand signals' },
    ],
  },
  maxons_team: {
    icon: '🏢',
    title: 'MAXONS Team',
    tagline: 'Every relationship, every deal, every signal — the operational cockpit of MAXONS.',
    accent: 'purple',
    actions: [
      { label: 'CRM & Deals', to: '/crm', desc: 'Customer pipeline + bulk invite + verify users' },
      { label: 'Brokers (BRM)', to: '/brokers', desc: 'Market signals + broker pipeline' },
      { label: 'Trading Portal', to: '/trading', desc: 'Offer builder + deal management' },
    ],
  },
  sales: {
    icon: '💼',
    title: 'MAXONS Sales',
    tagline: 'Customer intelligence with Zyra as your coworker — target the right deal at the right time.',
    accent: 'green',
    actions: [
      { label: 'CRM & Deals', to: '/crm', desc: 'Your customer pipeline + Zyra sales tips' },
      { label: 'Trading Portal', to: '/trading', desc: 'Offer builder + margin calculator' },
      { label: 'Pricing', to: '/pricing', desc: 'Variety × grade with MAXONS margin' },
    ],
  },
  seller: {
    icon: '💼',
    title: 'Seller',
    tagline: 'Offer building + margin visibility + customer matching.',
    accent: 'green',
    actions: [
      { label: 'Trading Portal', to: '/trading', desc: 'Offer builder' },
      { label: 'CRM & Deals', to: '/crm', desc: 'Customer pipeline + verification' },
      { label: 'Pricing', to: '/pricing', desc: 'Live Strata + MAXONS margin' },
    ],
  },
};

const ACCENTS = {
  emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'from-emerald-500/10 to-emerald-500/0' },
  blue:    { bar: 'bg-blue-500',    text: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'from-blue-500/10 to-blue-500/0' },
  cyan:    { bar: 'bg-cyan-500',    text: 'text-cyan-400',    border: 'border-cyan-500/30',    bg: 'from-cyan-500/10 to-cyan-500/0' },
  amber:   { bar: 'bg-amber-500',   text: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'from-amber-500/10 to-amber-500/0' },
  green:   { bar: 'bg-green-500',   text: 'text-green-400',   border: 'border-green-500/30',   bg: 'from-green-500/10 to-green-500/0' },
  purple:  { bar: 'bg-purple-500',  text: 'text-purple-400',  border: 'border-purple-500/30',  bg: 'from-purple-500/10 to-purple-500/0' },
  gray:    { bar: 'bg-gray-500',    text: 'text-gray-400',    border: 'border-gray-500/30',    bg: 'from-gray-500/10 to-gray-500/0' },
};

export default function PersonaBanner() {
  const { profile, isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  const role = (profile?.role || 'other').toLowerCase();
  const tier = (profile?.access_tier || '').toLowerCase();
  // MAXONS admin/team tier takes precedence over the role dropdown — if the
  // user is on the team, show them the team persona even if their role is
  // 'buyer' or empty. Keeps admin/maxons_team views stable.
  const key = (tier === 'admin' && PERSONA_MAP.admin) ? 'admin'
             : (tier === 'maxons_team' && PERSONA_MAP.maxons_team) ? 'maxons_team'
             : role;
  const persona = PERSONA_MAP[key] || PERSONA_MAP.other;
  const accent = ACCENTS[persona.accent] || ACCENTS.gray;
  const name = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className={`bg-gradient-to-r ${accent.bg} border ${accent.border} rounded-xl p-5 mb-6`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className={`shrink-0 w-12 h-12 rounded-xl bg-gray-900/60 flex items-center justify-center text-2xl ring-1 ${accent.border}`}>
          {persona.icon}
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Welcome back, {name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gray-900/60 ${accent.text} font-mono`}>
              {persona.title}
            </span>
          </div>
          <p className="text-sm text-white mt-1 font-medium">{persona.tagline}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        {persona.actions.map((a, i) => (
          <Link
            key={i}
            to={a.to}
            className="block bg-gray-900/60 border border-gray-800 hover:border-gray-600 rounded-lg p-3 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${accent.bar}`} />
              <span className="text-xs font-semibold text-white group-hover:text-white">{a.label}</span>
              <span className={`ml-auto text-[10px] ${accent.text} opacity-0 group-hover:opacity-100 transition-opacity`}>→</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
