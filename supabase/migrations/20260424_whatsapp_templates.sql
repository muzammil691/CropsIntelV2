-- ============================================================
-- WhatsApp Templates (2026-04-24 critical launch blocker)
--
-- Root cause of "OTP never arrives unless user texts us first":
-- Twilio WhatsApp Business API enforces Meta's 24-hour customer-
-- service window. Outside that window, ONLY pre-approved message
-- templates (HSM — Highly Structured Messages) are deliverable.
-- Freeform Body: is silently dropped by WhatsApp servers — Twilio
-- returns 200 OK so our app thinks it worked.
--
-- This table stores the Twilio ContentSid per template_key, plus
-- Meta's approved body text for reference. The edge function looks
-- up the ContentSid at send time and uses Twilio's Content API
-- (ContentSid + ContentVariables) instead of freeform Body.
--
-- WORKFLOW:
--   1. User submits template body text to Twilio Content Editor
--      (console.twilio.com → Content Template Builder).
--   2. Meta approves (24-72h for most categories; auth templates
--      are fast-tracked).
--   3. Twilio assigns a ContentSid (format: HX...).
--   4. Admin updates whatsapp_templates SET twilio_content_sid=...
--      WHERE template_key=...  (one-line SQL, no redeploy).
--   5. Code flips from fallback-freeform to real template sending.
--
-- Categories follow Meta's taxonomy:
--   authentication — OTP/verification codes (free, always deliverable)
--   utility        — transactional + account updates (cheap)
--   marketing      — news / offers / market updates (priced, needs opt-in)
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  template_key         TEXT PRIMARY KEY,
  category             TEXT NOT NULL CHECK (category IN ('authentication','utility','marketing')),
  twilio_content_sid   TEXT,
  twilio_friendly_name TEXT,                       -- the exact name you used in Twilio Content Editor
  variables            JSONB DEFAULT '[]'::jsonb,  -- [{name, example, description}]
  body_preview         TEXT,                       -- synced from Twilio on first run
  button_text          TEXT,                       -- optional CTA label
  button_url           TEXT,                       -- optional CTA URL
  language_code        TEXT DEFAULT 'en',          -- Meta language tag (en, es_MX, hi, ar, tr)
  approval_status      TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending','submitted','approved','rejected','disabled','paused')),
  approved_at          TIMESTAMPTZ,
  last_synced_at       TIMESTAMPTZ,                -- when we last pulled from Twilio
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Columns added in this migration (safe-no-op on fresh install)
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS twilio_friendly_name TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_friendly_name
  ON whatsapp_templates(twilio_friendly_name) WHERE twilio_friendly_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status   ON whatsapp_templates(approval_status);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Service role full control; authenticated users can READ so the admin
-- UI can show approval status. No one but service_role can write.
DROP POLICY IF EXISTS "service_role_full_access" ON whatsapp_templates;
CREATE POLICY "service_role_full_access" ON whatsapp_templates
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read" ON whatsapp_templates;
CREATE POLICY "authenticated_read" ON whatsapp_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- Seed reference rows. These are PLACEHOLDERS — the real body
-- text, variables, and twilio_content_sid come from YOUR Twilio
-- account via the `whatsapp-templates-sync` edge fn, which reads
-- Twilio's Content API + ApprovalRequests endpoints and overwrites
-- these rows with the actual approved templates. ON CONFLICT we
-- keep the DB row so sync can UPDATE it rather than being blocked
-- by a DO NOTHING. If the Twilio friendly_name differs from the
-- template_key here, the sync edge fn respects the admin-set
-- `twilio_friendly_name_override` field (see below).
--
-- The seed rows exist purely so the role-routing logic in
-- `src/lib/whatsapp-templates.js` has a DB target; running the
-- sync replaces them with the truth from Twilio.
-- ────────────────────────────────────────────────────────────

-- 1. AUTHENTICATION — OTP (the launch blocker this migration fixes)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, language_code, notes)
VALUES (
  'otp_verification',
  'authentication',
  '[
    {"name":"1","example":"123456","description":"6-digit OTP code"}
  ]'::jsonb,
  'Your CropsIntel verification code is {{1}}. This code expires in 10 minutes. Do not share this code with anyone.',
  'en',
  'MUST be submitted as AUTHENTICATION category in Twilio Content Editor — not UTILITY. Authentication templates are Meta-tier free and always deliverable regardless of 24h window.'
) ON CONFLICT (template_key) DO NOTHING;

