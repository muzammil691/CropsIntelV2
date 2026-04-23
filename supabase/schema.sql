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
-- Pipeline Runs (track each autonomous cycle execution)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_type TEXT NOT NULL DEFAULT 'autonomous_cycle',
  status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  trigger_source TEXT DEFAULT 'scheduled',  -- 'scheduled', 'manual', 'webhook'
  steps_completed JSONB DEFAULT '[]',
  summary TEXT,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- Email Subscriptions (autonomous email monitoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_address TEXT NOT NULL,         -- which app email to use
  service_name TEXT NOT NULL,          -- 'abc_alerts', 'bountiful', 'usda', etc.
  service_url TEXT,                    -- website the subscription is on
  subscription_type TEXT DEFAULT 'newsletter', -- 'newsletter', 'report', 'alert', 'price_update'
  frequency TEXT DEFAULT 'as_published',       -- 'daily', 'weekly', 'monthly', 'as_published'
  is_active BOOLEAN DEFAULT TRUE,
  last_received_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email_address, service_name)
);

-- ============================================================
-- Email Inbox (received emails for auto-processing)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_inbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_address TEXT NOT NULL,         -- which inbox received it
  from_address TEXT,
  from_name TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),

  -- Processing state
  is_processed BOOLEAN DEFAULT FALSE,
  processing_type TEXT,                -- 'report_pdf', 'price_update', 'news', 'crm_inquiry', 'logistics'
  extracted_data JSONB DEFAULT '{}',   -- structured data extracted by AI

  -- Attachments (stored as references)
  attachments JSONB DEFAULT '[]',      -- [{filename, size, content_type, storage_path}]

  -- Routing (CRM/BRM/SRM)
  routed_to TEXT,                      -- 'crm', 'brm', 'srm', 'intelligence', 'ignored'
  ai_summary TEXT,                     -- AI-generated summary
  ai_action_required BOOLEAN DEFAULT FALSE,
  ai_priority TEXT DEFAULT 'normal',   -- 'urgent', 'high', 'normal', 'low'

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CRM Contacts (buyers, suppliers, logistics partners)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_type TEXT NOT NULL,          -- 'buyer', 'supplier', 'logistics', 'broker', 'industry'
  company_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  region TEXT,                         -- 'middle_east', 'europe', 'asia', 'americas'

  -- Relationship intelligence
  relationship_score INT DEFAULT 50,   -- 0-100
  last_interaction_at TIMESTAMPTZ,
  total_interactions INT DEFAULT 0,
  total_volume_lbs BIGINT DEFAULT 0,   -- lifetime trade volume

  -- AI insights
  ai_notes TEXT,                       -- AI-generated relationship notes
  ai_next_action TEXT,                 -- suggested next engagement

  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CRM Deals / Offers (trade pipeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_deals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id BIGINT REFERENCES crm_contacts(id),
  deal_type TEXT NOT NULL DEFAULT 'sell',    -- 'sell' (to buyer), 'buy' (from supplier)
  stage TEXT NOT NULL DEFAULT 'inquiry',     -- 'inquiry', 'quoted', 'negotiation', 'agreed', 'contracted', 'shipped', 'completed', 'lost'

  -- Product details
  variety TEXT,                              -- 'Nonpareil', 'Carmel', etc.
  grade TEXT,                                -- '23/25', 'Extra #1', etc.
  form TEXT,                                 -- 'Whole Natural', 'Blanched', etc.
  volume_lbs BIGINT DEFAULT 0,
  volume_mt DECIMAL(10,2) DEFAULT 0,         -- metric tons

  -- Pricing
  strata_base_price DECIMAL(10,4),           -- Strata market price at time of offer
  maxons_price DECIMAL(10,4),                -- MAXONS offered price (base + margin)
  margin_pct DECIMAL(5,2) DEFAULT 3.00,      -- margin percentage
  total_value_usd DECIMAL(12,2) DEFAULT 0,

  -- Logistics
  incoterm TEXT,                             -- 'FOB', 'CIF', 'CFR', 'EXW'
  destination_country TEXT,
  destination_port TEXT,
  estimated_ship_date DATE,
  actual_ship_date DATE,

  -- Status
  confidence_pct INT DEFAULT 50,             -- 0-100 deal confidence
  priority TEXT DEFAULT 'normal',            -- 'urgent', 'high', 'normal', 'low'
  lost_reason TEXT,                          -- if stage = 'lost'

  -- AI
  ai_notes TEXT,                             -- AI-generated deal intelligence
  ai_risk_assessment TEXT,

  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CRM Activities (interaction log)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_activities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id BIGINT REFERENCES crm_contacts(id),
  deal_id BIGINT REFERENCES crm_deals(id),
  activity_type TEXT NOT NULL,               -- 'email', 'call', 'meeting', 'whatsapp', 'offer_sent', 'offer_received', 'note', 'stage_change'
  subject TEXT,
  description TEXT,
  outcome TEXT,                              -- 'positive', 'neutral', 'negative', 'follow_up'
  scheduled_at TIMESTAMPTZ,                  -- for future follow-ups
  completed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'system',          -- 'system', 'manual', user email
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- User Profiles (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  role TEXT DEFAULT 'buyer',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp_number TEXT DEFAULT '',
  whatsapp_verified BOOLEAN DEFAULT FALSE,
  trade_type TEXT DEFAULT '',
  annual_volume TEXT DEFAULT '',
  products_of_interest TEXT[] DEFAULT '{}',
  preferred_ports TEXT[] DEFAULT '{}',
  shipping_preferences JSONB DEFAULT '{}',
  warehouse_locations JSONB DEFAULT '[]',
  certifications TEXT[] DEFAULT '{}',
  payment_terms TEXT[] DEFAULT '{}',
  website TEXT DEFAULT '',
  social_links JSONB DEFAULT '{}',
  access_tier TEXT DEFAULT 'registered',
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  login_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  ('notification_email', '"muzammil.akhtar@me.com"', 'Where to send autonomous alerts'),
  ('ai_api_keys', '{"anthropic": null, "openai": null, "gemini": null, "elevenlabs": null}', '4 AI system API keys — set values here to enable live AI')
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
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline_runs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_email_inbox_processed ON email_inbox(is_processed, received_at);
CREATE INDEX IF NOT EXISTS idx_email_inbox_routing ON email_inbox(routed_to, ai_priority);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_type ON crm_contacts(contact_type, country);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_score ON crm_contacts(relationship_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role, access_tier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_company ON user_profiles(company);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON crm_deals(contact_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(deal_id, created_at);

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

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Public read pipeline runs" ON pipeline_runs FOR SELECT USING (true);
CREATE POLICY "Public read crm contacts" ON crm_contacts FOR SELECT USING (true);
CREATE POLICY "Public read crm deals" ON crm_deals FOR SELECT USING (true);
CREATE POLICY "Public read crm activities" ON crm_activities FOR SELECT USING (true);

-- User profiles: users can read/update their own profile, admins can read all
CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- service_role bypasses RLS for insert/update from scrapers
-- No insert/update policy needed for anon — scrapers use service_role key
-- email_inbox and email_subscriptions are NOT public — service_role only

-- ============================================================
-- INTEL SYSTEM — Market report ingestion + AI analysis
-- Added: 2026-04-21
-- ============================================================

CREATE TABLE IF NOT EXISTS intel_reports (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'handler',
  source_email TEXT,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'pdf',
  original_filename TEXT,
  original_url TEXT,
  report_date DATE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text TEXT,
  raw_data JSONB DEFAULT '{}',
  file_size_bytes INTEGER,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intel_insights (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES intel_reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_takeaways TEXT[] DEFAULT '{}',
  trading_implication TEXT,
  insight_type TEXT NOT NULL DEFAULT 'market_update',
  sentiment TEXT DEFAULT 'neutral',
  confidence REAL DEFAULT 0.7,
  urgency TEXT DEFAULT 'normal',
  commodities TEXT[] DEFAULT '{almonds}',
  regions TEXT[] DEFAULT '{}',
  varieties TEXT[] DEFAULT '{}',
  price_impact TEXT,
  is_published BOOLEAN DEFAULT true,
  is_read BOOLEAN DEFAULT false,
  is_actionable BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  ai_model TEXT DEFAULT 'claude',
  ai_prompt_tokens INTEGER,
  ai_completion_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  fact TEXT NOT NULL,
  context TEXT,
  source_report_ids BIGINT[] DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_confirmed INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  superseded_by BIGINT,
  confidence REAL DEFAULT 0.7,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_reports_status ON intel_reports(status);
CREATE INDEX IF NOT EXISTS idx_intel_reports_received ON intel_reports(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_insights_published ON intel_insights(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_insights_report ON intel_insights(report_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category, is_current);

ALTER TABLE intel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON intel_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON intel_insights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON knowledge_base FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anon read published insights" ON intel_insights FOR SELECT USING (is_published = true);
CREATE POLICY "Anon read knowledge" ON knowledge_base FOR SELECT USING (is_current = true);

-- ============================================================
-- WhatsApp OTP Verification
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_otps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_otps_phone ON whatsapp_otps(phone_number);

-- ============================================================
-- WhatsApp Message Log
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat',
  body TEXT DEFAULT '',
  twilio_sid TEXT,
  status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_type ON whatsapp_messages(message_type, direction);

-- RLS for WhatsApp tables
ALTER TABLE whatsapp_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON whatsapp_otps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Email Queue (Phase F1b workaround — queues outbound email when
-- Resend API key is not set, so CRM/V2-upgrade flows don't block
-- on infra. Flush manually or via cron once SMTP is live.)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_address TEXT NOT NULL,
  from_address TEXT NOT NULL DEFAULT 'CropsIntel <intel@cropsintel.com>',
  subject TEXT,
  html_body TEXT,
  text_body TEXT,
  email_type TEXT,
  status TEXT DEFAULT 'queued',  -- queued | sent | failed
  provider_id TEXT,
  last_error TEXT,
  attempts INT DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, created_at);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON email_queue FOR ALL USING (true) WITH CHECK (true);
