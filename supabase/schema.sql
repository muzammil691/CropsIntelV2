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
-- ABC Forecasts (Subjective + Objective, annual)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_forecasts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_type TEXT NOT NULL,  -- 'subjective' (May) or 'objective' (July)
  forecast_year INT NOT NULL,
  crop_year TEXT NOT NULL,
  forecast_lbs BIGINT DEFAULT 0,
  report_month INT,            -- 5 for subjective, 7 for objective
  source_pdf TEXT,
  raw_text TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(forecast_type, forecast_year)
);

-- ============================================================
-- ABC Acreage Reports (USDA-NASS + Land IQ)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_acreage_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_year INT NOT NULL,
  source_type TEXT NOT NULL,  -- 'usda_nass' or 'land_iq'
  bearing_acres INT DEFAULT 0,
  non_bearing_acres INT DEFAULT 0,
  total_acres INT DEFAULT 0,
  county_data JSONB DEFAULT '{}',  -- per-county breakdown if available
  source_pdf TEXT,
  raw_text TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_year, source_type)
);

-- ============================================================
-- ABC Almond Almanac (annual year-end reports)
-- ============================================================
CREATE TABLE IF NOT EXISTS abc_almanac (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  almanac_year INT NOT NULL UNIQUE,
  crop_year TEXT NOT NULL,
  num_pages INT DEFAULT 0,
  source_pdf TEXT,
  summary_text TEXT,
  key_stats JSONB DEFAULT '{}',  -- extracted key statistics
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Strata Market Pricing (live + historical almond prices)
-- ============================================================
CREATE TABLE IF NOT EXISTS strata_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  price_date DATE NOT NULL,
  variety TEXT NOT NULL,        -- 'Nonpareil', 'Carmel', 'Butte/Padres', etc.
  grade TEXT,                   -- '23/25', '25/27', 'Extra #1', etc.
  form TEXT,                   -- 'Whole Natural', 'Blanched', 'Sliced', etc.
  price_usd_per_lb DECIMAL(10,4),
  maxons_price_per_lb DECIMAL(10,4),  -- price * 1.03 (3% margin)
  bid_price DECIMAL(10,4),
  ask_price DECIMAL(10,4),
  volume_lbs BIGINT,
  source TEXT DEFAULT 'strata',
  metadata JSONB DEFAULT '{}',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(price_date, variety, grade, form)
);

-- ============================================================
-- Industry News & Articles
-- ============================================================
CREATE TABLE IF NOT EXISTS industry_news (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,         -- 'abc_press', 'abc_industry', 'abc_byte', 'abc_podcast', 'external'
  source_url TEXT,
  published_date DATE,
  category TEXT,               -- 'trade', 'regulatory', 'crop', 'market', 'health', 'sustainability'
  summary TEXT,
  full_text TEXT,
  ai_market_impact TEXT,       -- AI-generated market impact analysis
  ai_sentiment TEXT,           -- 'bullish', 'bearish', 'neutral'
  tags TEXT[] DEFAULT '{}',
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_url)
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
CREATE INDEX IF NOT EXISTS idx_forecast_type ON abc_forecasts(forecast_type, forecast_year);
CREATE INDEX IF NOT EXISTS idx_acreage_year ON abc_acreage_reports(report_year);
CREATE INDEX IF NOT EXISTS idx_strata_date ON strata_prices(price_date, variety);
CREATE INDEX IF NOT EXISTS idx_news_source ON industry_news(source, published_date);
CREATE INDEX IF NOT EXISTS idx_news_category ON industry_news(category, published_date);

-- ============================================================
-- RLS Policies (enable for frontend, bypass with service_role)
-- ============================================================
ALTER TABLE abc_position_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_shipment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_crop_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_acreage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE abc_almanac ENABLE ROW LEVEL SECURITY;
ALTER TABLE strata_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_logs ENABLE ROW LEVEL SECURITY;

-- Public read for anon (dashboard data)
CREATE POLICY "Public read position reports" ON abc_position_reports FOR SELECT USING (true);
CREATE POLICY "Public read shipment reports" ON abc_shipment_reports FOR SELECT USING (true);
CREATE POLICY "Public read crop receipts" ON abc_crop_receipts FOR SELECT USING (true);
CREATE POLICY "Public read forecasts" ON abc_forecasts FOR SELECT USING (true);
CREATE POLICY "Public read acreage" ON abc_acreage_reports FOR SELECT USING (true);
CREATE POLICY "Public read almanac" ON abc_almanac FOR SELECT USING (true);
CREATE POLICY "Public read strata prices" ON strata_prices FOR SELECT USING (true);
CREATE POLICY "Public read news" ON industry_news FOR SELECT USING (true);
CREATE POLICY "Public read market data" ON market_data FOR SELECT USING (true);
CREATE POLICY "Public read analyses" ON ai_analyses FOR SELECT USING (true);

-- service_role bypasses RLS for insert/update from scrapers
-- No insert/update policy needed for anon — scrapers use service_role key
