import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';

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

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/supply', label: 'Supply & Demand', icon: '⚖️' },
  { path: '/destinations', label: 'Destinations', icon: '🌍' },
  { path: '/pricing', label: 'Pricing', icon: '💰' },
  { path: '/forecasts', label: 'Forecasts', icon: '🔮' },
  { path: '/news', label: 'News & Intel', icon: '📰' },
  { path: '/analysis', label: 'Analysis', icon: '📈' },
  { path: '/reports', label: 'Reports', icon: '📋' },
  { path: '/autonomous', label: 'Autonomous', icon: '🤖' }
];

function Sidebar() {
  const location = useLocation();

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
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

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
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] text-gray-500">Live</span>
      </div>
    </header>
  );
}

// Mobile bottom nav — show top 5 items + "More" drawer for the rest
const MOBILE_PRIMARY = NAV_ITEMS.slice(0, 4);
const MOBILE_MORE = NAV_ITEMS.slice(4);

function MobileNav() {
  const location = useLocation();
  const [showMore, setShowMore] = React.useState(false);

  return (
    <>
      {/* More drawer overlay */}
      {showMore && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute bottom-16 left-0 right-0 bg-gray-900 border-t border-gray-800 rounded-t-2xl p-4 space-y-1"
               onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-3" />
            {MOBILE_MORE.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-green-500/10 text-green-400' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
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
  '/': 'Dashboard',
  '/supply': 'Supply & Demand',
  '/destinations': 'Destinations & Trade Flow',
  '/pricing': 'Live Pricing',
  '/forecasts': 'Crop Forecasts',
  '/news': 'News & Intelligence',
  '/analysis': 'Market Analysis',
  '/reports': 'Position Reports',
  '/autonomous': 'Autonomous Systems',
};

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const name = PAGE_TITLES[location.pathname] || 'Dashboard';
    document.title = `${name} — CropsIntel`;
  }, [location.pathname]);
}

export default function App() {
  usePageTitle();
  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-auto">
        <MobileHeader />
        <main className="flex-1 pb-16 lg:pb-0">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/supply" element={<Supply />} />
              <Route path="/destinations" element={<Destinations />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/forecasts" element={<Forecasts />} />
              <Route path="/news" element={<News />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/autonomous" element={<Autonomous />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
