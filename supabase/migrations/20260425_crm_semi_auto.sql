-- CropsIntel V2 — Mini-Phase 4 · CRM semi-auto
-- 2026-04-25
--
-- Adds record_category (9-value enum) + counterparty-master carry-through
-- + upcoming_features note (for per-record banner) to crm_contacts, so the
-- CRM page can surface warm/cold splits + "what's next" per contact.
--
-- Rationale (from agent research 2026-04-25, docs/TRADE_HUB_SPEC_v1.md §2.2):
--   - contact_type (buyer/supplier/broker/logistics/industry) is WHAT they are.
--   - record_category (lead/account/opportunity/deal/referral/returning/internal)
--     is WHERE they are in the sales funnel — orthogonal.
--   - Sales team manually assigns category; offer-source link is optional.
--
-- Safe to re-run (IF NOT EXISTS everywhere).

BEGIN;

-- 1. record_category — 9-value flat enum (not a PG enum type — text + CHECK
--    is friendlier for future additions without a migration).
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS record_category text
    CHECK (record_category IS NULL OR record_category IN (
      'lead',          -- Unsolicited inquiry, KYC pending
      'account',       -- Established relationship, >1 prior deal OR assigned rep
      'opportunity',   -- Active deal in quoted/negotiation stage
      'deal',          -- Signed deal in progress (agreed/contracted/shipped)
      'supplier',      -- Pure supplier relationship, no active deal
      'broker',        -- Intermediary
      'referral',      -- Introduced via 3rd party
      'returning',     -- Re-engaged after >6mo gap
      'internal'       -- Maxons team (org visibility only)
    ));

-- 2. Offer-source link (nullable). Points to offers.source_type when the
--    CRM record was created from a broadcast offer.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS offer_source_type text
    CHECK (offer_source_type IS NULL OR offer_source_type IN (
      '1_MAXONS_OWNED_WAREHOUSE',
      '2_AFLOAT_CARGO',
      '3_PRE_COVERED_SUPPLIER',
      '4_OPEN_SUPPLIER_BROKER_OFFER',
      '5_RESELLER_SOURCED'
    ));

-- 3. Sales ownership — who's responsible for this contact.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS assigned_sales_rep uuid REFERENCES public.user_profiles(id)
    ON DELETE SET NULL;

-- 4. KYC gate (compliance tier).
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'pending'
    CHECK (kyc_status IN ('pending', 'in_review', 'approved', 'rejected', 'expired'));

-- 5. Credit limit (USD-normalized). Read-only display in V2; gates deal
--    creation in V3 per spec §2.2 authority tier 1-4.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS credit_limit_usd numeric;

-- 6. Next action — drives the "Upcoming" banner on the CRM card.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS next_action_date date;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS next_action_note text;

-- 7. Upcoming features note — free-text placeholder per user directive
--    ("always mention upcoming things and features"). Shows on every
--    card (A-option default) until admin picks a narrower scope.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS upcoming_features text;

-- Indexes for fast filter queries on the CRM page.
CREATE INDEX IF NOT EXISTS idx_crm_contacts_record_category
  ON public.crm_contacts (record_category) WHERE record_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_sales_rep
  ON public.crm_contacts (assigned_sales_rep) WHERE assigned_sales_rep IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_next_action_date
  ON public.crm_contacts (next_action_date) WHERE next_action_date IS NOT NULL;

-- Verify
SELECT 'crm_contacts cols post-migration' AS check_name,
       COUNT(*) FILTER (WHERE column_name = 'record_category') AS has_record_category,
       COUNT(*) FILTER (WHERE column_name = 'offer_source_type') AS has_offer_source,
       COUNT(*) FILTER (WHERE column_name = 'assigned_sales_rep') AS has_assigned_rep,
       COUNT(*) FILTER (WHERE column_name = 'kyc_status') AS has_kyc,
       COUNT(*) FILTER (WHERE column_name = 'next_action_date') AS has_next_action,
       COUNT(*) FILTER (WHERE column_name = 'upcoming_features') AS has_upcoming_features
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_contacts';

COMMIT;
