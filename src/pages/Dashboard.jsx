import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toNum } from '../lib/utils';
import { getAIStatus, loadAPIKeys } from '../lib/ai-engine';
import { seedAiAnalyses } from '../lib/seed-ai-analyses';
import { getLatestInsights, getKnowledgeStats } from '../lib/intel-processor';
import PersonaBanner from '../components/PersonaBanner';
import PersonaInsights from '../components/PersonaInsights';
import MarketPulseBand from '../components/MarketPulseBand';
import Card from '../components/Card';
import { useAuth } from '../lib/auth';
import { isInternal } from '../lib/permissions';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

// Strip markdown markers, section labels, and truncate text for card previews
// Human-readable labels for spec-aligned roles. Used by the post-invite
// welcome banner so a user sees "Sales Handler" not "sales_handler".
// Legacy roles are passed through via a fallback title-case transform.
const ROLE_LABEL_MAP = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  procurement_head: 'Procurement Head',
  procurement_officer: 'Procurement Officer',
  sales_lead: 'Sales Lead',
  sales_handler: 'Sales Handler',
  sales: 'Sales',
  documentation_lead: 'Documentation Lead',
  documentation_officer: 'Documentation Officer',
  logistics_head: 'Logistics Head',
  logistics_officer: 'Logistics Officer',
  warehouse_manager: 'Warehouse Manager',
  finance_head: 'Finance Head',
  finance_officer: 'Finance Officer',
  compliance_officer: 'Compliance Officer',
  analyst: 'Analyst',
  maxons_team: 'MAXONS Team',
  company_admin: 'Company Admin',
  finance_user: 'Finance User',
  ops_user: 'Ops User',
  procurement_trading_user: 'Procurement / Trading User',
  sales_user: 'Sales User',
  view_only_user: 'View-Only User',
  reseller_both: 'Reseller',
  buyer: 'Buyer',
  seller: 'Seller',
  trader: 'Trader',
  broker: 'Broker',
  grower: 'Grower',
  supplier: 'Handler / Packer',
  processor: 'Processor',
};

