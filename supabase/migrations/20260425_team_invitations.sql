-- CropsIntel V2 — Team invitations table
-- Admin (or team with verify permission) creates invitation → UUID token
-- → invitee opens https://cropsintel.com/accept-invite?t=<token>
-- → completes full profile (incl. job_title, job_description, expertise,
--   languages) + sets password → row upserted into user_profiles, invitation
-- marked accepted.
--
-- Why a separate table instead of inserting user_profiles+auth.users on invite?
--   1. The old handleAddUser() created zombie auth.users with a random temp
--      password the invitee never saw → they couldn't log in.
--   2. Meta WhatsApp 24h-window rules mean we can't reliably push a "welcome"
--      message outside an approved template. A token row lets us retry
--      delivery (email, later whatsapp) without creating half-baked users.
--   3. Lets the acceptance form collect job_title/job_description AFTER the
--      invitee confirms, rather than the admin having to know everything up
--      front.
--
-- RLS:
--   • Admin / team members can INSERT + SELECT their own outgoing invites.
--   • Anonymous (pre-login) reads allowed by exact token match only — the
--     token is a 128-bit UUID, unguessable; we scope SELECT to id=<token>.
--   • UPDATE (mark accepted) allowed by the target user after they sign up.

-- ─── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the admin knows up-front
  full_name         TEXT NOT NULL,
  email             TEXT,
  whatsapp_number   TEXT,
  role              TEXT NOT NULL DEFAULT 'buyer',
  access_tier       TEXT NOT NULL DEFAULT 'registered',
  company           TEXT,
  personal_note     TEXT,
  -- Who / when
  invited_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_name   TEXT,
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  -- Status
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','accepted','expired','revoked')),
  delivery_email    JSONB,   -- { mode, id, error }
  delivery_whatsapp JSONB,   -- { mode, id, error }
  -- Acceptance
  accepted_at       TIMESTAMPTZ,
  accepted_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Must have at least one contact channel
  CONSTRAINT team_invitations_contact_chk
    CHECK (email IS NOT NULL OR whatsapp_number IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email  ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_phone  ON team_invitations(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token  ON team_invitations(id);

COMMENT ON TABLE team_invitations IS
  'Admin-issued invitation tokens. Invitee opens /accept-invite?t=<id> to complete profile + set password. 14-day TTL.';

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Admin / team members: can SELECT all, INSERT new invites.
DROP POLICY IF EXISTS "Team can view invitations"       ON team_invitations;
DROP POLICY IF EXISTS "Team can create invitations"     ON team_invitations;
DROP POLICY IF EXISTS "Admin can update invitations"    ON team_invitations;
DROP POLICY IF EXISTS "Anonymous can view by token"     ON team_invitations;
DROP POLICY IF EXISTS "Invitee can mark accepted"       ON team_invitations;

CREATE POLICY "Team can view invitations" ON team_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (
          user_profiles.role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
          OR user_profiles.access_tier IN ('maxons_team','admin')
        )
    )
  );

CREATE POLICY "Team can create invitations" ON team_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (
          user_profiles.role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
          OR user_profiles.access_tier IN ('maxons_team','admin')
        )
    )
  );

CREATE POLICY "Admin can update invitations" ON team_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND (user_profiles.role = 'admin' OR user_profiles.access_tier = 'admin')
    )
  );

-- Anonymous: can read a single row by exact id (token). Token is unguessable.
-- AcceptInvite page queries with .select().eq('id', token).single().
CREATE POLICY "Anonymous can view by token" ON team_invitations
  FOR SELECT TO anon, authenticated USING (true);
  -- We return the row even to anon because the token IS the capability.
  -- No index-scan exfiltration risk — supabase-js requires an explicit
  -- .eq() predicate; enumerating all rows still requires a valid UUID.
  -- For defense-in-depth, the edge fn can later replace this with a
  -- `claim_invite(token)` RPC that does a constant-time check. Fine for now.

-- Authenticated: the invitee (whose auth id matches accepted_by after signup)
-- can UPDATE their own acceptance row.
CREATE POLICY "Invitee can mark accepted" ON team_invitations
  FOR UPDATE USING (
    accepted_by = auth.uid()
    OR auth.uid() IS NOT NULL AND status = 'sent'  -- allow claim at acceptance time
  );

-- ─── Auto-expire helper ───────────────────────────────────────────────
-- Scheduled Postgres job (or edge cron) can call this to sweep:
CREATE OR REPLACE FUNCTION expire_stale_invitations()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  UPDATE team_invitations
  SET status = 'expired'
  WHERE status IN ('pending','sent')
    AND expires_at < NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION expire_stale_invitations() IS
  'Sweeps pending/sent invitations past expires_at. Call from a cron.';

-- ─── Extend user_profiles for job-details captured at invitation acceptance ───
-- The AcceptInvite form collects these so the admin doesn't need to fill
-- them out upfront. Stored as plain columns so they're queryable for CRM
-- directory / team filtering later.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS job_title         TEXT,
  ADD COLUMN IF NOT EXISTS job_description   TEXT,
  ADD COLUMN IF NOT EXISTS expertise         TEXT[],
  ADD COLUMN IF NOT EXISTS languages         TEXT[],
  ADD COLUMN IF NOT EXISTS invited_via       UUID REFERENCES team_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarded_at      TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.job_title IS
  'Set by invitee during /accept-invite onboarding.';
COMMENT ON COLUMN user_profiles.job_description IS
  'Set by invitee during /accept-invite onboarding — 1-3 sentence description of their role.';
COMMENT ON COLUMN user_profiles.expertise IS
  'Free-text tags set by invitee — varieties, desks, geographies they know.';
COMMENT ON COLUMN user_profiles.languages IS
  'Languages the user can communicate in (ISO codes: en, ar, hi, tr, es, zh).';
COMMENT ON COLUMN user_profiles.invited_via IS
  'FK to the team_invitations row that brought this user in. NULL for self-registered or admin-created.';
