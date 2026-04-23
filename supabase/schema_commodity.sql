-- CropsIntelV2 — Commodity-Agnostic Schema Extension
-- Appends a product hierarchy to the existing schema so the platform can
-- support N commodities from day one (almonds → pistachios → pineapples).
--
-- Run this AFTER schema.sql. It's additive — doesn't alter existing tables.
-- Phase 7 (vision alignment). Non-destructive migration; existing abc_*
-- tables remain keyed off crop_year + text identifiers until Phase 8
-- migrates them to commodity_id / product_id.

-- ============================================================
-- Commodity registry (seeded from src/lib/commodity.js)
-- ============================================================
CREATE TABLE IF NOT EXISTS commodities (
  id TEXT PRIMARY KEY,                -- 'almond', 'pistachio', 'pineapple'
  label TEXT NOT NULL,
  plural_label TEXT NOT NULL,
  icon TEXT,
  live BOOLEAN DEFAULT FALSE,
  primary_source TEXT,
  crop_year_start_month INT,          -- 8 for almond (Aug), 9 pistachio, etc.
  scraper_module TEXT,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Product catalog — variety × size × form × origin per commodity
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity_id TEXT NOT NULL REFERENCES commodities(id),
  variety TEXT NOT NULL,              -- 'Nonpareil', 'Kerman', 'MD-2', etc.
  size TEXT,                          -- '23/25', 'Count 6', etc.
  form TEXT,                          -- 'Whole Natural', 'Shelled', 'Fresh Cut'
  origin TEXT,                        -- 'California', 'Türkiye', 'Costa Rica'
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commodity_id, variety, size, form, origin)
);

CREATE INDEX IF NOT EXISTS idx_products_commodity ON products(commodity_id);
CREATE INDEX IF NOT EXISTS idx_products_variety ON products(commodity_id, variety);

ALTER TABLE commodities ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Public read on commodities + products (static reference data)
DROP POLICY IF EXISTS "Public read commodities" ON commodities;
CREATE POLICY "Public read commodities" ON commodities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read products" ON products;
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);

-- Only admins write (enforced via service role on scraper / migrations)
DROP POLICY IF EXISTS "Admin write commodities" ON commodities;
CREATE POLICY "Admin write commodities" ON commodities FOR ALL
  USING (auth.jwt()->>'role' = 'service_role' OR auth.jwt()->>'user_role' = 'admin');
DROP POLICY IF EXISTS "Admin write products" ON products;
CREATE POLICY "Admin write products" ON products FOR ALL
  USING (auth.jwt()->>'role' = 'service_role' OR auth.jwt()->>'user_role' = 'admin');

-- ============================================================
-- Seed the registry with the 3 commodities currently known to the lib
-- ============================================================
INSERT INTO commodities (id, label, plural_label, icon, live, primary_source, crop_year_start_month, scraper_module)
VALUES
  ('almond',    'Almond',    'Almonds',    '🌰', TRUE,  'ABC (Almond Board of California)',            8, 'abc-scraper'),
  ('pistachio', 'Pistachio', 'Pistachios', '🥜', FALSE, 'American Pistachio Growers (APG) + USDA',     9, 'apg-scraper'),
  ('pineapple', 'Pineapple', 'Pineapples', '🍍', FALSE, 'USDA-FAS + Del Monte industry data',          1, 'usda-fas-scraper')
ON CONFLICT (id) DO NOTHING;

-- Seed almond variety grid (matches src/lib/commodity.js)
INSERT INTO products (commodity_id, variety, size, form, origin)
VALUES
  ('almond', 'Nonpareil',    '23/25', 'Whole Natural', 'California'),
  ('almond', 'Nonpareil',    '25/27', 'Whole Natural', 'California'),
  ('almond', 'Nonpareil',    '27/30', 'Whole Natural', 'California'),
  ('almond', 'Independence', '23/25', 'Whole Natural', 'California'),
  ('almond', 'Independence', '25/27', 'Whole Natural', 'California'),
  ('almond', 'Monterey',     '23/25', 'Whole Natural', 'California'),
  ('almond', 'Monterey',     '25/27', 'Whole Natural', 'California'),
  ('almond', 'Butte/Padre',  '23/25', 'Whole Natural', 'California'),
  ('almond', 'Butte/Padre',  '25/27', 'Whole Natural', 'California'),
  ('almond', 'Carmel',       '23/25', 'Whole Natural', 'California'),
  ('almond', 'Fritz',        '23/25', 'Whole Natural', 'California'),
  ('almond', 'Sonora',       '23/25', 'Whole Natural', 'California'),
  ('almond', 'Mission',      '23/25', 'Whole Natural', 'California')
ON CONFLICT DO NOTHING;

-- NOTE: phased migration to commodity_id on existing abc_* tables
-- will happen in Phase 8. For now, the abc_* tables are implicitly
-- commodity_id='almond' since that's the only live commodity. Joining
-- them through crop_year + report_date is sufficient until the
-- second commodity lands.
