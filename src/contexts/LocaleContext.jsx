// CropsIntel V2 — Locale Context
// 2026-04-25 · Mini-Phase 5
//
// Resolves the app-wide UI locale on mount using this priority:
//   1. user_profiles.preferred_language (if logged in)
//   2. localStorage 'cropsintel_locale'
//   3. IP-derived (ipapi.co, cached in sessionStorage)
//   4. navigator.language
//   5. 'en'
//
// Exposes { locale, setLocale, t, dir, meta } via useLocale(). Persists
// explicit switches to localStorage + user_profiles.preferred_language.

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_META,
  DICT,
  t as translate,
  resolveAppLocale,
} from '../lib/locale';
import { supabase } from '../lib/supabase';

const LocaleContext = createContext(null);

const STORAGE_KEY = 'cropsintel_locale';

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    // Synchronous best-guess from localStorage for zero-flash SSR-safe init.
    try {
      const stored = typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
      if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
    } catch {}
    return DEFAULT_LOCALE;
  });
  const [ready, setReady] = useState(false);

  // On mount: kick off async resolution. If resolveAppLocale returns
  // something different from our sync guess, upgrade silently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try to read the user's stored preference from the profile (if logged
      // in). We don't block on auth — a null result just means no preference.
      let preferred = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data } = await supabase
            .from('user_profiles')
            .select('preferred_language')
            .eq('id', session.user.id)
            .maybeSingle();
          if (data?.preferred_language && SUPPORTED_LOCALES.includes(data.preferred_language)) {
            preferred = data.preferred_language;
          }
        }
      } catch {
        // Silent — locale must never block app init.
      }

      const resolved = await resolveAppLocale({ preferred });
      if (!cancelled && resolved && SUPPORTED_LOCALES.includes(resolved)) {
        setLocaleState(resolved);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Apply <html lang> + dir attributes whenever locale changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = LOCALE_META[locale] || LOCALE_META.en;
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', meta.dir);
  }, [locale]);

  const setLocale = useCallback(async (next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    // Best-effort: persist to user_profiles if logged in. Swallow errors.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase
          .from('user_profiles')
          .update({ preferred_language: next })
          .eq('id', session.user.id);
      }
    } catch {
      // Column may not exist yet (pre-migration); ignore.
    }
  }, []);

  const t = useCallback((key) => translate(locale, key), [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
    ready,
    meta: LOCALE_META[locale] || LOCALE_META.en,
    dir: (LOCALE_META[locale] || LOCALE_META.en).dir,
    supported: SUPPORTED_LOCALES,
    localeMeta: LOCALE_META,
  }), [locale, setLocale, t, ready]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Provider missing — return a no-op shim so non-wrapped consumers don't
    // crash during refactors. English only, setLocale no-op.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (k) => (DICT.en[k] || k),
      ready: false,
      meta: LOCALE_META.en,
      dir: 'ltr',
      supported: SUPPORTED_LOCALES,
      localeMeta: LOCALE_META,
    };
  }
  return ctx;
}
