-- CropsIntelV2 Database Schema
-- Autonomous almond market intelligence platform
-- Created: 2026-04-20

-- ============================================================
-- ABC Position Reports (monthly almond board data)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_position_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date DATE NOT NULL,
  report_year INT NOT NULL,
  report_month INT NOT NULL,
  crop_year TEXT NOT NULL,

  -- Carry-in
  carry_in_lbs BIGINT DEFAULT 0,

  -- Receipts
  receipts_lbs BIGINT DEFAULT 0,

  -- Commitments
  domestic_committed_lbs BIGINT DEFAULT 0,
  export_committed_lbs BIGINT DEFAULT 0,
  total_committed_lbs BIGINT DEFAULT 0,

  -- Shipments
  domestic_shipped_lbs BIGINT DEFAULT 0,
  export_shipped_lbs BIGINT DEFAULT 0,
  total_shipped_lbs BIGINT DEFAULT 0,

  -- New Commitments (sold during the month)
  domestic_new_commitments_lbs BIGINT DEFAULT 0,
  export_new_commitments_lbs BIGINT DEFAULT 0,
  total_new_commitments_lbs BIGINT DEFAULT 0,

  -- Uncommitted Inventory
  uncommitted_lbs BIGINT DEFAULT 0,

  -- Marketable supply
  total_supply_lbs BIGINT DEFAULT 0,

  -- Raw data from PDF (for audit trail)
  raw_data JSONB DEFAULT '{}',

  -- Metadata
  source_pdf TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_year, report_month)
);

-- ============================================================
-- ABC Shipment Reports (by destination country)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_shipment_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date DATE NOT NULL,
  report_year INT NOT NULL,
  report_month INT NOT NULL,
  crop_year TEXT NOT NULL,

  destination_region TEXT NOT NULL,  -- 'domestic', 'export'
  destination_country TEXT,          -- country name for export

  -- Monthly shipment
  monthly_lbs BIGINT DEFAULT 0,

  -- Season-to-date
  season_to_date_lbs BIGINT DEFAULT 0,

  -- Prior year comparisons
  prior_year_monthly_lbs BIGINT DEFAULT 0,
  prior_year_season_to_date_lbs BIGINT DEFAULT 0,

  raw_data JSONB DEFAULT '{}',
  source_pdf TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_year, report_month, destination_region, destination_country)
);

-- ============================================================
-- ABC Crop Receipts (by variety)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_crop_receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date DATE NOT NULL,
  report_year INT NOT NULL,
  report_month INT NOT NULL,
  crop_year TEXT NOT NULL,

  variety TEXT NOT NULL,  -- 'Nonpareil', 'Carmel', 'Butte/Padres', etc.

  receipts_lbs BIGINT DEFAULT 0,
  percent_of_total DECIMAL(5,2) DEFAULT 0,

  raw_data JSONB DEFAULT '{}',
  source_pdf TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_year, report_month, variety)
);

-- ============================================================
-- Market Data (pricing, futures, signals)
-- ============================================================
CREATE TABLE IF NOT EXISTS market_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_date DATE NOT NULL,
  data_type TEXT NOT NULL,  -- 'price', 'futures', 'fob', 'cif'

  source TEXT NOT NULL,     -- 'ice', 'usda', 'manual', 'scraped'
  variety TEXT,             -- almond variety if applicable
  grade TEXT,               -- grade/quality if applicable

  value_usd DECIMAL(10,2),
  value_per_lb DECIMAL(10,4),
  unit TEXT DEFAULT 'USD/lb',

  metadata JSONB DEFAULT '{}',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(data_date, data_type, source, variety, grade)
);

-- ============================================================
-- Scraping Logs (audit trail for autonomous operations)
-- ============================================================
CREATE TABLE IF NOT EXISTS scraping_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  scraper_name TEXT NOT NULL,   -- 'abc-position', 'abc-shipment', 'market-price'
  target_url TEXT,

  status TEXT NOT NULL DEFAULT 'started',  -- 'started', 'success', 'failed', 'skipped'

  records_found INT DEFAULT 0,
  records_inserted INT DEFAULT 0,
  records_updated INT DEFAULT 0,

  error_message TEXT,
  duration_ms INT,

  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- AI Analyses (generated insights and prescriptions)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_analyses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  analysis_type TEXT NOT NULL,  -- 'monthly_brief', 'trend_alert', 'trade_signal', 'anomaly'
  title TEXT NOT NULL,

  summary TEXT,
  full_analysis TEXT,

  data_context JSONB DEFAULT '{}',  -- what data was used
  confidence DECIMAL(3,2),           -- 0.00 to 1.00

  tags TEXT[] DEFAULT '{}',

  is_read BOOLEAN DEFAULT FALSE,
  is_actionable BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ============================================================
-- System Config (scraping schedules, API keys, settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Insert default system config
-- ============================================================
INSERT INTO system_config (key, value, description) VALUES
  ('scraping_schedule', '{"abc_position": "0 8 15 * *", "abc_shipment": "0 8 15 * *", "market_data": "0 6 * * 1-5"}', 'Cron schedules for autonomous scrapers'),
  ('abc_base_url', '"https://www.almondboard.com"', 'Almond Board of California base URL'),
  ('last_scrape_dates', '{}', 'Tracks when each scraper last ran'),
  ('auto_analysis_enabled', 'true', 'Whether to auto-generate AI analyses after new data'),
  ('notification_email', '"muzammil.akhtar@me.com"', 'Where to send autonomous alerts')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_position_date ON abc_position_reports(report_year, report_month);
CREATE INDEX IF NOT EXISTS idx_shipment_date ON abc_shipment_reports(report_year, report_month);
CREATE INDEX IF NOT EXISTS idx_shipment_country ON abc_shipment_reports(destination_country);
CREATE INDEX IF NOT EXISTS idx_receipts_variety ON abc_crop_receipts(variety);
CREATE INDEX IF NOT EXISTS idx_market_date ON market_data(data_date, data_type);
CREATE INDEX IF NOT EXISTS idx_scraping_status ON scraping_logs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_analysis_type ON ai_analyses(analysis_type, created_at);

-- ============================================================
-- RLS Policies (enable for frontend, bypass with service_role)
-- ============================================================
ALTER TABLE abc_position_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_shipment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_crop_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_logs ENABLE ROW LEVEL SECURITY;

-- Public read for anon (dashboard data)
CREATE POLICY "Public read position reports" ON abc_position_reports FOR SELECT USING (true);
CREATE POLICY "Public read shipment reports" ON abc_shipment_reports FOR SELECT USING (true);
CREATE POLICY "Public read crop receipts" ON abc_crop_receipts FOR SELECT USING (true);
CREATE POLICY "Public read market data" ON market_data FOR SELECT USING (true);
CREATE POLICY "Public read analyses" ON ai_analyses FOR SELECT USING (true);

-- service_role bypasses RLS for insert/update from scrapers
-- No insert/update policy needed for anon — scrapers use service_role key
