-- ═══════════════════════════════════════════════════════════════
-- Rich profile columns: grades, sizes, references
-- ═══════════════════════════════════════════════════════════════
--
-- User directive 2026-04-24: "profile should be rich which can be updated
-- about asking them about volumes selectable verieties, selectable ports
-- they import or export to, grades, sizes, multiple products input...
-- what describes them best... references if any (AI will invite people
-- with references)."
--
-- Register.jsx now collects:
--   - preferred_grades TEXT[]  (US Extra No.1, US Select Sheller Run, …)
--   - preferred_sizes  TEXT[]  (18/20, 20/22, 23/25, shelled counts/oz, …)
--   - references       TEXT    (free-form: who you trade with, seeds AI invites)
--
-- Settings.jsx profile editor already supports these fields through its
-- generic form. No UI change needed in Settings beyond what already exists.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_grades TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_sizes  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "references"      TEXT;

COMMENT ON COLUMN public.user_profiles.preferred_grades IS
  'Grade selections from Register.jsx GRADES constant (US Extra No.1, Select Sheller Run, etc.). Used by offer-matching + Zyra personalization.';

COMMENT ON COLUMN public.user_profiles.preferred_sizes IS
  'Size selections from Register.jsx SIZES constant (18/20, 20/22, shelled 25/27, etc.). Inshell or shelled count-per-oz convention.';

COMMENT ON COLUMN public.user_profiles."references" IS
  'Free-form list of companies/people the user trades with. Seeds Zyra\'s AI-driven network invitations when peers join the platform. Private — never shown to other users without permission.';

-- GIN indexes for grade/size filtering in offer-matching queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_grades
  ON public.user_profiles USING GIN (preferred_grades);

CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_sizes
  ON public.user_profiles USING GIN (preferred_sizes);

COMMIT;
