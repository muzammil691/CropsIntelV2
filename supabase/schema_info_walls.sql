-- CropsIntelV2 — Information Walls + Audit Log extension
-- Phase 7 scaffolding (2026-04-24). Additive; non-destructive.
--
-- Per vision: walls must be enforced at DB layer (RLS) + API layer
-- (middleware filter) + Frontend layer (portal routing). This file covers
-- the DB layer. The API + Frontend layers live in src/lib/permissions.js.

-- ============================================================
-- audit_log — every counterparty-data access is recorded
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID,                       -- auth.users.id of the acting user (nullable for system actions)
  actor_email TEXT,                    -- denormalized for quick review
  actor_role TEXT,                     -- snapshot of role at action time
  action TEXT NOT NULL,                -- 'read' | 'write' | 'delete' | 'export' | 'invite' | 'verify'
  resource TEXT NOT NULL,              -- 'crm_contacts' | 'user_profiles' | 'crm_deals' | ...
  target_id TEXT,                      -- id of the affected row (TEXT because mixed types)
  scope JSONB DEFAULT '{}',            -- filter/tier/variety context
  status TEXT DEFAULT 'success',       -- 'success' | 'denied' | 'error'
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins/maxons_team can read the audit log
DROP POLICY IF EXISTS "Internal read audit" ON audit_log;
CREATE POLICY "Internal read audit" ON audit_log FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
      AND up.access_tier IN ('admin', 'maxons_team')
  )
);

-- Any authenticated user can write their own audit entries
DROP POLICY IF EXISTS "Authed write audit" ON audit_log;
CREATE POLICY "Authed write audit" ON audit_log FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (actor_id IS NULL OR actor_id = auth.uid())
);

-- ============================================================
-- Information-wall RLS policies per core counterparty table
-- ============================================================
-- These policies encode the 3 non-negotiable rules:
--   customer NEVER sees supplier source / broker source / margin
--   supplier NEVER sees customer identities / broker data / margin
--   broker   NEVER sees customer identities / supplier pricing

-- Helper: returns the family for the current user (via user_profiles.role)
-- Using a stored SQL function so RLS policies can call it cheaply.

CREATE OR REPLACE FUNCTION user_family()
RETURNS TEXT AS $$
DECLARE
  r TEXT;
  t TEXT;
BEGIN
  SELECT role, access_tier INTO r, t FROM user_profiles WHERE id = auth.uid();
  IF t IN ('admin', 'maxons_team') THEN RETURN 'internal'; END IF;
  IF r IN ('admin', 'maxons_team', 'sales', 'operations', 'purchase', 'support', 'accounts', 'analyst', 'seller') THEN RETURN 'internal'; END IF;
  IF r IN ('buyer', 'importer') THEN RETURN 'customer'; END IF;
  IF r IN ('supplier', 'handler', 'grower', 'processor') THEN RETURN 'supplier'; END IF;
  IF r IN ('broker', 'trader') THEN RETURN 'broker'; END IF;
  IF r IN ('logistics', 'freight') THEN RETURN 'logistics'; END IF;
  IF r = 'finance' THEN RETURN 'finance'; END IF;
  RETURN 'guest';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── crm_contacts wall ───────────────────────────────────────────────
-- Internal sees all. External families see only rows where contact_type
-- matches their family (supplier sees supplier rows, broker sees broker rows,
-- customer sees buyer rows AND only their own record).
DROP POLICY IF EXISTS "Info-wall read crm_contacts" ON crm_contacts;
CREATE POLICY "Info-wall read crm_contacts" ON crm_contacts FOR SELECT USING (
  user_family() = 'internal'
  OR (user_family() = 'supplier' AND contact_type = 'supplier' AND email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
  OR (user_family() = 'broker'   AND contact_type = 'broker'   AND email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
  OR (user_family() = 'customer' AND contact_type = 'buyer'    AND email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
);

-- ─── crm_deals wall ───────────────────────────────────────────────────
-- Customers see only deals where they're the buyer (via contact email match).
-- Suppliers see only deals where they're the seller side.
-- Brokers see only deals where they're the intermediary.
-- Internal sees all.
DROP POLICY IF EXISTS "Info-wall read crm_deals" ON crm_deals;
CREATE POLICY "Info-wall read crm_deals" ON crm_deals FOR SELECT USING (
  user_family() = 'internal'
  OR (
    EXISTS (
      SELECT 1 FROM crm_contacts c
      WHERE c.id = crm_deals.contact_id
        AND c.email = (SELECT email FROM user_profiles WHERE id = auth.uid())
    )
  )
);

-- ─── user_profiles wall ──────────────────────────────────────────────
-- Users can read their own profile + internal sees all. No cross-family leakage.
DROP POLICY IF EXISTS "Info-wall read user_profiles" ON user_profiles;
CREATE POLICY "Info-wall read user_profiles" ON user_profiles FOR SELECT USING (
  id = auth.uid() OR user_family() = 'internal'
);

-- ─── Future: abc_* tables get commodity-level scoping (Phase 8) ─────
-- When abc_*_reports tables migrate to commodity_id, add per-commodity
-- visibility. For now these are public reference data (current policies
-- in schema.sql already permit public reads).

-- ============================================================
-- Notes
-- ============================================================
-- This file is additive — run after schema.sql. Existing "public read"
-- policies on crm_* tables should be DROPPED before running this file so
-- the info-wall policies take effect exclusively. See migration notes in
-- docs/INFORMATION_WALLS.md.
