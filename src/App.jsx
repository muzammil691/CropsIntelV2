import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import GuestOverlay from './components/GuestOverlay';
import ProfileCompletionBanner from './components/ProfileCompletionBanner';
import ProtectedRoute, { AdminRoute, TeamRoute, AuthRoute } from './components/ProtectedRoute';
import ZyraWidget from './components/ZyraWidget';
import CommandPalette from './components/CommandPalette';

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
const CRM = lazy(() => import('./pages/CRM'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const Trading = lazy(() => import('./pages/Trading'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/supply', label: 'Supply & Demand', icon: '⚖️' },
  { path: '/destinations', label: 'Destinations', icon: '🌍' },
  { path: '/pricing', label: 'Pricing', icon: '💰' },
  { path: '/forecasts', label: 'Forecasts', icon: '🔮' },
  { path: '/news', label: 'News & Intel', icon: '📰' },
  { path: '/analysis', label: 'Analysis', icon: '📈' },
  { path: '/crm', label: 'CRM & Deals', icon: '🤝', requireTeam: true },
  { path: '/intelligence', label: 'AI Intelligence', icon: '🧠' },
  { path: '/trading', label: 'Trading Portal', icon: '💼', requireTeam: true },
  { path: '/reports', label: 'Reports', icon: '📋' },
  { path: '/autonomous', label: 'Autonomous', icon: '🤖', requireAdmin: true },
  { path: '/settings', label: 'Settings', icon: '⚙️', requireAuth: true }
];

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function GuestTimerBadge() {
  const { isAuthenticated, guestTimeLeft, guestExpired } = useAuth();
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
      <span className="hidden sm:inline text-gray-500">guest</span>
    </Link>
  );
}

function UserMenu() {
  const { isAuthenticated, profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <GuestTimerBadge />
        <Link
          to="/login"
          className="px-3 py-1.5 text-[11px] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
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
        title="Sign out"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}

const ADMIN_ROLES = ['admin'];
const TEAM_ROLES = ['admin', 'analyst', 'broker', 'seller'];

function Sidebar() {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();
  const userRole = profile?.role || 'buyer';

  // Filter nav items based on user role
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.requireAdmin && !ADMIN_ROLES.includes(userRole)) return false;
    if (item.requireAuth && !isAuthenticated) return false;
    return true;
  });

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
            CI
          </div>
          <div>
            <h1 className="text-base font-bold text-white">CropsIntel</h1>
            <p className="text-[10px] text-gray-500 tracking-wide">AUTONOMOUS V2</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleItems.map(item => {
          const isActive = location.pathname === item.path;
          const isLocked = item.requireTeam && !TEAM_ROLES.includes(userRole);
          return (
            <Link
              key={item.path}
              to={isLocked ? '#' : item.path}
              onClick={isLocked ? e => e.preventDefault() : undefined}
              title={isLocked ? 'Team access required' : item.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isLocked
                  ? 'text-gray-700 cursor-not-allowed'
                  : isActive
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              {isLocked && <span className="ml-auto text-[10px] text-gray-700">🔒</span>}
            </Link>
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
          10-year data | 9 crop years | Self-maintaining
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
  const userRole = profile?.role || 'buyer';
  const [showMore, setShowMore] = React.useState(false);

  const moreItems = MOBILE_MORE.filter(item => {
    if (item.requireAdmin && !ADMIN_ROLES.includes(userRole)) return false;
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
              const isLocked = item.requireTeam && !TEAM_ROLES.includes(userRole);
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
};

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const name = PAGE_TITLES[location.pathname] || 'Dashboard';
    document.title = `${name} — CropsIntel`;
  }, [location.pathname]);
}

// Full-page routes (no sidebar/nav chrome)
const STANDALONE_ROUTES = ['/', '/welcome', '/login', '/register'];

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
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/trading" element={<TeamRoute><Trading /></TeamRoute>} />
              <Route path="/reports" element={<Reports />} />
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
    </div>
  );
}
