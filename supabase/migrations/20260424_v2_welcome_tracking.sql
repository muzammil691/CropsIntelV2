-- ═══════════════════════════════════════════════════════════════
-- V2 Welcome completion tracking
-- ═══════════════════════════════════════════════════════════════
--
-- Adds v2_welcome_completed_at so we can distinguish:
--   a) V1 migrated users who have never seen the /set-password page
--      (→ route them there on next OTP login)
--   b) V2 native users or V1 users who have completed welcome
--      (→ route to /dashboard)
--
-- The timestamp is stamped by SetPassword.jsx's handleFinish() once the
-- user clicks "Enter CropsIntel V2". Before this migration runs, frontend
-- selects on this column return `undefined` and we fall through to /dashboard
-- — safe to deploy code before SQL.
--
-- Also adds migrated_from_v1 if not already present so Login.jsx's heuristic
-- has a stable marker. (The field existed in some V1 handoff imports under
-- profile.source = 'v1_migration' but wasn't consistently set.)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Add v2_welcome_completed_at (no default — NULL means "not yet seen")
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS v2_welcome_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.v2_welcome_completed_at IS
  'When the user completed the V2 Welcome flow (password set + email+verify prompt acknowledged). NULL = not yet seen; routes user through /set-password on next OTP login.';

-- Add migrated_from_v1 as a stable marker (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS migrated_from_v1 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.migrated_from_v1 IS
  'TRUE for profiles carried over from CropsIntel V1 (knicjcmgizovpsnmbwex). Used by Login.jsx to decide whether to show /set-password on first V2 login.';

-- Backfill migrated_from_v1 from the historical `source` text column,
-- which V1-import scripts set to 'v1_migration'. If the source column
-- doesn't exist, the update is a soft-fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'source'
  ) THEN
    UPDATE public.user_profiles
       SET migrated_from_v1 = TRUE
     WHERE source = 'v1_migration'
       AND migrated_from_v1 = FALSE;
  END IF;
END $$;

-- Index — we filter on this on every login
CREATE INDEX IF NOT EXISTS idx_user_profiles_v2_welcome_completed_at
  ON public.user_profiles (v2_welcome_completed_at)
  WHERE v2_welcome_completed_at IS NULL;

COMMIT;
