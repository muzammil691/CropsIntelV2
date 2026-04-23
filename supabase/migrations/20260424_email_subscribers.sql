-- ═══════════════════════════════════════════════════════════════
-- Email subscribers cohort (V1 legacy + new captures)
-- ═══════════════════════════════════════════════════════════════
--
-- V1 had two overlapping audiences:
--   a) Registered users (email+phone, had accounts) — migrated to user_profiles
--   b) Subscribers (email-only, never registered) — previously uncaptured
--
-- User directive 2026-04-24: "in V1, we had subscribers who just subscribe and
-- there are users who are automatically subscribed or subscribed first and then
-- registered, we need data of both and should be visible in users to send them
-- broadcast to connect again"
--
-- This table holds the subscriber cohort. When a subscriber later registers,
-- their subscriber row gets linked via `user_profile_id` and `converted_at` —
-- we never delete, so cohort analytics remain accurate.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_subscribers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  name               TEXT,
  source             TEXT NOT NULL DEFAULT 'v2_signup',
    -- 'v1_subscribers' | 'v1_registered' | 'v2_signup' | 'v2_register' |
    -- 'footer_form' | 'welcome_form' | 'zyra_chat' | 'manual_admin'
  subscribed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at    TIMESTAMPTZ,
  user_profile_id    UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  converted_at       TIMESTAMPTZ,
    -- stamped when subscriber registers a full account
  tags               TEXT[] DEFAULT '{}',
    -- e.g., ['v1', 'buyer', 'turkey'] — admin can filter broadcasts by tag
  metadata           JSONB DEFAULT '{}'::jsonb,
    -- company, country, volume_bracket, language, etc.
  last_email_sent_at TIMESTAMPTZ,
  email_count        INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_subscribers_email_lower_unique UNIQUE (email)
);

COMMENT ON TABLE public.email_subscribers IS
  'Email-capture cohort. Includes V1 email-only subscribers + V2 signups before full registration. Links to user_profiles on conversion.';

CREATE INDEX IF NOT EXISTS idx_email_subscribers_source        ON public.email_subscribers (source);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_subscribed_at ON public.email_subscribers (subscribed_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_tags          ON public.email_subscribers USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_user_profile  ON public.email_subscribers (user_profile_id) WHERE user_profile_id IS NOT NULL;

-- ─── Broadcast history ─────────────────────────────────────────
-- Each admin/team-issued email broadcast logs here with the recipient
-- cohort query + the email-send edge function job id(s).

CREATE TABLE IF NOT EXISTS public.email_broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by           UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL,
  html              TEXT,
  text              TEXT,
  cohort_filter     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- {source: 'v1_subscribers', tags: ['turkey'], converted: false}
  recipient_count   INT NOT NULL DEFAULT 0,
  sent_count        INT NOT NULL DEFAULT 0,
  queued_count      INT NOT NULL DEFAULT 0,
  failed_count      INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sending' | 'completed' | 'failed'
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_broadcasts IS
  'Admin-issued email broadcast campaigns. Links to email_send_log per-recipient via job tag.';

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_sent_by   ON public.email_broadcasts (sent_by);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status    ON public.email_broadcasts (status);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_created   ON public.email_broadcasts (created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_broadcasts  ENABLE ROW LEVEL SECURITY;

-- Admins can read/write everything
DROP POLICY IF EXISTS "Admins full access to subscribers" ON public.email_subscribers;
CREATE POLICY "Admins full access to subscribers"
  ON public.email_subscribers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins full access to broadcasts" ON public.email_broadcasts;
CREATE POLICY "Admins full access to broadcasts"
  ON public.email_broadcasts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')
    )
  );

-- Anyone (including anon) can INSERT into subscribers via footer forms etc.
-- This is bounded by the UNIQUE(email) constraint — no spam-of-same-email.
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;
CREATE POLICY "Anyone can subscribe"
  ON public.email_subscribers FOR INSERT
  WITH CHECK (true);

-- Subscribers can UNSUBSCRIBE themselves by updating unsubscribed_at only
-- (enforced via the tokenized unsubscribe link flow, not open UPDATE).
-- Leaving as admin-only UPDATE for now; unsubscribe flows through an
-- admin-service endpoint.

COMMIT;
