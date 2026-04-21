import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const COMMANDS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: '\u{1F4CA}', keywords: 'home overview stats' },
  { id: 'supply', label: 'Supply & Demand', path: '/supply', icon: '\u{2696}\u{FE0F}', keywords: 'position abc uncommitted shipped' },
  { id: 'destinations', label: 'Destinations & Trade Flow', path: '/destinations', icon: '\u{1F30D}', keywords: 'export import country india europe' },
  { id: 'pricing', label: 'Live Pricing', path: '/pricing', icon: '\u{1F4B0}', keywords: 'strata price cost market nonpareil carmel' },
  { id: 'forecasts', label: 'Crop Forecasts', path: '/forecasts', icon: '\u{1F52E}', keywords: 'production acreage yield crop estimate' },
  { id: 'news', label: 'News & Intelligence', path: '/news', icon: '\u{1F4F0}', keywords: 'articles industry press releases' },
  { id: 'analysis', label: 'Market Analysis', path: '/analysis', icon: '\u{1F4C8}', keywords: 'charts trends yoy comparison 10 year' },
  { id: 'crm', label: 'CRM & Deals', path: '/crm', icon: '\u{1F91D}', keywords: 'contacts pipeline deals customers' },
  { id: 'intelligence', label: 'AI Intelligence', path: '/intelligence', icon: '\u{1F9E0}', keywords: 'zyra ai chat trade signals briefs' },
  { id: 'trading', label: 'Trading Portal', path: '/trading', icon: '\u{1F4BC}', keywords: 'offers buyer supplier portal' },
  { id: 'reports', label: 'Position Reports', path: '/reports', icon: '\u{1F4CB}', keywords: 'abc monthly reports data table' },
  { id: 'autonomous', label: 'Autonomous Systems', path: '/autonomous', icon: '\u{1F916}', keywords: 'scraper pipeline upload ingest' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: '\u{2699}\u{FE0F}', keywords: 'api keys config ai' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = COMMANDS.filter(cmd => {
    if (!query) return true;
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.keywords.includes(q);
  });

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0); }, [query]);

  const runCommand = useCallback((cmd) => {
    setOpen(false);
    navigate(cmd.path);
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      runCommand(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages... (type to filter)"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-800 rounded border border-gray-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => runCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selectedIndex ? 'bg-green-500/10 text-green-400' : 'text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              <span className="text-lg w-7 text-center">{cmd.icon}</span>
              <span className="text-sm font-medium">{cmd.label}</span>
              {i === selectedIndex && (
                <span className="ml-auto text-[10px] text-gray-500">Enter to navigate</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No pages match "{query}"
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500">\u2191\u2193</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500">\u21B5</kbd> open</span>
          <span><kbd className="px-1 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
