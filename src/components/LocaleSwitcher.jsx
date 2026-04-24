// CropsIntel V2 — LocaleSwitcher
// 2026-04-25 · Mini-Phase 5
//
// Compact dropdown for switching UI locale. Writes to
// user_profiles.preferred_language (if logged in) + localStorage so the
// choice survives a logout. RTL handled automatically by LocaleProvider.

import React, { useState, useRef, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';

export default function LocaleSwitcher({ compact = false, className = '' }) {
  const { locale, setLocale, supported, localeMeta } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = localeMeta[locale] || localeMeta.en;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800/60 border border-gray-700/60 rounded-lg text-gray-200 hover:bg-gray-700/60 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current.flag}</span>
        {!compact && <span className="font-medium">{current.native}</span>}
        <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 z-50 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
        >
          {supported.map(code => {
            const meta = localeMeta[code];
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => { setLocale(code); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-green-500/15 text-green-200'
                      : 'text-gray-200 hover:bg-gray-800'
                  }`}
                  role="option"
                  aria-selected={active}
                >
                  <span className="text-base leading-none">{meta.flag}</span>
                  <span className="flex-1">
                    <span className="block font-medium">{meta.native}</span>
                    <span className="block text-[11px] text-gray-500">{meta.name}</span>
                  </span>
                  {active && (
                    <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
