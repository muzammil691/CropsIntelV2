import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useLocale } from './contexts/LocaleContext';
import { isAdminUser, isTeamMember } from './lib/roleConstants';
import GuestOverlay from './components/GuestOverlay';
import ProfileCompletionBanner from './components/ProfileCompletionBanner';
import ProtectedRoute, { AdminRoute, TeamRoute, AuthRoute } from './components/ProtectedRoute';
import ZyraWidget from './components/ZyraWidget';
import CommandPalette from './components/CommandPalette';
// LocaleSwitcher import retained behind feature flag — see AppLocaleLock note
// in src/contexts/LocaleContext.jsx. Not rendered while app-locale is locked
// to English; restore <LocaleSwitcher compact /> in the two top-bar blocks
// below when the multilingual rollout is approved.
// import LocaleSwitcher from './components/LocaleSwitcher';
import V1ReturningUserModal from './components/V1ReturningUserModal';

// Lazy-load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Reports = lazy(() => import('./pages/Reports'));
const Autonomous = lazy(() => import('./pages/Autonomous'));
const Supply = lazy(() => import('./pages/Supply'));
const Destinations = lazy(() => import('./pages/Destinations'));
const Forecasts = lazy(() => import('./pages/Forecasts'));
const Pricing = lazy(() => import('./pages/Pricing'));
const News = lazy(() => import('./pages/News'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const CRM = lazy(() => import('./pages/CRM'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const Trading = lazy(() => import('./pages/Trading'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectMap = lazy(() => import('./pages/ProjectMap'));
const Brokers = lazy(() => import('./pages/Brokers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
// W7 (2026-04-27): Data Hub graduated from /v3-preview/data-hub to /data-hub.
// V3-preview tree torn down in W8 — see commit notes. Page lives in
// src/pages/DataHub.jsx and renders inside the regular V2 chrome.
const DataHub = lazy(() => import('./pages/DataHub'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Flat list kept for back-compat (ROLE_PRIORITY + filter logic references it).
const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/analysis', label: 'Analysis', icon: '📈' },
  { path: '/supply', label: 'Supply & Demand', icon: '⚖️' },
  { path: '/destinations', label: 'Destinations', icon: '🌍' },
  { path: '/pricing', label: 'Pricing', icon: '💰' },
  { path: '/forecasts', label: 'Forecasts', icon: '🔮' },
  { path: '/news', label: 'News & Intel', icon: '📰' },
  { path: '/intelligence', label: 'AI Intelligence', icon: '🧠' },
  { path: '/reports', label: 'Reports', icon: '📋' },
  { path: '/data-hub', label: 'Data Hub', icon: '🗂️', requireTeam: true },
  { path: '/crm', label: 'CRM & Deals', icon: '🤝', requireTeam: true },
  { path: '/brokers', label: 'Brokers (BRM)', icon: '🗺️', requireTeam: true },
  { path: '/suppliers', label: 'Suppliers (SRM)', icon: '🏭', requireTeam: true },
  { path: '/trading', label: 'Trading Portal', icon: '💼', requireTeam: true },
  // Team & Users — direct link to the user-mgmt panel embedded in Settings.
  // Was previously buried inside /settings; user flagged they couldn't find it.
  // The #team-panel hash causes Settings.jsx to scroll the panel into view.
  { path: '/settings#team-panel', label: 'Team & Users', icon: '👥', requireTeam: true },
  // Email Broadcast — admin-only cohort email sender (V1 subscribers + registered)
  { path: '/settings#broadcast-panel', label: 'Broadcast', icon: '📣', requireAdmin: true },
  { path: '/autonomous', label: 'Autonomous', icon: '🤖', requireAdmin: true },
  { path: '/settings', label: 'Settings', icon: '⚙️', requireAuth: true }
];

// Grouped sections for the sidebar render. User directive 2026-04-24:
// "make the dash board and analysis at one side and team and admin clubbed together".
// MAIN groups Dashboard + Analysis (command surfaces).
// MARKET DATA groups the raw-data pages.
// AI & INTELLIGENCE groups the AI-driven surfaces.
// RELATIONSHIPS groups the CRM/BRM/SRM/Trading portals.
// ADMIN clubs team, broadcast, autonomous, settings.
const NAV_SECTIONS = [
  {
    label: 'Main',
    key: 'nav.section.main',
    items: ['/dashboard', '/analysis'],
  },
  {
    label: 'Market Data',
    key: 'nav.section.marketData',
    items: ['/supply', '/destinations', '/pricing', '/forecasts', '/news'],
  },
  {
    label: 'AI & Intelligence',
    key: 'nav.section.aiIntelligence',
    items: ['/intelligence', '/reports', '/data-hub'],
  },
  {
    label: 'Relationships',
    key: 'nav.section.relationships',
    items: ['/crm', '/brokers', '/suppliers', '/trading'],
  },
  {
    label: 'Admin',
    key: 'nav.section.admin',
    items: ['/settings#team-panel', '/settings#broadcast-panel', '/autonomous', '/settings'],
  },
];

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function GuestTimerBadge() {
  const { isAuthenticated, guestTimeLeft, guestExpired } = useAuth();
  const { t } = useLocale();
  if (isAuthenticated) return null;

  const pct = (guestTimeLeft / (5 * 60 * 1000)) * 100;
  const isLow = guestTimeLeft < 60000;

  return (
    <Link
      to="/register"
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors ${
        isLow
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}
      title="Guest preview time remaining — Register for full access"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="font-mono font-medium">{formatTime(guestTimeLeft)}</span>
      <span className="hidden sm:inline text-gray-500">{t('auth.guest')}</span>
    </Link>
  );
}

function UserMenu() {
  const { isAuthenticated, profile, user, signOut } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <GuestTimerBadge />
        {/* <LocaleSwitcher compact />  ← restore when app-wide multilingual is approved */}
        <Link
          to="/login"
          className="px-3 py-1.5 text-[11px] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
        >
          {t('auth.signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* <LocaleSwitcher compact />  ← restore when app-wide multilingual is approved */}
      <div className="text-right hidden sm:block">
        <p className="text-[11px] text-white font-medium leading-tight truncate max-w-[120px]">
          {profile?.full_name || user?.email?.split('@')[0] || 'User'}
        </p>
        <p className="text-[9px] text-gray-500 truncate max-w-[120px]">
          {profile?.company || user?.email}
        </p>
      </div>
      <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-[10px] font-bold">
        {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
      </div>
      <button
        onClick={async () => { await signOut(); navigate('/welcome'); }}
        className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        title={t('auth.signOut')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}

// ADMIN_ROLES + TEAM_ROLES are imported from src/lib/roleConstants.js
// (single source of truth for role taxonomy across the app — see W1 of
// docs/V2_LAUNCH_WORTHINESS notes). The same lists were previously
// duplicated here, in ProtectedRoute.jsx and in permissions.js, with
// drift between them; the imported versions are the spec-correct copy.

// Role → paths this role cares about most (shown first). Everything else
// stays visible but drops below. Extended to cover every spec §12 role so
// newly-invited team members land with a sensible sidebar ordering.
const ROLE_PRIORITY = {
  // ─── External / value chain (existing) ───
  grower:    ['/dashboard', '/forecasts', '/supply', '/pricing', '/news', '/analysis'],
  supplier:  ['/dashboard', '/supply', '/forecasts', '/pricing', '/destinations', '/analysis'],
  processor: ['/dashboard', '/forecasts', '/pricing', '/supply', '/analysis'],
  broker:    ['/dashboard', '/brokers', '/destinations', '/analysis', '/pricing', '/news'],
  buyer:     ['/dashboard', '/pricing', '/destinations', '/news', '/intelligence', '/analysis'],
  trader:    ['/dashboard', '/analysis', '/supply', '/trading', '/pricing', '/intelligence'],
  analyst:   ['/dashboard', '/analysis', '/forecasts', '/reports', '/news'],
  logistics: ['/dashboard', '/destinations', '/supply', '/news'],
  finance:   ['/dashboard', '/reports', '/pricing', '/analysis'],
  admin:     ['/dashboard', '/autonomous', '/crm', '/intelligence', '/trading'],
  // ─── Spec §12.2 external company roles ───
  company_admin:             ['/dashboard', '/crm', '/trading', '/pricing', '/settings'],
  finance_user:              ['/dashboard', '/reports', '/pricing', '/analysis'],
  ops_user:                  ['/dashboard', '/destinations', '/supply', '/news'],
  procurement_trading_user:  ['/dashboard', '/pricing', '/destinations', '/intelligence', '/analysis'],
  sales_user:                ['/dashboard', '/trading', '/brokers', '/pricing', '/news'],
  view_only_user:            ['/dashboard', '/analysis', '/forecasts', '/reports'],
  reseller_both:             ['/dashboard', '/pricing', '/trading', '/destinations', '/news'],
  // ─── Spec §12.1 Maxons internal roles ───
  super_admin:               ['/dashboard', '/autonomous', '/crm', '/trading', '/intelligence', '/reports'],
  procurement_head:          ['/dashboard', '/suppliers', '/brokers', '/trading', '/crm', '/analysis'],
  procurement_officer:       ['/dashboard', '/suppliers', '/brokers', '/trading', '/pricing'],
  sales_lead:                ['/dashboard', '/crm', '/trading', '/analysis', '/reports'],
  sales_handler:             ['/dashboard', '/crm', '/trading', '/pricing', '/destinations'],
  documentation_lead:        ['/dashboard', '/crm', '/trading', '/reports'],
  documentation_officer:     ['/dashboard', '/crm', '/trading'],
  logistics_head:            ['/dashboard', '/destinations', '/supply', '/trading', '/reports'],
  logistics_officer:         ['/dashboard', '/destinations', '/supply', '/trading'],
  warehouse_manager:         ['/dashboard', '/supply', '/trading'],
  finance_head:              ['/dashboard', '/reports', '/analysis', '/pricing', '/crm'],
  finance_officer:           ['/dashboard', '/reports', '/pricing', '/analysis'],
  compliance_officer:        ['/dashboard', '/crm', '/reports', '/settings'],
};

function Sidebar() {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();
  const { t } = useLocale();
  // t() falls through to English if key missing, so the raw item.label
  // remains a safe fallback. 'nav.path.<path>' keys translate the labels
  // live. Section headers use `section.key` → t().
  const navLabel = (item) => {
    const translated = t('nav.path.' + item.path);
    return translated === 'nav.path.' + item.path ? item.label : translated;
  };
  // PROFILE-LOADING RACE FIX (see docs/TRADE_HUB_CROSSWALK_v1.md §6):
  // When an invitee lands on /dashboard from /accept-invite, the session
  // has just been created but loadProfile() hasn't resolved yet. Without a
  // guard, `profile?.role || 'buyer'` falsely flags the user as a buyer and
  // hides all team-only nav entries. If they refresh quickly they see a
  // "you were given buyer access" experience even though they were invited
  // as team. Guard: while authenticated and profile is null, render
  // placeholder nav (no team-gating decision yet).
  const profileLoading = isAuthenticated && profile === null;
  const userRole = profile?.role || (isAuthenticated ? null : 'buyer');
  // Profile-aware helpers — accept role OR access_tier overrides. See
  // src/lib/roleConstants.js. False during profileLoading (profile is null).
  const isAdmin = isAdminUser(profile);
  const isTeam = isTeamMember(profile);

  // Index nav items by path so section render can look them up.
  const byPath = Object.fromEntries(NAV_ITEMS.map(i => [i.path, i]));

  // Per-section filter — hides requireAdmin/requireTeam/requireAuth items the
  // current user can't access. Returns empty array to suppress section entirely.
  const visibleIn = (section) => section.items
    .map(p => byPath[p])
    .filter(Boolean)
    .filter(item => {
      if (item.requireAdmin && !isAdmin) return false;
      if (item.requireTeam && !isTeam) return false;
      if (item.requireAuth && !isAuthenticated) return false;
      return true;
    });

  // Role priority is applied WITHIN a section (not across). Keeps the user's
  // most-used pages at the top of each section without shuffling the grouping.
  const priority = ROLE_PRIORITY[userRole] || [];
  const sortByPriority = (items) => [...items].sort((a, b) => {
    const ai = priority.indexOf(a.path);
    const bi = priority.indexOf(b.path);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-green-500/20">
            CI
          </div>
          <div>
            <h1 className="text-base font-bold text-white">CropsIntel</h1>
            <p className="text-[10px] text-gray-500 tracking-wide">AUTONOMOUS V2</p>
          </div>
        </div>
      </div>

      {/* W8 (2026-04-27): V3-preview pill removed. Data Hub graduated to
          /data-hub and now sits in the AI & Intelligence section above. */}

      {/* Navigation — grouped into labeled sections */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {/* Profile-load skeleton — prevents the buyer-role flash for team
            invitees while AuthContext.loadProfile is in flight. */}
        {profileLoading && (
          <div className="space-y-2 px-3 py-2">
            <div className="h-3 w-24 bg-gray-800/70 rounded animate-pulse" />
            <div className="h-8 bg-gray-800/50 rounded animate-pulse" />
            <div className="h-8 bg-gray-800/50 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-800/70 rounded animate-pulse mt-3" />
            <div className="h-8 bg-gray-800/50 rounded animate-pulse" />
            <div className="h-8 bg-gray-800/50 rounded animate-pulse" />
          </div>
        )}
        {!profileLoading && NAV_SECTIONS.map(section => {
          const sectionItems = sortByPriority(visibleIn(section));
          if (sectionItems.length === 0) return null;
          return (
            <div key={section.label}>
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
                {section.key ? t(section.key) : section.label}
              </div>
              <div className="space-y-0.5">
                {sectionItems.map(item => {
                  const isActive = location.pathname === item.path.split('#')[0] &&
                                   (location.hash === `#${item.path.split('#')[1]}` || !item.path.includes('#'));
                  const isLocked = item.requireTeam && !isTeam;
                  return (
                    <Link
                      key={item.path}
                      to={isLocked ? '#' : item.path}
                      onClick={isLocked ? e => e.preventDefault() : undefined}
                      title={isLocked ? 'Team access required' : navLabel(item)}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                        isLocked
                          ? 'text-gray-700 cursor-not-allowed'
                          : isActive
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-sm shadow-green-500/10'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent'
                      }`}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="truncate">{navLabel(item)}</span>
                      {isLocked && <span className="ml-auto text-[10px] text-gray-700">🔒</span>}
                      {isActive && !isLocked && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Quick search hint */}
      <div className="px-3 pb-2">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-gray-400 hover:bg-gray-800/50 transition-colors border border-gray-800/50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Quick search</span>
          <kbd className="ml-auto text-[9px] px-1 py-0.5 bg-gray-800 rounded border border-gray-700">&#8984;K</kbd>
        </button>
      </div>

      {/* User section */}
      <div className="p-4 border-t border-gray-800">
        <UserMenu />
      </div>

      {/* Data Status Footer */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-600">MAXONS Intelligence</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-gray-500">Live</span>
          </div>
        </div>
        <div className="text-[10px] text-gray-600">
          11 crop years | 106 position reports | V2 autonomous
        </div>
      </div>
    </aside>
  );
}

// Mobile top header (brand bar)
function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 flex items-center justify-between px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-[10px]">
          CI
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-none">CropsIntel</h1>
          <p className="text-[9px] text-gray-500 tracking-wide">AUTONOMOUS V2</p>
        </div>
      </div>
      <UserMenu />
    </header>
  );
}

// Mobile bottom nav — show top 5 items + "More" drawer for the rest
const MOBILE_PRIMARY = NAV_ITEMS.slice(0, 4);
const MOBILE_MORE = NAV_ITEMS.slice(4);

function MobileNav() {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();
  // Same profile-loading guard as desktop Sidebar (see crosswalk §6).
  const profileLoading = isAuthenticated && profile === null;
  const userRole = profile?.role || (isAuthenticated ? null : 'buyer');
  const [showMore, setShowMore] = React.useState(false);

  // Profile-aware helpers (same pattern as desktop Sidebar).
  const isAdmin = isAdminUser(profile);
  const isTeam = isTeamMember(profile);

  const moreItems = MOBILE_MORE.filter(item => {
    if (item.requireAdmin && !isAdmin) return false;
    if (item.requireTeam && !isTeam) return false;
    if (item.requireAuth && !isAuthenticated) return false;
    return true;
  });

  return (
    <>
      {/* More drawer overlay */}
      {showMore && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute bottom-16 left-0 right-0 bg-gray-900 border-t border-gray-800 rounded-t-2xl p-4 space-y-1"
               onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-3" />
            {moreItems.map(item => {
              const isActive = location.pathname === item.path;
              // isTeam (computed above) accepts role in TEAM_ROLES, role in
              // ADMIN_ROLES, OR access_tier='admin'/'maxons_team'. Using it
              // here keeps mobile + desktop gating in lockstep.
              const isLocked = item.requireTeam && !isTeam;
              return (
                <Link
                  key={item.path}
                  to={isLocked ? '#' : item.path}
                  onClick={e => { if (isLocked) e.preventDefault(); else setShowMore(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    isLocked ? 'text-gray-700' :
                    isActive ? 'bg-green-500/10 text-green-400' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                  {isLocked && <span className="ml-auto text-[10px] text-gray-700">🔒</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex lg:hidden z-40">
        {MOBILE_PRIMARY.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center py-2.5 text-[10px] transition-colors ${
                isActive ? 'text-green-400' : 'text-gray-500'
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex-1 flex flex-col items-center py-2.5 text-[10px] transition-colors ${
            showMore || MOBILE_MORE.some(i => i.path === location.pathname)
              ? 'text-green-400' : 'text-gray-500'
          }`}
        >
          <span className="text-lg mb-0.5">•••</span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

const PAGE_TITLES = {
  '/': 'Autonomous Almond Market Intelligence',
  '/dashboard': 'Dashboard',
  '/supply': 'Supply & Demand',
  '/destinations': 'Destinations & Trade Flow',
  '/pricing': 'Live Pricing',
  '/forecasts': 'Crop Forecasts',
  '/news': 'News & Intelligence',
  '/analysis': 'Market Analysis',
  '/crm': 'CRM & Trade Pipeline',
  '/intelligence': 'AI Intelligence',
  '/trading': 'Trading Portal',
  '/reports': 'Position Reports',
  '/autonomous': 'Autonomous Systems',
  '/settings': 'Settings',
  '/welcome': 'Welcome',
  '/login': 'Sign In',
  '/register': 'Create Account',
  '/reset-password': 'Reset Password',
  '/set-password': 'Set Password',
  '/map': 'Project Map',
  '/brokers': 'Brokers (BRM)',
  '/suppliers': 'Suppliers (SRM)',
};

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const name = PAGE_TITLES[location.pathname] || 'Dashboard';
    document.title = `${name} — CropsIntel`;
  }, [location.pathname]);
}

// Full-page routes (no sidebar/nav chrome)
const STANDALONE_ROUTES = ['/', '/welcome', '/login', '/register', '/reset-password', '/set-password', '/map', '/accept-invite'];
// W8: STANDALONE_PREFIXES removed — V3-preview tree torn down. The only
// fullscreen surfaces left are the auth flows above.

export default function App() {
  usePageTitle();
  const location = useLocation();
  const isStandalone = STANDALONE_ROUTES.includes(location.pathname);

  // Standalone pages (Welcome, Login, Register) — no sidebar/nav
  if (isStandalone) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/map" element={<ProjectMap />} />
        </Routes>
      </Suspense>
    );
  }

  // Main app layout with sidebar
  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-auto">
        <MobileHeader />
        <ProfileCompletionBanner />
        <main className="flex-1 pb-16 lg:pb-0">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/supply" element={<Supply />} />
              <Route path="/destinations" element={<Destinations />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/forecasts" element={<Forecasts />} />
              <Route path="/news" element={<News />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/crm" element={<TeamRoute><CRM /></TeamRoute>} />
              <Route path="/brokers" element={<TeamRoute><Brokers /></TeamRoute>} />
              <Route path="/suppliers" element={<TeamRoute><Suppliers /></TeamRoute>} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/trading" element={<TeamRoute><Trading /></TeamRoute>} />
              <Route path="/reports" element={<Reports />} />
              {/* W7: Data Hub — team-gated, replaces /v3-preview/data-hub */}
              <Route path="/data-hub" element={<TeamRoute><DataHub /></TeamRoute>} />
              <Route path="/autonomous" element={<AdminRoute><Autonomous /></AdminRoute>} />
              <Route path="/settings" element={<AuthRoute><Settings /></AuthRoute>} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* Guest timer overlay */}
      <GuestOverlay />

      {/* Zyra AI Assistant — floating widget on all pages */}
      <ZyraWidget />

      {/* Command palette — Cmd+K quick navigation */}
      <CommandPalette />

      {/* Phase F1a — V1 returning-user upgrade popup (auto-shown for migrated users) */}
      <V1ReturningUserModal />
    </div>
  );
}