function prettyRole(role) {
  if (!role) return 'Team Member';
  return ROLE_LABEL_MAP[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Post-invite welcome banner. Shown once on first Dashboard render after a
// successful /accept-invite flow. Team invitees see the full team-tool map
// so they don't mistake the default persona view for their whole permission
// set (see crosswalk §6 — "team members didn't see team functions at first
// login" root cause). Non-team invitees still see a generic welcome.
function InviteWelcomeBanner({ welcome, onDismiss }) {
  const roleLabel = prettyRole(welcome.role);
  const teamLinks = [
    { to: '/crm',      icon: '🤝', label: 'CRM & Deals',    note: 'Pipeline + invite flow' },
    { to: '/brokers',  icon: '🗺️', label: 'Brokers (BRM)',  note: 'Broker directory + contacts' },
    { to: '/suppliers',icon: '🏭', label: 'Suppliers (SRM)', note: 'Packers + handlers' },
    { to: '/trading',  icon: '💼', label: 'Trading Portal',  note: 'Offer & deal workspace' },
    { to: '/settings#team-panel', icon: '👥', label: 'Team & Users', note: 'Verify users + invitations' },
  ];

  if (!welcome.signInOk) {
    return (
      <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-lg shrink-0">!</div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-amber-300 mb-1">Your account was created — please sign in</h3>
          <p className="text-sm text-gray-300 mb-2">
            We created your profile as a <b>{roleLabel}</b>, but auto-sign-in didn't complete. Confirm your email and sign in at{' '}
            <Link to="/login" className="text-amber-300 underline hover:text-amber-200">/login</Link>.
          </p>
          <button
            onClick={onDismiss}
            className="text-[11px] text-gray-500 hover:text-gray-300"
          >Dismiss</button>
        </div>
      </div>
    );
  }

  if (!welcome.isTeam) {
    // Non-team invitees (buyer etc.) just see a plain friendly banner.
    return (
      <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-base shrink-0">✓</div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-green-300">Welcome to CropsIntel · {roleLabel}</h3>
          <p className="text-xs text-gray-400 mt-1">{welcome.message || 'Your profile is ready. Explore the dashboard and let Zyra guide you.'}</p>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-300">×</button>
      </div>
    );
  }

  // Team invitees get the full team-tool map.
  return (
    <div className="mb-6 bg-gradient-to-br from-green-500/10 via-emerald-500/10 to-blue-500/10 border border-green-500/30 rounded-xl p-5">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-lg shrink-0">★</div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white mb-1">Welcome to the team — you're a {roleLabel}</h3>
          <p className="text-sm text-gray-300">
            Your team permissions are active. Here are the tools your role gets access to (also pinned in the left sidebar under <b>Relationships</b> and <b>Admin</b>).
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-gray-500 hover:text-gray-300"
          title="Dismiss"
        >×</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {teamLinks.map(link => (
          <Link
            key={link.to}
            to={link.to}
            onClick={onDismiss}
            className="flex items-center gap-3 bg-gray-900/60 hover:bg-gray-800 border border-gray-800 hover:border-green-500/40 rounded-lg px-3 py-2.5 transition-all group"
          >
            <span className="text-lg">{link.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white group-hover:text-green-300">{link.label}</div>
              <div className="text-[10px] text-gray-500 truncate">{link.note}</div>
            </div>
            <span className="text-gray-600 group-hover:text-green-400 text-xs">→</span>
          </Link>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-3 italic">
        Tip: check Settings → profile to fill in KYC, trade license, and commercial preferences — these power smarter deal matching as the Trade Hub rolls out.
      </p>
    </div>
  );
}

function truncateText(text, maxLen = 150) {
  if (!text) return '';
  const clean = text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/---+|___+|\*\*\*+/g, ' ')
    .replace(/[-*]\s+/g, '')
    // Strip known section headers from AI briefs
    .replace(/(?:KEY HEADLINE|SUPPLY SITUATION|DEMAND SITUATION|MARKET OUTLOOK|TRADE SIGNAL|SUMMARY|OVERVIEW|CONCLUSION|RECOMMENDATION)\s*[:—\-]?\s*/gi, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function StatCard({ title, value, subtitle, trend, color = 'green' }) {
  const colorMap = {
    green: 'from-green-500/10 to-green-500/5 border-green-500/20',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20'
  };
  const textColor = { green: 'text-green-400', blue: 'text-blue-400', amber: 'text-amber-400', red: 'text-red-400' };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-4`}>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-xl lg:text-2xl font-bold text-white leading-tight">{value}</p>
      {subtitle && <p className="text-[10px] text-gray-500 mt-1 truncate">{subtitle}</p>}
      {trend !== undefined && trend !== null && (
        <p className={`text-[11px] mt-1.5 font-medium ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400'}`}>
          {trend > 0 ? '+' : ''}{trend}% YoY
        </p>
      )}
    </div>
  );
}

function InsightCard({ analysis }) {
  const typeConfig = {
    trade_signal: { border: 'border-blue-500/30 bg-blue-500/5', icon: 'S', iconBg: 'bg-blue-500/20 text-blue-400' },
    monthly_brief: { border: 'border-green-500/30 bg-green-500/5', icon: 'B', iconBg: 'bg-green-500/20 text-green-400' },
    yoy_comparison: { border: 'border-purple-500/30 bg-purple-500/5', icon: 'Y', iconBg: 'bg-purple-500/20 text-purple-400' },
    yoy_analysis: { border: 'border-purple-500/30 bg-purple-500/5', icon: 'Y', iconBg: 'bg-purple-500/20 text-purple-400' },
    seasonal_pattern: { border: 'border-cyan-500/30 bg-cyan-500/5', icon: 'P', iconBg: 'bg-cyan-500/20 text-cyan-400' },
    anomaly: { border: 'border-red-500/30 bg-red-500/5', icon: '!', iconBg: 'bg-red-500/20 text-red-400' },
  };
  const cfg = typeConfig[analysis.analysis_type] || { border: 'border-gray-700 bg-gray-800/50', icon: '?', iconBg: 'bg-gray-500/20 text-gray-400' };

  return (
    <div className={`border rounded-lg p-4 ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cfg.iconBg}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-wider text-gray-500">
              {analysis.analysis_type.replace(/_/g, ' ')}
            </span>
            {analysis.confidence && (
              <span className="text-xs text-gray-600">
                {(analysis.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-white mb-1 truncate">{analysis.title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{truncateText(analysis.summary, 180)}</p>
        </div>
      </div>
    </div>
  );
}

function SampleBadge() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase tracking-wider ml-2">
      Sample Data
    </span>
  );
}

function IntelAlertCard({ insight }) {
  const sentimentConfig = {
    bullish: { bg: 'from-green-500/10 to-green-500/5', border: 'border-green-500/30', badge: 'bg-green-500/20 text-green-400', icon: '↑' },
    bearish: { bg: 'from-red-500/10 to-red-500/5', border: 'border-red-500/30', badge: 'bg-red-500/20 text-red-400', icon: '↓' },
    neutral: { bg: 'from-gray-500/10 to-gray-500/5', border: 'border-gray-500/30', badge: 'bg-gray-500/20 text-gray-400', icon: '→' },
    mixed: { bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-500/30', badge: 'bg-amber-500/20 text-amber-400', icon: '⇄' },
  };
  const urgencyConfig = {
    critical: 'bg-red-500/20 text-red-400',
    high: 'bg-amber-500/20 text-amber-400',
    normal: 'bg-blue-500/20 text-blue-400',
    low: 'bg-gray-500/20 text-gray-500',
  };
  const typeIcons = {
    market_update: '📊', price_signal: '💰', supply_alert: '⚖️',
    demand_shift: '📈', trade_policy: '🌍', quality_report: '✅',
  };

  const s = sentimentConfig[insight.sentiment] || sentimentConfig.neutral;
  const source = insight.intel_reports?.source_name;
  const sourceType = insight.intel_reports?.source_type;

  return (
    <div className={`bg-gradient-to-br ${s.bg} border ${s.border} rounded-xl p-4 transition-all hover:border-opacity-60`}>
      <div className="flex items-start gap-3">
        <div className="text-lg shrink-0 mt-0.5">{typeIcons[insight.insight_type] || '📋'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${s.badge}`}>
              {s.icon} {insight.sentiment}
            </span>
            {insight.urgency && insight.urgency !== 'normal' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${urgencyConfig[insight.urgency] || ''}`}>
                {insight.urgency}
              </span>
            )}
            {source && (
              <span className="text-[9px] text-gray-500">
                via {source}
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium text-white mb-1 leading-snug">{insight.title}</h4>
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{insight.summary}</p>
          {insight.trading_implication && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <p className="text-[10px] text-green-400/80 leading-relaxed">
                <span className="font-semibold">Trade Signal:</span> {insight.trading_implication}
              </p>
            </div>
          )}
          {insight.regions?.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {insight.regions.slice(0, 4).map(r => (
                <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplyPositionWidget({ current, prior }) {
  if (!current) return null;

  // Correct formula: Sold = Total Supply - Uncommitted (not shipped + committed)
  const cSupply = toNum(current.total_supply_lbs);
  const soldCurrent = cSupply - toNum(current.uncommitted_lbs);
  const soldPctCurrent = cSupply > 0 ? (soldCurrent / cSupply * 100) : 0;
  const shippedPctCurrent = cSupply > 0 ? (toNum(current.total_shipped_lbs) / cSupply * 100) : 0;
  const committedPctCurrent = cSupply > 0 ? (toNum(current.total_committed_lbs) / cSupply * 100) : 0;

  let soldPctPrior = null;
  const pSupply = toNum(prior?.total_supply_lbs);
  if (prior && pSupply > 0) {
    const soldPrior = pSupply - toNum(prior.uncommitted_lbs);
    soldPctPrior = (soldPrior / pSupply * 100);
  }

  const delta = soldPctPrior !== null ? (soldPctCurrent - soldPctPrior).toFixed(1) : null;

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-1">Crop Sold Progress</h3>
      <p className="text-[10px] text-gray-500 mb-4">
        {current.crop_year} — total sold as % of total supply
        {prior && <span className="ml-1">vs {prior.crop_year}</span>}
      </p>

      {/* Main progress bar */}
      <div className="relative mb-2">
        <div className="w-full bg-gray-800 rounded-full h-6 overflow-hidden">
          {/* Shipped portion */}
          <div
            className="absolute top-0 left-0 h-6 bg-green-500 rounded-l-full"
            style={{ width: `${Math.min(shippedPctCurrent, 100)}%` }}
          />
          {/* Committed portion (on top of shipped) */}
          <div
            className="absolute top-0 h-6 bg-blue-500/70 rounded-r-full"
            style={{ left: `${Math.min(shippedPctCurrent, 100)}%`, width: `${Math.min(soldPctCurrent - shippedPctCurrent, 100 - shippedPctCurrent)}%` }}
          />
        </div>
        {/* Prior year marker */}
        {soldPctPrior !== null && (
          <div
            className="absolute top-0 h-6 border-r-2 border-dashed border-amber-400"
            style={{ left: `${Math.min(soldPctPrior, 100)}%` }}
            title={`Prior year: ${soldPctPrior.toFixed(1)}%`}
          >
            <div className="absolute -top-5 -translate-x-1/2 text-[9px] text-amber-400 whitespace-nowrap">
              PY {soldPctPrior.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Percentage label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold text-white">{soldPctCurrent.toFixed(1)}%</span>
        {delta !== null && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            delta > 0 ? 'bg-green-500/15 text-green-400' : delta < 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-500/15 text-gray-400'
          }`}>
            {delta > 0 ? '+' : ''}{delta}pp vs prior year
          </span>
        )}
      </div>

      {/* Legend and breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-800">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            <span className="text-[10px] text-gray-400">Shipped</span>
          </div>
          <p className="text-xs text-white font-medium">{shippedPctCurrent.toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(toNum(current.total_shipped_lbs) / 1e6).toFixed(0)}M lbs</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />
            <span className="text-[10px] text-gray-400">Committed</span>
          </div>
          <p className="text-xs text-white font-medium">{(soldPctCurrent - shippedPctCurrent).toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(toNum(current.total_committed_lbs) / 1e6).toFixed(0)}M lbs</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-gray-700" />
            <span className="text-[10px] text-gray-400">Unsold</span>
          </div>
          <p className="text-xs text-white font-medium">{(100 - soldPctCurrent).toFixed(1)}%</p>
          <p className="text-[10px] text-gray-600">{(toNum(current.uncommitted_lbs) / 1e6).toFixed(0)}M lbs</p>
        </div>
      </div>
    </Card>
  );
}

function ShipmentTrend({ reports }) {
  const [windowSize, setWindowSize] = React.useState('all'); // 'last3' | 'last5' | 'all'

  if (!reports || reports.length < 2) return null;

  // Build annual cumulative shipments by crop year (sum of monthly totals = final shipped)
  // NOTE: BIGINT columns come from Supabase as strings — must parse to Number
  const byCropYear = {};
  reports.forEach(r => {
    const shipped = Number(r.total_shipped_lbs) || 0;
    if (!byCropYear[r.crop_year]) byCropYear[r.crop_year] = 0;
    // Use max shipped per crop year (cumulative field = highest month is the final number)
    if (shipped > byCropYear[r.crop_year]) {
      byCropYear[r.crop_year] = shipped;
    }
  });

  const allChartData = Object.entries(byCropYear)
    .map(([cy, lbs]) => ({ crop_year: cy, shipped: lbs }))
    .sort((a, b) => a.crop_year.localeCompare(b.crop_year));

  // Apply window filter (tail of sorted array — most recent N years)
  const chartData = windowSize === 'last3' ? allChartData.slice(-3)
                  : windowSize === 'last5' ? allChartData.slice(-5)
                  : allChartData;

  // Determine the current crop year (last one)
  const currentCY = chartData.length > 0 ? chartData[chartData.length - 1].crop_year : null;

  return (
    <div>
      <div className="flex items-start justify-between mb-1 gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Shipment Trend</h3>
          <p className="text-[10px] text-gray-500 mb-3">Cumulative shipments by crop year (Aug–Jul)</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {[{ k: 'last3', l: '3y' }, { k: 'last5', l: '5y' }, { k: 'all', l: 'All' }].map(b => (
            <button
              key={b.k}
              onClick={() => setWindowSize(b.k)}
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                windowSize === b.k
                  ? 'bg-green-500/20 border-green-500/40 text-green-300'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {b.l}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="crop_year"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={v => `${(v / 1e9).toFixed(1)}B`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={v => [`${(v / 1e9).toFixed(2)}B lbs`, 'Shipped']}
          />
          <Bar
            dataKey="shipped"
            radius={[4, 4, 0, 0]}
            fill="#22c55e"
            fillOpacity={0.6}
            activeBar={{ fillOpacity: 1 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


export default function Dashboard() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const internal = isInternal(profile);

  // Post-invite welcome banner. AcceptInvite navigates here with state
  // describing the role the user was invited as. We surface this prominently
  // so team members don't mistake the default buyer-style layout for their
  // full permission set. See docs/TRADE_HUB_CROSSWALK_v1.md §6.
  const [inviteWelcome, setInviteWelcome] = useState(() => {
    const s = location.state || {};
    if (!s.welcomeMessage && !s.justOnboardedAs) return null;
    return {
      message: s.welcomeMessage,
      role: s.justOnboardedAs,
      tier: s.justOnboardedTier,
      isTeam: !!s.isTeamInvite,
      signInOk: s.signInSucceeded !== false,
    };
  });

  // Clear the navigate state once we've captured it so a subsequent reload
  // doesn't re-show the banner.
  useEffect(() => {
    if (inviteWelcome && location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []); // intentionally run once

  const [latestReport, setLatestReport] = useState(null);
  const [priorYearReport, setPriorYearReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [scrapeLogs, setScrapeLogs] = useState([]);
  const [latestPrices, setLatestPrices] = useState([]);
  // 2026-04-24 Dashboard redesign: price history for the Market Pulse band's
  // WoW price delta. Pulls ~30 days of all Strata prices so we can find
  // each variety's 7-day-ago snapshot without extra round-trips.
  const [priceHistory, setPriceHistory] = useState([]);
  const [priorMonthReport, setPriorMonthReport] = useState(null);
  const [recentNews, setRecentNews] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [intelInsights, setIntelInsights] = useState([]);
  const [knowledgeStats, setKnowledgeStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { await loadAPIKeys(); setAiStatus(getAIStatus()); })();
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch all position reports for trend
        const { data: reports } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false });

        if (reports?.length) {
          setLatestReport(reports[0]);
          setAllReports(reports);
          const py = reports.find(r =>
            r.report_month === reports[0].report_month &&
            r.report_year === reports[0].report_year - 1
          );
          if (py) setPriorYearReport(py);
          // Prior month report — for MoM deltas in the Market Pulse band.
          // Reports are sorted DESC by year+month, so reports[1] is prior
          // month of prior crop-year transition (handled naturally).
          if (reports.length >= 2) setPriorMonthReport(reports[1]);
        }

        // Fetch AI analyses
        const { data: aiData } = await supabase
          .from('ai_analyses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        let aiItems = aiData;
        if (!aiItems || aiItems.length === 0) {
          // Auto-seed if empty
          await seedAiAnalyses(supabase);
          const { data: d2 } = await supabase
            .from('ai_analyses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
          aiItems = d2;
        }
        if (aiItems) {
          // Strict dedup: keep only ONE per analysis_type (most recent)
          const byType = {};
          aiItems.forEach(a => {
            if (!byType[a.analysis_type]) byType[a.analysis_type] = a;
          });
          const deduped = Object.values(byType);
          // Sort: monthly_brief first, then trade_signal, then others
          const priority = { monthly_brief: 0, trade_signal: 1, anomaly: 2, yoy_comparison: 3, seasonal_pattern: 4 };
          deduped.sort((a, b) => (priority[a.analysis_type] ?? 9) - (priority[b.analysis_type] ?? 9));
          setAnalyses(deduped);
        }

        // Fetch recent scrape logs - deduplicated
        const { data: logs } = await supabase
          .from('scraping_logs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(20);

        if (logs) {
          // Deduplicate by scraper_name (keep only most recent per scraper)
          const byName = {};
          logs.forEach(l => {
            if (!byName[l.scraper_name]) byName[l.scraper_name] = l;
          });
          setScrapeLogs(Object.values(byName));
        }

        // Fetch 60 days of Strata prices — covers the Market Pulse band's
        // WoW + MoM delta math AND the Live Prices widget (most-recent per
        // variety). One query, two consumers, no extra round-trip.
        const { data: prices } = await supabase
          .from('strata_prices')
          .select('*')
          .order('price_date', { ascending: false })
          .limit(300);

        if (prices && prices.length > 0) {
          setPriceHistory(prices);
          const byVariety = {};
          prices.forEach(p => { if (!byVariety[p.variety]) byVariety[p.variety] = p; });
          setLatestPrices(Object.values(byVariety).slice(0, 6));
        } else {
          setPriceHistory([]);
          setLatestPrices([]);
        }

        // Fetch recent news
        const { data: news } = await supabase
          .from('industry_news')
          .select('*')
          .order('published_date', { ascending: false })
          .limit(5);

        if (news && news.length > 0) {
          setRecentNews(news);
        } else {
          setRecentNews([]);
        }

        // Fetch intel insights (from forwarded reports)
        try {
          const insights = await getLatestInsights(5);
          setIntelInsights(insights || []);
          const stats = await getKnowledgeStats();
          setKnowledgeStats(stats);
        } catch (e) {
          // Intel tables may not exist yet — graceful fallback
          console.warn('Intel insights not available:', e.message);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const formatLbs = (lbs) => {
    const n = toNum(lbs);
    if (n === 0 && !lbs) return '--';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
  };

  const yoyPct = (cur, pri) => {
    const c = toNum(cur), p = toNum(pri);
    if (c === 0 || p === 0) return null;
    return Number(((c - p) / p * 100).toFixed(1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const lr = latestReport;
  const py = priorYearReport;
  const pm = priorMonthReport;

  // Get the featured brief and signal for the Market Brief card
  const featuredBrief = analyses.find(a => a.analysis_type === 'monthly_brief');
  const featuredSignal = analyses.find(a => a.analysis_type === 'trade_signal');
  // Insight cards: exclude the featured brief/signal, show max 4
  const insightCards = analyses
    .filter(a => a.id !== featuredBrief?.id && a.id !== featuredSignal?.id)
    .slice(0, 4);

  // ── Market Pulse momentum pulses (2026-04-24 Dashboard redesign) ──
  // Each pulse = {label, value, delta, tone, hint, href?}. Passed to
  // MarketPulseBand below. Externally-visible: no market/margin leakage
  // (the price pulse uses the offer price, not Strata market).
  const pulses = [];
  if (lr) {
    // 1. Monthly shipment delta (cumulative YTD - prior YTD = this month's new flow)
    const monthlyShipped = pm ? (toNum(lr.total_shipped_lbs) - toNum(pm.total_shipped_lbs)) : null;
    const priorMonthlyShipped = pm && allReports.length >= 3
      ? (toNum(pm.total_shipped_lbs) - toNum(allReports[2].total_shipped_lbs))
      : null;
    let monthlyDelta = null;
    if (monthlyShipped != null && priorMonthlyShipped != null && priorMonthlyShipped > 0) {
      const pct = ((monthlyShipped - priorMonthlyShipped) / priorMonthlyShipped) * 100;
      monthlyDelta = pct;
    }
    pulses.push({
      label: 'Monthly Ship',
      value: monthlyShipped != null ? formatLbs(monthlyShipped) : '--',
      delta: monthlyDelta != null ? `${monthlyDelta > 0 ? '+' : ''}${monthlyDelta.toFixed(1)}%` : null,
      deltaLabel: 'MoM',
      tone: monthlyDelta == null ? 'neutral' : monthlyDelta > 2 ? 'bullish' : monthlyDelta < -2 ? 'bearish' : 'neutral',
      hint: `Prior month: ${priorMonthlyShipped != null ? formatLbs(priorMonthlyShipped) : '--'}`,
      href: '/analysis',
    });

    // 2. Commit rate — a key pricing-power indicator. Rising commit rate
    // means the handler's unsold position is shrinking = sellers tighten.
    const commitRate = toNum(lr.total_supply_lbs) > 0
      ? (toNum(lr.total_committed_lbs) / toNum(lr.total_supply_lbs)) * 100
      : null;
    const pyCommitRate = py && toNum(py.total_supply_lbs) > 0
      ? (toNum(py.total_committed_lbs) / toNum(py.total_supply_lbs)) * 100
      : null;
    const commitDelta = (commitRate != null && pyCommitRate != null)
      ? (commitRate - pyCommitRate) : null;
    pulses.push({
      label: 'Commit Rate',
      value: commitRate != null ? `${commitRate.toFixed(1)}%` : '--',
      delta: commitDelta != null ? `${commitDelta > 0 ? '+' : ''}${commitDelta.toFixed(1)}pp` : null,
      deltaLabel: 'YoY',
      tone: commitDelta == null ? 'neutral' : commitDelta > 0 ? 'bullish' : 'bearish',
      hint: 'Higher = tighter supply (bullish)',
      href: '/supply',
    });

    // 3. Uncommitted YoY — the "what's left to sell" number.
    const unYoy = yoyPct(lr.uncommitted_lbs, py?.uncommitted_lbs);
    pulses.push({
      label: 'Uncommitted',
      value: formatLbs(lr.uncommitted_lbs),
      delta: unYoy != null ? `${unYoy > 0 ? '+' : ''}${unYoy}%` : null,
      deltaLabel: 'YoY',
      // Counter-intuitive: LESS uncommitted is BULLISH (pricing power)
      tone: unYoy == null ? 'neutral' : unYoy < 0 ? 'bullish' : 'bearish',
      hint: 'Available inventory — lower = tighter',
      href: '/supply',
    });
  }

  // 4. Price pulse — Nonpareil variety, latest vs ~7 days ago.
  // Respects info-walls: externals see offer price (maxons_price_per_lb),
  // internals see market price (price_usd_per_lb).
  if (priceHistory.length > 0) {
    const priceField = internal ? 'price_usd_per_lb' : 'maxons_price_per_lb';
    const fallbackFn = (row) => internal
      ? parseFloat(row.price_usd_per_lb || 0)
      : parseFloat(row.maxons_price_per_lb || (row.price_usd_per_lb || 0) * 1.03);

    const nonpareilRows = priceHistory.filter(p =>
      (p.variety || '').toLowerCase().includes('nonpareil')
    );
    if (nonpareilRows.length > 0) {
      const latestRow = nonpareilRows[0];
      const latestPrice = parseFloat(latestRow[priceField]) || fallbackFn(latestRow);
      // Find a row from ~7 days before
      const latestDate = latestRow.price_date ? new Date(latestRow.price_date) : new Date();
      const weekAgoTarget = new Date(latestDate.getTime() - 7 * 86400000);
      const weekAgoRow = nonpareilRows.find(p => {
        if (!p.price_date) return false;
        const d = new Date(p.price_date);
        return d <= weekAgoTarget;
      });
      const priorPrice = weekAgoRow ? (parseFloat(weekAgoRow[priceField]) || fallbackFn(weekAgoRow)) : null;
      const priceDelta = (latestPrice && priorPrice)
        ? ((latestPrice - priorPrice) / priorPrice) * 100 : null;
      pulses.push({
        label: 'Nonpareil $/lb',
        value: `$${latestPrice.toFixed(2)}`,
        delta: priceDelta != null ? `${priceDelta > 0 ? '+' : ''}${priceDelta.toFixed(1)}%` : null,
        deltaLabel: 'WoW',
        tone: priceDelta == null ? 'neutral' : priceDelta > 0.5 ? 'bullish' : priceDelta < -0.5 ? 'bearish' : 'neutral',
        hint: priorPrice ? `7d ago: $${priorPrice.toFixed(2)}` : 'No 7d prior sample',
        href: '/pricing',
      });
    }
  }

  // 5. News mood — % bullish among recent items with sentiment.
  if (recentNews.length > 0) {
    const scored = recentNews.filter(n => n.ai_sentiment || n.sentiment);
    const bull = scored.filter(n => (n.ai_sentiment || n.sentiment) === 'bullish').length;
    const bear = scored.filter(n => (n.ai_sentiment || n.sentiment) === 'bearish').length;
    const total = scored.length;
    const bullPct = total > 0 ? Math.round((bull / total) * 100) : null;
    const mood = bullPct == null ? 'Mixed' : bullPct >= 60 ? 'Bullish' : bullPct <= 40 ? 'Bearish' : 'Neutral';
    pulses.push({
      label: 'News Mood',
      value: mood,
      delta: bullPct != null ? `${bullPct}%` : null,
      deltaLabel: 'bull share',
      tone: mood === 'Bullish' ? 'bullish' : mood === 'Bearish' ? 'bearish' : 'neutral',
      hint: total > 0 ? `${bull} bull / ${bear} bear / ${total - bull - bear} neutral of ${total}` : '',
      href: '/news',
    });
  }

  // 6. Active AI signals — what Zyra is flagging right now
  const tradeSignals = analyses.filter(a => a.analysis_type === 'trade_signal');
  const topSignal = tradeSignals[0];
  if (topSignal) {
    const sig = topSignal.data_context?.signal || 'neutral';
    pulses.push({
      label: 'AI Signal',
      value: sig.toUpperCase(),
      delta: topSignal.confidence ? `${Math.round(topSignal.confidence * 100)}%` : null,
      deltaLabel: 'confidence',
      tone: sig === 'bullish' ? 'bullish' : sig === 'bearish' ? 'bearish' : 'neutral',
      hint: topSignal.title || 'Latest trade signal from Zyra',
      href: '/intelligence',
    });
  } else {
    // Fallback: show data coverage
    pulses.push({
      label: 'Data Coverage',
      value: `${allReports.length} mo`,
      delta: null,
      tone: 'neutral',
      hint: 'ABC position reports loaded',
      href: '/reports',
    });
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Post-invite welcome banner — only visible right after an invitee
          lands from /accept-invite. Closes on click. See crosswalk §6. */}
      {inviteWelcome && (
        <InviteWelcomeBanner
          welcome={inviteWelcome}
          onDismiss={() => setInviteWelcome(null)}
        />
      )}

      {/* Phase D MVP: role-aware welcome + shortcuts */}
      <PersonaBanner />
      {/* Phase D2/D3: persona-specific live numeric insights */}
      <PersonaInsights />

      {/* Header (compact — persona banner above already introduces the user) */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-white">Market Dashboard</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {lr
                ? `${lr.crop_year} crop year · Report ${lr.report_year}/${String(lr.report_month).padStart(2, '0')} · ${allReports.length} months loaded`
                : 'No data yet - run the scraper to populate'
              }
            </p>
          </div>
          {lr && (
            <div className="hidden md:flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400">Live · {lr.report_year}/{String(lr.report_month).padStart(2, '0')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics Row (tighter gap) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          title="Total Shipments"
          value={formatLbs(lr?.total_shipped_lbs)}
          subtitle={`Dom ${formatLbs(lr?.domestic_shipped_lbs)} / Exp ${formatLbs(lr?.export_shipped_lbs)}`}
          trend={yoyPct(lr?.total_shipped_lbs, py?.total_shipped_lbs)}
          color="green"
        />
        <StatCard
          title="Committed"
          value={formatLbs(lr?.total_committed_lbs)}
          subtitle={lr?.domestic_committed_lbs ? `Dom ${formatLbs(lr?.domestic_committed_lbs)} / Exp ${formatLbs(lr?.export_committed_lbs)}` : 'Sold but not yet shipped'}
          trend={yoyPct(lr?.total_committed_lbs, py?.total_committed_lbs)}
          color="blue"
        />
        <StatCard
          title="Uncommitted"
          value={formatLbs(lr?.uncommitted_lbs)}
          subtitle="Available inventory"
          trend={yoyPct(lr?.uncommitted_lbs, py?.uncommitted_lbs)}
          color="amber"
        />
        <StatCard
          title="Total Supply"
          value={formatLbs(lr?.total_supply_lbs)}
          subtitle={`Carry ${formatLbs(lr?.carry_in_lbs)} + Recv ${formatLbs(lr?.receipts_lbs)}`}
          trend={yoyPct(lr?.total_supply_lbs, py?.total_supply_lbs)}
          color="green"
        />
      </div>

      {/* Market Pulse — momentum indicators (2026-04-24 redesign) */}
      <MarketPulseBand pulses={pulses} />

      {/* Market Brief - concise executive summary */}
      {(featuredBrief || featuredSignal) && (
        <div className="mb-4 bg-gradient-to-r from-green-500/10 via-blue-500/5 to-transparent border border-green-500/20 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
              <span className="text-green-400 font-bold text-sm">AI</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-base font-semibold text-white">
                  {featuredBrief?.title || featuredSignal?.title || 'Market Intelligence'}
                </h3>
                {(() => {
                  const sig = featuredSignal?.data_context?.signal || 'neutral';
                  return (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      sig === 'bullish' ? 'bg-green-500/20 text-green-400' :
                      sig === 'bearish' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {sig}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {truncateText(featuredBrief?.summary || featuredSignal?.summary || '', 350)}
              </p>
              {featuredSignal && featuredSignal.id !== featuredBrief?.id && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  {truncateText(featuredSignal.summary, 150)}
                </p>
              )}
              <Link to="/analysis" className="inline-block text-xs text-green-400 mt-3 hover:text-green-300 transition-colors">
                Read full analysis &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Second row: Supply Position + Shipment trend (tighter) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Crop Sold Progress — correct concept: completion bar with prior year reference */}
        <SupplyPositionWidget current={lr} prior={py} />

        {/* Shipment Trend */}
        <Card>
          <ShipmentTrend reports={allReports} />
        </Card>
      </div>

      {/* AI Insights + System Status (tighter gap) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Insights (2 columns) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">
              AI Insights
              <span className="text-xs text-gray-500 font-normal ml-2">{analyses.length} total</span>
            </h3>
            <Link to="/intelligence" className="text-xs text-green-400 hover:text-green-300">All &rarr;</Link>
          </div>
          {insightCards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insightCards.map(a => <InsightCard key={a.id} analysis={a} />)}
            </div>
          ) : (
            <div className="border border-gray-800 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500">No additional insights yet &mdash; scraper will generate more on next run.</p>
            </div>
          )}
        </div>

        {/* System Status */}
        <div>
          <h3 className="text-base font-semibold text-white mb-3">System Status</h3>
          <div className="space-y-2">
            {/* Data freshness */}
            <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Data Coverage</span>
                <span className="text-xs text-green-400">{allReports.length} months</span>
              </div>
              {lr && (
                <p className="text-xs text-gray-500 mt-1">
                  Latest: {lr.report_year}/{String(lr.report_month).padStart(2, '0')} ({lr.crop_year})
                </p>
              )}
            </div>

            <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">AI Engine (4 Systems)</span>
                <Link to="/intelligence" className="text-[10px] text-green-400 hover:text-green-300">Open &rarr;</Link>
              </div>
              {aiStatus ? (
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(aiStatus).filter(([k]) => k !== 'council').map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${val.connected ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-[10px] text-gray-500 capitalize">{val.label || key}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-600">Loading...</span>
              )}
              {aiStatus?.council && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-800 flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${aiStatus.council.connected ? 'bg-purple-400' : 'bg-gray-600'}`} />
                  <span className="text-[10px] text-gray-500">Council: {aiStatus.council.modelsActive}/3</span>
                </div>
              )}
            </div>

            {scrapeLogs.length > 0 ? scrapeLogs.slice(0, 4).map(log => (
              <div key={log.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
                <div>
                  <p className="text-xs text-white">{log.scraper_name}</p>
                  <p className="text-[10px] text-gray-600">
                    {new Date(log.started_at).toLocaleString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  log.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {log.status}
                </span>
              </div>
            )) : (
              <div className="border border-gray-800 rounded-lg p-6 text-center">
                <p className="text-xs text-gray-500">No scraper runs yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intel Alerts — from forwarded market reports */}
      {intelInsights.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-white">Market Intel</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                {intelInsights.length} report{intelInsights.length !== 1 ? 's' : ''}
              </span>
              {knowledgeStats?.total > 0 && (
                <span className="text-[10px] text-gray-600">
                  Brain: {knowledgeStats.total} facts learned
                </span>
              )}
            </div>
            <Link to="/intelligence" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
              View All &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {intelInsights.slice(0, 3).map(ins => (
              <IntelAlertCard key={ins.id} insight={ins} />
            ))}
          </div>
        </div>
      )}

      {/* Live Pricing, News Feed, System Pipeline (tighter gap) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Live Pricing Widget */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Live Almond Prices
            </h3>
            <Link to="/pricing" className="text-xs text-green-400 hover:text-green-300 transition-colors">
              View All &rarr;
            </Link>
          </div>
          {latestPrices.length > 0 ? (
            <div className="space-y-3">
              {latestPrices.map((p) => {
                const marketPrice = parseFloat(p.price_usd_per_lb || p.price) || 0;
                const maxonsPrice = p.maxons_price_per_lb ? parseFloat(p.maxons_price_per_lb).toFixed(2) : (marketPrice * 1.03).toFixed(2);
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.variety}</p>
                      <p className="text-[10px] text-gray-600">
                        {p.price_date ? new Date(p.price_date).toLocaleDateString() : '--'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {internal && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-300">
                          ${marketPrice.toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                        ${maxonsPrice}
                      </span>
                    </div>
                  </div>
                );
              })}
              {internal && (
                <div className="pt-2">
                  <p className="text-[10px] text-gray-600 text-right">Market | MAXONS (+3%)</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-gray-500">No pricing data yet</p>
              <p className="text-[10px] text-gray-600 mt-1">Strata scraper will populate prices</p>
            </div>
          )}
        </Card>

        {/* Industry News Feed Widget */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Latest News &amp; Intel
            </h3>
            <Link to="/news" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View All &rarr;
            </Link>
          </div>
          {recentNews.length > 0 ? (
            <div className="space-y-3">
              {recentNews.map((item) => {
                const sent = item.ai_sentiment || item.sentiment;
                const sentimentColor = sent === 'bullish'
                  ? 'bg-green-500' : sent === 'bearish'
                  ? 'bg-red-500' : 'bg-gray-500';
                return (
                  <div key={item.id} className="group py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sentimentColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white leading-snug line-clamp-2">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.source && (
                            <span className="text-[10px] text-gray-500">{item.source}</span>
                          )}
                          {item.published_date && (
                            <span className="text-[10px] text-gray-600">
                              {new Date(item.published_date).toLocaleDateString()}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                              {item.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-gray-500">No news items yet</p>
              <p className="text-[10px] text-gray-600 mt-1">News scraper will populate intel</p>
            </div>
          )}
        </Card>

        {/* Autonomous Pipeline Status Widget */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Pipeline Status</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-400">Active</span>
            </div>
          </div>
          <div className="space-y-3">
            {/* Email System */}
            <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">@</span>
                  <span className="text-xs text-white">intel@cropsintel.com</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
              </div>
            </div>

            {/* Scrapers */}
            {['ABC Position Reports', 'Strata Pricing', 'Bountiful Estimates', 'News Aggregator'].map((name) => {
              const shortName = name.split(' ')[0].toLowerCase();
              const log = scrapeLogs.find(l => l.scraper_name?.toLowerCase().includes(shortName));
              return (
                <div key={name} className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white">{name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      log?.status === 'success' ? 'bg-green-500/20 text-green-400' :
                      log?.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-600/20 text-gray-400'
                    }`}>
                      {log?.status || 'Pending'}
                    </span>
                  </div>
                  {log?.started_at && (
                    <p className="text-[10px] text-gray-600 mt-1">
                      Last: {new Date(log.started_at).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Next Scheduled */}
            <div className="pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Next scheduled run</span>
                <span className="text-[10px] text-gray-400">
                  {scrapeLogs[0]?.started_at
                    ? (() => {
                        const last = new Date(scrapeLogs[0].started_at);
                        const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
                        return next > new Date() ? next.toLocaleString() : 'Overdue';
                      })()
                    : 'Not scheduled'
                  }
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