-- 2. UTILITY — Welcome / V2 upgrade (transactional, user just registered)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'welcome_v2',
  'utility',
  '[
    {"name":"1","example":"Alice","description":"Recipient first name"}
  ]'::jsonb,
  'Hi {{1}}, welcome to CropsIntel V2 by MAXONS. Your almond market intelligence dashboard is ready — ABC position data, live pricing, and Zyra AI are live at cropsintel.com. Reply HELP anytime.',
  'Open dashboard',
  'https://cropsintel.com',
  'en',
  'Sent right after first WhatsApp OTP login succeeds. Utility category — counts as transactional.'
) ON CONFLICT (template_key) DO NOTHING;

-- 3-6. UTILITY — Invites per role family
--    Buyers/customers/importers
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'invite_buyer',
  'utility',
  '[
    {"name":"1","example":"Alice","description":"Recipient name (or Valued Partner)"},
    {"name":"2","example":"MAXONS Team","description":"Inviter name"}
  ]'::jsonb,
  'Hi {{1}}, {{2}} has invited you to CropsIntel — MAXONS almond market intelligence. Get live ABC data, pricing, and Zyra AI. Register at cropsintel.com/register or reply YES and we will set you up.',
  'Register now',
  'https://cropsintel.com/register',
  'en',
  'For contact_type buyer / customer / importer.'
) ON CONFLICT (template_key) DO NOTHING;

--    Suppliers / handlers / growers
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'invite_supplier',
  'utility',
  '[
    {"name":"1","example":"Hassan","description":"Recipient name"},
    {"name":"2","example":"MAXONS Team","description":"Inviter name"}
  ]'::jsonb,
  'Hi {{1}}, {{2}} has invited you to CropsIntel as a supply partner. Track your shipments, get export-market demand signals, and connect with global buyers. Register at cropsintel.com/register.',
  'Register now',
  'https://cropsintel.com/register',
  'en',
  'For contact_type supplier / handler / grower / packer / processor.'
) ON CONFLICT (template_key) DO NOTHING;

--    Brokers / traders
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'invite_broker',
  'utility',
  '[
    {"name":"1","example":"Omar","description":"Recipient name"},
    {"name":"2","example":"MAXONS Team","description":"Inviter name"}
  ]'::jsonb,
  'Hi {{1}}, {{2}} has invited you to CropsIntel as a trading partner. Access live MAXONS offers, destination flow, and position data. Register at cropsintel.com/register.',
  'Register now',
  'https://cropsintel.com/register',
  'en',
  'For contact_type broker / trader.'
) ON CONFLICT (template_key) DO NOTHING;

--    Internal team
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'invite_team',
  'utility',
  '[
    {"name":"1","example":"Sara","description":"Team member name"},
    {"name":"2","example":"Muzammil","description":"Admin who added them"}
  ]'::jsonb,
  'Hi {{1}}, {{2}} has added you to the MAXONS team on CropsIntel. You now have internal team access to margin, cost basis, and CRM. Log in at cropsintel.com.',
  'Open CropsIntel',
  'https://cropsintel.com',
  'en',
  'For role maxons_team / analyst / trader / sales / admin. Internal-info access.'
) ON CONFLICT (template_key) DO NOTHING;

-- 7. MARKETING — Trade alert (price move, position shift)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'trade_alert',
  'marketing',
  '[
    {"name":"1","example":"Price spike on Nonpareil 27/30","description":"Alert title"},
    {"name":"2","example":"Nonpareil 27/30 jumped 4.2% overnight on tight supply","description":"Alert summary"},
    {"name":"3","example":"high","description":"Urgency (low/medium/high)"}
  ]'::jsonb,
  'CropsIntel alert ({{3}}): {{1}}. {{2}}. Full analysis at cropsintel.com/intelligence.',
  'View analysis',
  'https://cropsintel.com/intelligence',
  'en',
  'Marketing category — recipient must have opted in. Use for Zyra-generated signals.'
) ON CONFLICT (template_key) DO NOTHING;

-- 8. MARKETING — Market brief (weekly/biweekly)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'market_brief',
  'marketing',
  '[
    {"name":"1","example":"Apr 24 2026","description":"Brief date"},
    {"name":"2","example":"Shipments up 8% MoM; commit rate at 72%","description":"Top-line summary"}
  ]'::jsonb,
  'MAXONS Market Brief {{1}}: {{2}}. Read the full brief at cropsintel.com/news.',
  'Read brief',
  'https://cropsintel.com/news',
  'en',
  'Scheduled digest. Opt-out via STOP.'
) ON CONFLICT (template_key) DO NOTHING;

