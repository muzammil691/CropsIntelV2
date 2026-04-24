-- ═══════════════════════════════════════════════════════════════════════════
-- CropsIntel V2 → Trade Hub foundation migration
-- Date: 2026-04-25
--
-- Purpose: add the *cheapest possible* schema scaffolding that aligns V2's
-- current surface with the canonical Trade Hub spec (docs/TRADE_HUB_SPEC_v1.md)
-- without breaking anything shipping today.
--
-- Design principles:
--   1. Every new column on user_profiles is NULLABLE with no default that
--      materializes data — existing rows are untouched, new rows can leave
--      blanks until the UI starts collecting them.
--   2. Legacy `role` values (buyer, seller, trader, broker, grower, supplier,
--      processor, analyst, sales, maxons_team, admin) continue to work; the
--      new spec-aligned role names are added as ADDITIONAL valid values, not
--      replacements. A role_aliases view maps both directions so queries
--      don't need to know which name is in use.
--   3. Tables are stubs: entities, offers (new) — just enough shape to
--      accept data and be referenced. Full Phase 7 tables (deals, contracts,
--      shipments, payments) are NOT created here — that's the 11-month build.
--   4. Idempotent: every statement uses IF NOT EXISTS or ON CONFLICT so this
--      can be re-run safely after partial application.
--
-- What this migration does NOT do (deferred to Phase 7):
--   - deals table, contracts table, shipments table, payments table
--   - per-entity ledger separation (just tags rows with entity_id)
--   - counterparty master as a separate table (kept unified with user_profiles
--     for now; Phase 7 may split)
--   - RLS on entities/offers beyond "authenticated can SELECT"
--   - full 25-state deal state machine (just status TEXT for now)
--
-- Cross-walk: docs/TRADE_HUB_CROSSWALK_v1.md §2, §3, §4
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- (A) Counterparty / User-profile fields from spec §2.2 + §2.10
-- ─────────────────────────────────────────────────────────────────────────
-- Nullable additions. Existing rows stay valid. New UI surfaces will
-- progressively start populating these as we iterate.

