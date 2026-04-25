-- CropsIntel V2 — Data Uploads + Storage Bucket (Mini-Phase 6, V3 Preview)
-- 2026-04-25 · Backs the Data Hub preview at /v3-preview/data-hub.
--
-- User pain (verbatim, 2026-04-25): "i dont know where to upload report"
--
-- This migration creates:
--   1. data_uploads        — audit trail of every team upload (who, what, when, status)
--   2. data-uploads bucket — private Storage bucket for the actual files
--   3. RLS policies        — team can upload + read own; admin sees all
--
-- Non-destructive: all CREATE IF NOT EXISTS + idempotent inserts.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- (1) data_uploads audit table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS data_uploads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_email  TEXT,                     -- denormalized for audit even if user deleted
  source_type        TEXT NOT NULL
                       CHECK (source_type IN (
                         'abc_position_report',
                         'abc_shipment_report',
                         'abc_crop_receipts',
                         'abc_subjective_forecast',
                         'abc_objective_forecast',
                         'abc_almanac',
                         'manual_correction',
                         'supplier_offer_sheet',
                         'freight_rate_sheet',
                         'contract_document',
                         'other'
                       )),
  file_name          TEXT NOT NULL,
  file_size_bytes    BIGINT,
  mime_type          TEXT,
  storage_path       TEXT NOT NULL,            -- e.g. data-uploads/abc_position_report/2026-04-25-uuid-filename.pdf
  status             TEXT NOT NULL DEFAULT 'uploaded'
                       CHECK (status IN ('uploaded', 'processing', 'parsed', 'failed', 'archived')),
  parse_result       JSONB,                     -- rows added, errors, parser version
  notes              TEXT,                      -- user-provided context
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at       TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_data_uploads_uploader ON data_uploads (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_data_uploads_source_type ON data_uploads (source_type);
CREATE INDEX IF NOT EXISTS idx_data_uploads_status ON data_uploads (status);
CREATE INDEX IF NOT EXISTS idx_data_uploads_uploaded_at ON data_uploads (uploaded_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- (2) Storage bucket
-- ═══════════════════════════════════════════════════════════════════
-- Private bucket — only authenticated users with team role can read/write
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'data-uploads',
  'data-uploads',
  false,                                      -- private
  104857600,                                  -- 100 MB max
  ARRAY[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- (3) RLS policies
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE data_uploads ENABLE ROW LEVEL SECURITY;

-- Team members + admin can INSERT
DROP POLICY IF EXISTS data_uploads_insert_team ON data_uploads;
CREATE POLICY data_uploads_insert_team ON data_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND (
          up.role IN (
            'admin','super_admin','analyst','broker','seller','trader','sales','maxons_team',
            'procurement_head','procurement_officer','sales_lead','sales_handler',
            'documentation_lead','documentation_officer','logistics_head','logistics_officer',
            'warehouse_manager','finance_head','finance_officer','compliance_officer'
          )
          OR up.access_tier IN ('admin','maxons_team')
        )
    )
  );

-- Team members can SELECT their own uploads; admin sees all
DROP POLICY IF EXISTS data_uploads_select_own_or_admin ON data_uploads;
CREATE POLICY data_uploads_select_own_or_admin ON data_uploads
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND (up.role IN ('admin','super_admin') OR up.access_tier = 'admin')
    )
  );

-- Admin can UPDATE status (e.g. mark as parsed after backend run)
DROP POLICY IF EXISTS data_uploads_update_admin ON data_uploads;
CREATE POLICY data_uploads_update_admin ON data_uploads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND (up.role IN ('admin','super_admin') OR up.access_tier = 'admin')
    )
  );

-- Storage bucket policies
-- Team can upload to data-uploads/*
DROP POLICY IF EXISTS data_uploads_storage_insert ON storage.objects;
CREATE POLICY data_uploads_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'data-uploads'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND (
          up.role IN (
            'admin','super_admin','analyst','broker','seller','trader','sales','maxons_team',
            'procurement_head','procurement_officer','sales_lead','sales_handler',
            'documentation_lead','documentation_officer','logistics_head','logistics_officer',
            'warehouse_manager','finance_head','finance_officer','compliance_officer'
          )
          OR up.access_tier IN ('admin','maxons_team')
        )
    )
  );

-- Team can read their own uploads; admin reads all
DROP POLICY IF EXISTS data_uploads_storage_select ON storage.objects;
CREATE POLICY data_uploads_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'data-uploads'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.id = auth.uid()
          AND (up.role IN ('admin','super_admin') OR up.access_tier = 'admin')
      )
    )
  );

COMMIT;