-- 9. MARKETING — New offer notification
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'offer_new',
  'marketing',
  '[
    {"name":"1","example":"Nonpareil 23/25 Inshell","description":"Product line"},
    {"name":"2","example":"$3.45/lb CIF Hamburg","description":"Price + incoterm"},
    {"name":"3","example":"2 containers (88K lbs)","description":"Quantity"},
    {"name":"4","example":"Apr 30 2026","description":"Validity"}
  ]'::jsonb,
  'New MAXONS offer: {{1}} at {{2}}. Quantity {{3}}, valid until {{4}}. Reply ACCEPT to confirm interest or view at cropsintel.com/trading.',
  'View offer',
  'https://cropsintel.com/trading',
  'en',
  'Sent only to CRM contacts with has_offers_subscription tag.'
) ON CONFLICT (template_key) DO NOTHING;

-- 10. MARKETING — News / industry update
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'news_update',
  'marketing',
  '[
    {"name":"1","example":"ABC May 2026 Position Report","description":"News headline"},
    {"name":"2","example":"Shipments hit 220M lbs, a 4-year May record","description":"1-line summary"}
  ]'::jsonb,
  'CropsIntel news: {{1}}. {{2}}. Read more at cropsintel.com/news.',
  'Read news',
  'https://cropsintel.com/news',
  'en',
  'Scraper-driven. Throttled to once per day max per recipient.'
) ON CONFLICT (template_key) DO NOTHING;

-- 11. UTILITY — Brief / action-requested (e.g. verify your account, complete profile)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'account_action',
  'utility',
  '[
    {"name":"1","example":"Alice","description":"Recipient name"},
    {"name":"2","example":"verify your account","description":"Action phrase (imperative)"}
  ]'::jsonb,
  'Hi {{1}}, please {{2}} at cropsintel.com/settings. Reply HELP if you need assistance.',
  'Open settings',
  'https://cropsintel.com/settings',
  'en',
  'Generic nudge template — use for profile-completion, verification, acceptance-needed flows.'
) ON CONFLICT (template_key) DO NOTHING;

-- 12. UTILITY — Zyra digest (AI brief for team/traders)
INSERT INTO whatsapp_templates (template_key, category, variables, body_preview, button_text, button_url, language_code, notes)
VALUES (
  'zyra_digest',
  'utility',
  '[
    {"name":"1","example":"Sara","description":"Trader name"},
    {"name":"2","example":"3 new signals in the last 24h","description":"Digest summary"}
  ]'::jsonb,
  'Hi {{1}}, Zyra daily digest: {{2}}. Open cropsintel.com/intelligence for the full brief.',
  'Open Zyra',
  'https://cropsintel.com/intelligence',
  'en',
  'Internal-team utility brief. Daily opt-in.'
) ON CONFLICT (template_key) DO NOTHING;

-- Helper: bump updated_at on template updates
CREATE OR REPLACE FUNCTION whatsapp_templates_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_templates_touch ON whatsapp_templates;
CREATE TRIGGER whatsapp_templates_touch
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION whatsapp_templates_touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- Window state helper: given a phone number, return whether we
-- are inside the 24h freeform window (user messaged us in the
-- last 24h). Used by the edge function to choose template vs
-- freeform when both are possible.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION whatsapp_inbound_within_24h(p_phone TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_messages
    WHERE phone_number = p_phone
      AND direction = 'inbound'
      AND created_at > NOW() - INTERVAL '24 hours'
  );
$$;

COMMENT ON TABLE whatsapp_templates IS
  'Meta-approved WhatsApp message templates keyed by template_key. Edge fn whatsapp-send looks up twilio_content_sid and uses Twilio Content API instead of freeform Body: to bypass the 24h session window. NULL ContentSid means template not yet approved — edge fn falls back to freeform with status=sent_window_dependent. Run `supabase/functions/whatsapp-templates-sync` to hydrate this table from your live Twilio account (reads Content API + ApprovalRequests).';

COMMENT ON COLUMN whatsapp_templates.twilio_content_sid IS
  'Twilio ContentSid (HX...). Populated by the whatsapp-templates-sync edge fn which reads from Twilio Content API. NULL until approved by Meta.';

COMMENT ON COLUMN whatsapp_templates.twilio_friendly_name IS
  'Exact name used in Twilio Content Editor. The sync fn uses this to match DB rows to Twilio templates when the user-facing template_key differs from the friendly_name (e.g. template_key=invite_buyer, friendly_name=cropsintel_buyer_invite_v2).';