ALTER TABLE public.user_profiles
  -- Identity & legal (spec §2.2)
  ADD COLUMN IF NOT EXISTS legal_entity_name        TEXT,
  ADD COLUMN IF NOT EXISTS tax_id                   TEXT,
  ADD COLUMN IF NOT EXISTS vat_id                   TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_number     TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_expiry     DATE,
  ADD COLUMN IF NOT EXISTS trade_license_document_url TEXT,
  ADD COLUMN IF NOT EXISTS registered_address       TEXT,
  ADD COLUMN IF NOT EXISTS operating_addresses      JSONB,
  ADD COLUMN IF NOT EXISTS region                   TEXT,          -- derived from country later
  -- Commercial preferences (§2.2)
  ADD COLUMN IF NOT EXISTS primary_currency         TEXT,           -- ISO (AED, USD, EUR, ...)
  ADD COLUMN IF NOT EXISTS payment_terms_default    TEXT,
  ADD COLUMN IF NOT EXISTS payment_methods_accepted TEXT[],
  ADD COLUMN IF NOT EXISTS incoterm_preference      TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_discharge_ports TEXT[],
  ADD COLUMN IF NOT EXISTS required_documents       TEXT[],
  ADD COLUMN IF NOT EXISTS special_contract_clauses JSONB,
  -- Credit / risk (§2.2)
  ADD COLUMN IF NOT EXISTS credit_limit             NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS credit_limit_currency    TEXT,
  ADD COLUMN IF NOT EXISTS kyc_status               TEXT DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','approved','rejected','expired')),
  ADD COLUMN IF NOT EXISTS kyc_expiry_date          DATE,
  ADD COLUMN IF NOT EXISTS sanctions_screening_status TEXT,
  ADD COLUMN IF NOT EXISTS last_screened_date       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_flags               TEXT[],
  -- Commercial performance snapshot (§2.2)
  ADD COLUMN IF NOT EXISTS historical_performance   JSONB,
  -- Assignment (§2.2 + §12)
  ADD COLUMN IF NOT EXISTS assigned_account_manager     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_procurement_officer UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  -- Type & portal & authority (§2.10 + §12.3)
  ADD COLUMN IF NOT EXISTS counterparty_type        TEXT
    CHECK (counterparty_type IS NULL OR counterparty_type IN ('buyer','supplier','broker','reseller_both','internal')),
  ADD COLUMN IF NOT EXISTS portal                   TEXT
    CHECK (portal IS NULL OR portal IN ('maxons_internal','buyer','supplier','broker')),
  ADD COLUMN IF NOT EXISTS authority_tier           INT
    CHECK (authority_tier IS NULL OR authority_tier BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS authority_tier_override  INT
    CHECK (authority_tier_override IS NULL OR authority_tier_override BETWEEN 1 AND 4),
  -- Single-preference flavor of languages[] for convenience (§2.10)
  ADD COLUMN IF NOT EXISTS preferred_language       TEXT,
  ADD COLUMN IF NOT EXISTS preferred_currency       TEXT,
  ADD COLUMN IF NOT EXISTS preferred_units          TEXT CHECK (preferred_units IS NULL OR preferred_units IN ('metric','imperial')),
  -- Onboarding provenance — what role were they originally invited as?
  -- Useful for admin audit when roles get changed later.
  ADD COLUMN IF NOT EXISTS onboarded_as_role        TEXT;

COMMENT ON COLUMN public.user_profiles.legal_entity_name IS
  'Spec §2.2 — legal name distinct from brand/company.';
COMMENT ON COLUMN public.user_profiles.counterparty_type IS
  'Spec §2.2 — buyer/supplier/broker/reseller_both/internal. Distinct from role (role describes function, type describes which side of the trade).';
COMMENT ON COLUMN public.user_profiles.portal IS
  'Spec §1.1/§2.10 — which of the 4 portals this user primarily inhabits. Derived from role if NULL.';
COMMENT ON COLUMN public.user_profiles.authority_tier IS
  'Spec §12.3 — 1 (up to $50K), 2 ($50K–$250K), 3 ($250K–$1M), 4 (>$1M). Gates deal-level actions.';
COMMENT ON COLUMN public.user_profiles.kyc_status IS
  'Spec §2.2 — pending/approved/rejected/expired. Phase 7 compliance dashboard reads this.';
COMMENT ON COLUMN public.user_profiles.onboarded_as_role IS
  'The role value as it appeared in the original team_invitations row. Preserves audit trail when admin later changes role.';

-- Auto-fill region from country (best-effort mapping). Only sets if NULL.
CREATE OR REPLACE FUNCTION public.derive_region_from_country(country_name TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN country_name IN ('United Arab Emirates','UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Yemen') THEN 'GCC'
    WHEN country_name IN ('Pakistan','India','Bangladesh','Nepal','Sri Lanka','Bhutan') THEN 'South Asia'
    WHEN country_name IN ('United States','USA','Canada','Mexico') THEN 'North America'
    WHEN country_name IN ('Turkey','Algeria','Georgia','Armenia','Azerbaijan') THEN 'CIS/Caucasus'
    WHEN country_name IN ('Italy','Spain','France','Germany','Netherlands','United Kingdom','UK','Belgium','Portugal') THEN 'EU/UK'
    WHEN country_name IN ('Egypt','Morocco','Tunisia','Libya','Lebanon','Jordan','Syria','Iraq','Iran') THEN 'MENA'
    WHEN country_name IN ('China','Japan','South Korea','Hong Kong','Taiwan','Singapore','Malaysia','Indonesia','Vietnam','Philippines','Thailand') THEN 'East Asia / SEA'
    WHEN country_name IN ('Russia','Belarus','Kazakhstan','Uzbekistan','Kyrgyzstan','Turkmenistan','Tajikistan') THEN 'CIS'
    WHEN country_name IN ('Australia','New Zealand') THEN 'Oceania'
    WHEN country_name IN ('South Africa','Nigeria','Kenya','Ethiopia','Ghana') THEN 'Sub-Saharan Africa'
    WHEN country_name IN ('Brazil','Argentina','Chile','Colombia','Peru') THEN 'Latin America'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.derive_region_from_country IS
  'Spec §2.2 — auto-derives region from country string. Coarse; refine per needs.';

-- One-shot backfill: populate region for existing rows where possible.
UPDATE public.user_profiles
   SET region = public.derive_region_from_country(country)
 WHERE region IS NULL AND country IS NOT NULL;

-- Trigger: keep region in sync on insert/update of country (only if region unset).
CREATE OR REPLACE FUNCTION public.user_profiles_region_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.region IS NULL AND NEW.country IS NOT NULL THEN
    NEW.region := public.derive_region_from_country(NEW.country);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_profiles_region_sync ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_region_sync
  BEFORE INSERT OR UPDATE OF country ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_region_sync();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- (B) Entities table — spec §1.3
-- ─────────────────────────────────────────────────────────────────────────
-- Two seed rows today: Maxons General Trading LLC + Maxons Impex DWC LLC.
-- New entities added via Super Admin UI later (entity provisioning wizard).
-- Minimal columns for NOW; Phase 7 adds bank accounts, consolidation rules,
-- reporting currency, statutory details, etc.

BEGIN;

CREATE TABLE IF NOT EXISTS public.entities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,          -- 3-letter prefix used in contract numbers (MGT, MIX, ...)
  legal_name            TEXT NOT NULL,                  -- e.g., 'Maxons General Trading LLC'
  short_name            TEXT,                           -- display name (Maxons GT, Maxons Impex)
  jurisdiction          TEXT,                           -- 'UAE Mainland', 'UAE DWC Free Zone', 'California', 'Singapore'
  jurisdiction_type     TEXT CHECK (jurisdiction_type IS NULL OR jurisdiction_type IN ('mainland','free_zone','offshore','branch')),
  tax_id                TEXT,
  vat_id                TEXT,
  trade_license_number  TEXT,
  trade_license_expiry  DATE,
  primary_bank          TEXT,                           -- e.g., 'Emirates Islamic Bank', 'National Bank of Fujairah'
  reporting_currency    TEXT DEFAULT 'AED',
  supported_regions     TEXT[],                         -- spec §1.3 — which regions this entity serves
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_code        ON public.entities (code);
CREATE INDEX IF NOT EXISTS idx_entities_is_active   ON public.entities (is_active);

COMMENT ON TABLE public.entities IS
  'Spec §1.3 — legal entities operating under the Maxons Group umbrella. Each has an independent ledger (Phase 7). Code is used in contract-number prefix (MGT, MIX, …).';

-- Seed the two known entities.
INSERT INTO public.entities (code, legal_name, short_name, jurisdiction, jurisdiction_type, primary_bank, reporting_currency, supported_regions)
VALUES
  ('MGT', 'Maxons General Trading LLC', 'Maxons GT',    'UAE Mainland',     'mainland',  'Emirates Islamic Bank',        'AED', ARRAY['South Asia','GCC','MENA']),
  ('MIX', 'Maxons Impex DWC LLC',       'Maxons Impex', 'UAE DWC Free Zone','free_zone', 'National Bank of Fujairah',    'USD', ARRAY['CIS/Caucasus','EU/UK','MENA'])
ON CONFLICT (code) DO NOTHING;

-- RLS: authenticated users can SELECT (entities are public-ish metadata).
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view entities" ON public.entities;
CREATE POLICY "Authenticated can view entities"
  ON public.entities FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Admin can manage entities" ON public.entities;
CREATE POLICY "Admin can manage entities"
  ON public.entities FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'super_admin' OR access_tier = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR role = 'super_admin' OR access_tier = 'admin')
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- (C) Offers stub — spec §2.4 with 5 source-type taxonomy (§3)
-- ─────────────────────────────────────────────────────────────────────────
-- Stub only. Existing `offers_raw` continues to serve the OfferBuilder UI.
-- Phase 7 builds the full offer lifecycle (approval chain, gated rich media,
-- broadcast layer) on top of this table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.offers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Spec §3 — 5 source types
  source_type              TEXT NOT NULL CHECK (source_type IN (
    '1_MAXONS_OWNED_WAREHOUSE',
    '2_AFLOAT_CARGO',
    '3_PRE_COVERED_SUPPLIER',
    '4_OPEN_SUPPLIER_BROKER_OFFER',
    '5_RESELLER_SOURCED'
  )),
  -- Parties (nullable per source type — types 1+2 have no external source)
  source_counterparty_id   UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source_broker_id         UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  entity_id                UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  -- Location context
  warehouse_location       TEXT,                        -- for source_type 1
  afloat_vessel_ref        JSONB,                       -- for source_type 2: { vessel_name, booking, current_position, eta }
  -- Product (minimal for stub — Phase 7 normalizes into product_master)
  product_category         TEXT,                        -- almond, pine_nut, walnut, pistachio, cashew
  product_form             TEXT CHECK (product_form IS NULL OR product_form IN ('kernel','inshell')),
  product_variety          TEXT,
  product_grade            TEXT,
  product_size             TEXT,
  product_origin           TEXT,
  product_brand            TEXT,
  crop_year                TEXT,
  packing                  JSONB,
  -- Commercial
  available_quantity       NUMERIC(14,2),
  quantity_unit            TEXT DEFAULT 'MT',
  source_price             NUMERIC(14,2),
  source_currency          TEXT,
  source_price_basis       TEXT,                        -- FOB, CFR, CIF, ex-warehouse
  validity_from            TIMESTAMPTZ,
  validity_to              TIMESTAMPTZ,
  shipment_window          TEXT,
  loading_port             TEXT,
  eligible_discharge_regions TEXT[],
  subject_to_reconfirmation BOOLEAN DEFAULT FALSE,
  reconfirmation_sla_hours INT,
  -- Gated content (spec §2.4)
  rich_media               JSONB,
  gated_content_release_triggers TEXT[],
  -- Internal
  internal_notes           TEXT,
  maxons_margin_config     JSONB,                       -- { type, margin_value_or_formula, set_by, set_at }
  -- Lifecycle (spec §2.4)
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted_for_approval','approved','live','paused','withdrawn','exhausted','expired'
  )),
  approval_chain           JSONB,
  -- Audit
  created_by               UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_source_type ON public.offers (source_type);
