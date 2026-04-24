// CropsIntel V2 — Locale Context
// 2026-04-25 · Mini-Phase 5 (app-lock revert 2026-04-25 evening)
//
// APP-LEVEL LOCALE IS CURRENTLY LOCKED TO ENGLISH + LTR.
//
// Why: on first live render the `<html dir>` flipped to RTL for non-English
// detected locales, which visually flipped the whole app even though the
// copy stayed English. The user explicitly asked us to roll back the
// app-wide multilingual rollout ("the app should go back to english and
// left to right") until we've done a careful render-review cycle.
//
// Still locale-aware (these run INDEPENDENTLY of this provider):
//   - Zyra's first-greeting IP detection (`resolveZyraFirstLocale` in
//     src/lib/locale.js — bypasses this provider entirely)
//   - WhatsApp per-country messaging (server-side, edge functions)
//
// When we re-enable app-wide multilingual, un-hardcode `ENFORCED_LOCALE`
// and restore the resolution chain + the LocaleSwitcher in the top bar.

import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_META,
  DICT,
  t as translate,
} from '../lib/locale';
import { supabase } from '../lib/supabase';

const LocaleContext = createContext(null);

// Hard lock — flip to `null` (and restore the resolution chain below)
// when the multilingual app-layer is approved.
const ENFORCED_LOCALE = 'en';

export function LocaleProvider({ children }) {
  // While the app-lock is in place, locale is always ENFORCED_LOCALE.
  // We still expose setLocale() so the profile column can be persisted
  // (Zyra + WhatsApp use that value); it just won't flip the UI.
  const locale = ENFORCED_LOCALE;

  // Apply <html lang> + dir attributes — always English + LTR.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  }, []);

  // setLocale persists to user_profiles.preferred_language only — Zyra
  // reads that column for its first-greeting locale and WhatsApp uses it
  // for outbound template selection. It does NOT flip the app UI while
  // the lock is in place.
  const setLocale = useCallback(async (next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase
          .from('user_profiles')
          .update({ preferred_language: next })
          .eq('id', session.user.id);
      }
    } catch {
      // Column may not exist yet (pre-migration); ignore silently.
    }
  }, []);

  const t = useCallback((key) => translate(locale, key), [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
    ready: true,
    meta: LOCALE_META[locale] || LOCALE_META.en,
    dir: 'ltr',
    supported: SUPPORTED_LOCALES,
    localeMeta: LOCALE_META,
    // Surface the lock so admin UI can show "language preview locked"
    // instead of rendering a switcher that does nothing visible.
    appLocaleLocked: true,
  }), [locale, setLocale, t]);

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
      appLocaleLocked: true,
    };
  }
  return ctx;
}
