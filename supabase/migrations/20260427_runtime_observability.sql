-- CropsIntel V2 — Runtime observability tables (Phase 2 / W1)
-- 2026-04-27 · User directive: "make the autonomous tab actually work end-to-end"
--
-- These four tables are defined in supabase/schema.sql but no migration exists for
-- them. /autonomous and /admin/system rely on them at runtime — without these tables
-- the Supabase queries silently return empty arrays, so the page LOOKS fine but shows
-- nothing real. This migration creates them idempotently so the runtime works on any
-- environment (legacy + fresh).
--
-- Tables created (CREATE TABLE IF NOT EXISTS — safe to re-run):
--   1. scraping_logs   — per-scraper start/end audit trail (one row per scraper run)
--   2. ai_analyses     — generated insights (monthly briefs, trend alerts, signals)
--   3. pipeline_runs   — per-cycle summary (one row per autonomous orchestration run)
--   4. system_config   — singleton key→jsonb store (schedules, API key flags, last-scrape ETAs)
--
-- RLS posture:
--   - scraping_logs / pipeline_runs / ai_analyses: authenticated SELECT (so /autonomous
--     can read live status). Writes happen via service-role (scrapers + edge fns) and
--     bypass RLS automatically.
--   - system_config: admin / maxons_team SELECT only (may contain API key metadata).
--
-- Non-destructive: every CREATE / INSERT uses IF NOT EXISTS / ON CONFLICT.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- (1) scraping_logs — one row per scraper run (start + end)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scraping_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  scraper_name TEXT NOT NULL,   -- 'abc-position', 'strata', 'bountiful', 'news', 'imap', 'manual-trigger'
  target_url TEXT,

  status TEXT NOT NULL DEFAULT 'started',  -- 'started' | 'success' | 'failed' | 'skipped'

  records_found INT DEFAULT 0,
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,

  error_message TEXT,
  duration_ms INT,

  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraping_status ON scraping_logs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraping_name_started ON scraping_logs (scraper_name, started_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- (2) ai_analyses — generated insights (monthly_brief, trend_alert, trade_signal, anomaly)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_analyses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  analysis_type TEXT NOT NULL,    -- 'monthly_brief' | 'trend_alert' | 'trade_signal' | 'anomaly'
  title TEXT NOT NULL,

  summary TEXT,
  full_analysis TEXT,

  data_context JSONB DEFAULT '{}'::jsonb,   -- what data was used (year/month/source refs)
  confidence DECIMAL(3,2),                  -- 0.00 .. 1.00

  tags TEXT[] DEFAULT '{}',

  is_read BOOLEAN DEFAULT FALSE,
  is_actionable BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_type ON ai_analyses (analysis_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_actionable ON ai_analyses (is_actionable, created_at DESC) WHERE is_actionable = TRUE;

-- ═══════════════════════════════════════════════════════════════════
-- (3) pipeline_runs — one row per autonomous cycle execution
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_type TEXT NOT NULL DEFAULT 'autonomous_cycle',
  status TEXT NOT NULL DEFAULT 'running',     -- 'running' | 'completed' | 'failed'
  trigger_source TEXT DEFAULT 'scheduled',     -- 'scheduled' | 'manual' | 'webhook'
  steps_completed JSONB DEFAULT '[]'::jsonb,
  summary TEXT,
  errors JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_status_started ON pipeline_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_started ON pipeline_runs (started_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- (4) system_config — singleton key → jsonb store
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed defaults (ON CONFLICT DO NOTHING — never clobber existing rows)
INSERT INTO system_config (key, value, description) VALUES
  ('scraping_schedule',
    '{"abc_position": "0 8 15 * *", "abc_shipment": "0 8 15 * *", "market_data": "0 6 * * 1-5", "strata": "0 7 * * 1", "bountiful": "0 7 * * 1", "news": "0 6 * * *"}'::jsonb,
    'Cron schedules for autonomous scrapers (UTC)'),
  ('abc_base_url',
    '"https://www.almondboard.com"'::jsonb,
    'Almond Board of California base URL'),
  ('last_scrape_dates',
    '{}'::jsonb,
    'Tracks when each scraper last ran (updated by scrapers themselves)'),
  ('auto_analysis_enabled',
    'true'::jsonb,
    'Whether to auto-generate AI analyses after new data lands'),
  ('notification_email',
    '"muzammil.akhtar@me.com"'::jsonb,
    'Where to send autonomous alerts'),
  ('ai_api_keys',
    '{"anthropic": null, "openai": null, "gemini": null, "elevenlabs": null}'::jsonb,
    '4 AI system API key flags — set values here to flag UI that keys are configured'),
  ('next_scrape_eta',
    '{}'::jsonb,
    'Server-computed next-cycle ETA per scraper, surfaced in /autonomous'),
  ('last_full_cycle_at',
    'null'::jsonb,
    'Timestamp of most recent end-to-end pipeline cycle completion'),
  ('runner_version',
    '"v2-gh-actions"'::jsonb,
    'Identifies how the autonomous pipeline runs — currently GitHub Actions cron + manual workflow_dispatch')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- RLS — read for authenticated team; writes via service-role (bypasses RLS)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE scraping_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config   ENABLE ROW LEVEL SECURITY;

-- scraping_logs: any authenticated user can SELECT (the /autonomous page is admin-gated
-- at the route layer, but read should not require admin role at the DB layer so that
-- ops dashboards remain debuggable for the team).
DROP POLICY IF EXISTS scraping_logs_authenticated_select ON scraping_logs;
CREATE POLICY scraping_logs_authenticated_select ON scraping_logs
  FOR SELECT TO authenticated USING (TRUE);

-- ai_analyses: authenticated SELECT (insights surface in multiple pages).
DROP POLICY IF EXISTS ai_analyses_authenticated_select ON ai_analyses;
CREATE POLICY ai_analyses_authenticated_select ON ai_analyses
  FOR SELECT TO authenticated USING (TRUE);

-- pipeline_runs: authenticated SELECT.
DROP POLICY IF EXISTS pipeline_runs_authenticated_select ON pipeline_runs;
CREATE POLICY pipeline_runs_authenticated_select ON pipeline_runs
  FOR SELECT TO authenticated USING (TRUE);

-- system_config: admin / maxons_team SELECT only (values may include API key metadata).
DROP POLICY IF EXISTS system_config_team_select ON system_config;
CREATE POLICY system_config_team_select ON system_config
  FOR SELECT TO authenticated
  USING ( EXISTS (SELECT 1 FROM user_profiles
                  WHERE user_profiles.id = auth.uid()
                    AND ( user_profiles.role IN ('admin','super_admin')
                          OR user_profiles.access_tier IN ('admin','maxons_team') )) );

-- All write policies intentionally absent — only service-role (scrapers, edge fns) writes.
-- Service-role bypasses RLS automatically.

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- Verification (run separately after migration applies):
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public'
--      AND table_name IN ('scraping_logs','ai_analyses','pipeline_runs','system_config');
--   -- expect 4 rows
--   SELECT key FROM system_config ORDER BY key;
--   -- expect 9 keys (scraping_schedule, abc_base_url, last_scrape_dates,
--   --  auto_analysis_enabled, notification_email, ai_api_keys,
--   --  next_scrape_eta, last_full_cycle_at, runner_version)
-- ═══════════════════════════════════════════════════════════════════