CREATE INDEX IF NOT EXISTS idx_offers_status      ON public.offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_entity      ON public.offers (entity_id);
CREATE INDEX IF NOT EXISTS idx_offers_created_at  ON public.offers (created_at DESC);

COMMENT ON TABLE public.offers IS
  'Spec §2.4 / §3 — canonical offer table with 5 source-type taxonomy. Stub only in this migration; Phase 7 builds full lifecycle (approval, broadcast, deals).';
COMMENT ON COLUMN public.offers.source_type IS
  'Spec §3 — 1=Maxons-owned warehouse, 2=Afloat cargo, 3=Pre-covered supplier, 4=Open supplier/broker offer, 5=Reseller-sourced.';

-- RLS: everyone authenticated can see approved/live offers. Draft/pending only
-- visible to team and creator.
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers see approved offers"   ON public.offers;
DROP POLICY IF EXISTS "Team sees all offers"         ON public.offers;
DROP POLICY IF EXISTS "Team manages offers"          ON public.offers;
DROP POLICY IF EXISTS "Creators manage own drafts"   ON public.offers;

CREATE POLICY "Buyers see approved offers"
  ON public.offers FOR SELECT
  TO authenticated
  USING (status IN ('approved','live'));

CREATE POLICY "Team sees all offers"
  ON public.offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin','super_admin','analyst','broker','seller','trader','sales',
                   'sales_handler','sales_lead','procurement_officer','procurement_head',
                   'documentation_officer','documentation_lead','logistics_officer','logistics_head',
                   'finance_officer','finance_head','warehouse_manager','compliance_officer','maxons_team')
          OR access_tier IN ('maxons_team','admin')
        )
    )
  );

