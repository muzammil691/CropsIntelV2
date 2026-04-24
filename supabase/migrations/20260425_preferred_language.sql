-- CropsIntel V2 — Mini-Phase 5 · Multilingual
-- 2026-04-25
--
-- Adds preferred_language column to user_profiles so the LocaleProvider
-- can persist an explicit switch across devices. Supports 5 launch locales
-- (en/ar/hi/tr/es). Null = use IP-derived default per session.
--
-- Zyra's FIRST greeting uses IP-derived locale regardless of this value
-- (user directive 2026-04-25); subsequent chrome + Zyra use this column.
--
-- Safe to re-run (IF NOT EXISTS).

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language text
    CHECK (preferred_language IS NULL OR preferred_language IN (
      'en', 'ar', 'hi', 'tr', 'es'
    ));

COMMENT ON COLUMN public.user_profiles.preferred_language IS
  'Explicit UI locale chosen by user (en/ar/hi/tr/es). Null = use IP default.';

-- Verify
SELECT 'user_profiles.preferred_language check' AS check_name,
       COUNT(*) FILTER (WHERE column_name = 'preferred_language') AS has_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_profiles';

COMMIT;