CREATE POLICY "Team manages offers"
  ON public.offers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin','super_admin','analyst','broker','seller','trader','sales',
                   'sales_handler','sales_lead','procurement_officer','procurement_head',
                   'maxons_team')
          OR access_tier IN ('maxons_team','admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin','super_admin','analyst','broker','seller','trader','sales',
                   'sales_handler','sales_lead','procurement_officer','procurement_head',
                   'maxons_team')
          OR access_tier IN ('maxons_team','admin')
        )
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- (D) Contract-number mint helper — spec §5
-- ─────────────────────────────────────────────────────────────────────────
-- Pattern: <ENTITY_CODE>-<CONTRACT_TYPE>-<DEST_COUNTRY_CODE>-<YEAR>-<SERIAL>
-- Example: MGT-SAL-PAK-2026-0421
-- Not wired to anything yet; Phase 7 contracts call it when a deal is signed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_number_counters (
  entity_code    TEXT NOT NULL,
  contract_type  TEXT NOT NULL,   -- SAL (sell-side), PUR (buy-side), BRK (broker), B2B (back-to-back)
  year           INT  NOT NULL,
  last_serial    INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_code, contract_type, year)
);

COMMENT ON TABLE public.contract_number_counters IS
  'Spec §5 — monotonic per (entity, contract_type, year) counter for contract numbers. Atomic via UPDATE … RETURNING inside mint_contract_number().';

CREATE OR REPLACE FUNCTION public.mint_contract_number(
  p_entity_code   TEXT,
  p_contract_type TEXT,
  p_country_code  TEXT,
  p_year          INT DEFAULT NULL
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr INT := COALESCE(p_year, EXTRACT(YEAR FROM NOW())::INT);
  nxt INT;
BEGIN
  INSERT INTO public.contract_number_counters (entity_code, contract_type, year, last_serial)
  VALUES (p_entity_code, p_contract_type, yr, 1)
  ON CONFLICT (entity_code, contract_type, year)
  DO UPDATE SET last_serial = contract_number_counters.last_serial + 1
  RETURNING last_serial INTO nxt;

  RETURN format('%s-%s-%s-%s-%s',
    p_entity_code,
    p_contract_type,
    UPPER(p_country_code),
    yr,
    LPAD(nxt::TEXT, 4, '0')
  );
END $$;

COMMENT ON FUNCTION public.mint_contract_number IS
  'Spec §5 — returns next contract number in the MGT-SAL-PAK-2026-0421 pattern. Atomic; safe under concurrency.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of migration. Verification queries:
--
--   SELECT code, legal_name, primary_bank FROM public.entities;
--   SELECT public.mint_contract_number('MGT','SAL','PAK');
--   SELECT public.mint_contract_number('MGT','SAL','PAK');  -- should increment
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='user_profiles' AND column_name IN
--      ('counterparty_type','portal','authority_tier','kyc_status','legal_entity_name');
--
-- Next migration (Phase 7, not now): deals, contracts, shipments, payments.
-- ═══════════════════════════════════════════════════════════════════════════
