// CropsIntelV2 — WhatsApp Template Catalog
//
// Shared source of truth for Meta/Twilio WhatsApp templates. Mirrors the 12
// seeds in `supabase/migrations/20260424_whatsapp_templates.sql`.
//
// WHY THIS FILE EXISTS
// --------------------
// Twilio WhatsApp Business API obeys Meta's 24-hour customer-service window:
// if the user hasn't messaged us in the last 24h, freeform `Body:` sends are
// silently dropped (Twilio returns 200 OK, Meta never delivers). The fix is
// pre-approved templates sent via Twilio's Content API (`ContentSid` +
// `ContentVariables`). This catalog is what the UI, the invite flow, and the
// edge function all agree on — so the frontend can preview what will send,
// and the backend can look up the ContentSid + build the variables blob.
//
// LIFECYCLE
// ---------
//   1. A template is defined here AND seeded into `whatsapp_templates`.
//   2. Admin submits the body text to Twilio Content Editor (approval_status
//      moves pending → submitted).
//   3. Meta approves (usually 24–72h; authentication category is fast-tracked).
//   4. Admin sets twilio_content_sid in the DB (one-line SQL, no redeploy):
//        UPDATE whatsapp_templates
//        SET twilio_content_sid='HX...', approval_status='approved',
//            approved_at=NOW()
//        WHERE template_key='otp_verification';
//   5. Edge fn switches from freeform fallback to Content API automatically.
//
// TEMPLATE CATEGORIES (Meta's taxonomy)
// -------------------------------------
//   authentication — OTP/verification codes. Free, always deliverable,
//                    fast approval. MUST be submitted as this category.
//   utility        — transactional updates (welcome, invites, account
//                    actions). Cheap, requires a prior relationship.
//   marketing      — news / offers / alerts. Priced per message, requires
//                    user opt-in. Use STOP to unsubscribe.

// ─── Canonical template keys ───────────────────────────────────
// Must match the `template_key` PK values in the migration.
export const TEMPLATE_KEYS = {
  OTP_VERIFICATION: 'otp_verification',
  WELCOME_V2:       'welcome_v2',
  INVITE_BUYER:     'invite_buyer',
  INVITE_SUPPLIER:  'invite_supplier',
  INVITE_BROKER:    'invite_broker',
  INVITE_TEAM:      'invite_team',
  TRADE_ALERT:      'trade_alert',
  MARKET_BRIEF:     'market_brief',
  OFFER_NEW:        'offer_new',
  NEWS_UPDATE:      'news_update',
  ACCOUNT_ACTION:   'account_action',
  ZYRA_DIGEST:      'zyra_digest',
};

// ─── Per-key metadata ──────────────────────────────────────────
// `variables` uses positional placeholders {{1}}, {{2}}, ... to match Meta's
// template contract. The order in the array IS the positional order.
//
// `body_preview` is the canonical approved body (what the user will actually
// see). Keep in sync with the migration seed row.
//
// `fallback` is the freeform text used when the template isn't yet approved
// (ContentSid = NULL in DB). The edge fn uses this inside the 24h window
// or — in the case of OTP — always, because OTP delivery is the launch
// blocker and we'd rather send freeform than nothing.
export const TEMPLATE_CATALOG = {
  [TEMPLATE_KEYS.OTP_VERIFICATION]: {
    category: 'authentication',
    language: 'en',
    variables: ['code'],
    body_preview:
      'Your CropsIntel verification code is {{1}}. This code expires in 10 minutes. Do not share this code with anyone.',
    fallback: ({ code }) =>
      `CropsIntel verification code: ${code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.\n\n— CropsIntel by MAXONS`,
    description: 'OTP delivered on every login. Meta approves auth templates fast-track (minutes to hours).',
  },

  [TEMPLATE_KEYS.WELCOME_V2]: {
    category: 'utility',
    language: 'en',
    variables: ['first_name'],
    body_preview:
      'Hi {{1}}, welcome to CropsIntel V2 by MAXONS. Your almond market intelligence dashboard is ready — ABC position data, live pricing, and Zyra AI are live at cropsintel.com. Reply HELP anytime.',
    fallback: ({ first_name }) =>
      `Hi ${first_name || 'there'}, welcome to CropsIntel V2 by MAXONS.\n\nYour almond market intelligence dashboard is ready — ABC position data, live pricing, and Zyra AI are live at https://cropsintel.com\n\nReply HELP anytime.`,
    button: { text: 'Open dashboard', url: 'https://cropsintel.com' },
    description: 'Sent right after first WhatsApp OTP login succeeds.',
  },

  [TEMPLATE_KEYS.INVITE_BUYER]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'inviter'],
    body_preview:
      'Hi {{1}}, {{2}} has invited you to CropsIntel — MAXONS almond market intelligence. Get live ABC data, pricing, and Zyra AI. Register at cropsintel.com/register or reply YES and we will set you up.',
    fallback: ({ name, inviter }) =>
      `Hi ${name || 'there'}, ${inviter || 'MAXONS Team'} has invited you to CropsIntel — MAXONS almond market intelligence.\n\nGet live ABC data, pricing, and Zyra AI. Register at https://cropsintel.com/register or reply YES and we will set you up.`,
    button: { text: 'Register now', url: 'https://cropsintel.com/register' },
    description: 'For contact_type buyer / customer / importer.',
  },

  [TEMPLATE_KEYS.INVITE_SUPPLIER]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'inviter'],
    body_preview:
      'Hi {{1}}, {{2}} has invited you to CropsIntel as a supply partner. Track your shipments, get export-market demand signals, and connect with global buyers. Register at cropsintel.com/register.',
    fallback: ({ name, inviter }) =>
      `Hi ${name || 'there'}, ${inviter || 'MAXONS Team'} has invited you to CropsIntel as a supply partner.\n\nTrack your shipments, get export-market demand signals, and connect with global buyers. Register at https://cropsintel.com/register`,
    button: { text: 'Register now', url: 'https://cropsintel.com/register' },
    description: 'For contact_type supplier / handler / grower / packer / processor.',
  },

  [TEMPLATE_KEYS.INVITE_BROKER]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'inviter'],
    body_preview:
      'Hi {{1}}, {{2}} has invited you to CropsIntel as a trading partner. Access live MAXONS offers, destination flow, and position data. Register at cropsintel.com/register.',
    fallback: ({ name, inviter }) =>
      `Hi ${name || 'there'}, ${inviter || 'MAXONS Team'} has invited you to CropsIntel as a trading partner.\n\nAccess live MAXONS offers, destination flow, and position data. Register at https://cropsintel.com/register`,
    button: { text: 'Register now', url: 'https://cropsintel.com/register' },
    description: 'For contact_type broker / trader.',
  },

  [TEMPLATE_KEYS.INVITE_TEAM]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'inviter'],
    body_preview:
      'Hi {{1}}, {{2}} has added you to the MAXONS team on CropsIntel. You now have internal team access to margin, cost basis, and CRM. Log in at cropsintel.com.',
    fallback: ({ name, inviter }) =>
      `Hi ${name || 'there'}, ${inviter || 'The admin'} has added you to the MAXONS team on CropsIntel.\n\nYou now have internal team access to margin, cost basis, and CRM. Log in at https://cropsintel.com`,
    button: { text: 'Open CropsIntel', url: 'https://cropsintel.com' },
    description: 'For internal team roles — maxons_team / analyst / trader / sales / admin.',
  },

  [TEMPLATE_KEYS.TRADE_ALERT]: {
    category: 'marketing',
    language: 'en',
    variables: ['title', 'summary', 'urgency'],
    body_preview:
      'CropsIntel alert ({{3}}): {{1}}. {{2}}. Full analysis at cropsintel.com/intelligence.',
    fallback: ({ title, summary, urgency }) => {
      const icon = urgency === 'high' ? '🔴' : urgency === 'medium' ? '🟡' : '🟢';
      return `${icon} CropsIntel alert (${urgency || 'medium'}): ${title}\n\n${summary}\n\nFull analysis: https://cropsintel.com/intelligence`;
    },
    button: { text: 'View analysis', url: 'https://cropsintel.com/intelligence' },
    description: 'Zyra-generated trade signals. Marketing category — recipient opted-in only.',
  },

  [TEMPLATE_KEYS.MARKET_BRIEF]: {
    category: 'marketing',
    language: 'en',
    variables: ['date', 'summary'],
    body_preview:
      'MAXONS Market Brief {{1}}: {{2}}. Read the full brief at cropsintel.com/news.',
    fallback: ({ date, summary }) =>
      `MAXONS Market Brief ${date}:\n\n${summary}\n\nRead the full brief at https://cropsintel.com/news`,
    button: { text: 'Read brief', url: 'https://cropsintel.com/news' },
    description: 'Scheduled digest. Opt-out via STOP.',
  },

  [TEMPLATE_KEYS.OFFER_NEW]: {
    category: 'marketing',
    language: 'en',
    variables: ['product', 'price', 'quantity', 'validity'],
    body_preview:
      'New MAXONS offer: {{1}} at {{2}}. Quantity {{3}}, valid until {{4}}. Reply ACCEPT to confirm interest or view at cropsintel.com/trading.',
    fallback: ({ product, price, quantity, validity }) =>
      `New MAXONS offer:\n\n${product} at ${price}\nQuantity: ${quantity}\nValid until: ${validity}\n\nReply ACCEPT to confirm interest or view at https://cropsintel.com/trading`,
    button: { text: 'View offer', url: 'https://cropsintel.com/trading' },
    description: 'Sent only to CRM contacts with has_offers_subscription tag.',
  },

  [TEMPLATE_KEYS.NEWS_UPDATE]: {
    category: 'marketing',
    language: 'en',
    variables: ['headline', 'summary'],
    body_preview:
      'CropsIntel news: {{1}}. {{2}}. Read more at cropsintel.com/news.',
    fallback: ({ headline, summary }) =>
      `CropsIntel news: ${headline}\n\n${summary}\n\nRead more at https://cropsintel.com/news`,
    button: { text: 'Read news', url: 'https://cropsintel.com/news' },
    description: 'Scraper-driven. Throttled to once per day max per recipient.',
  },

  [TEMPLATE_KEYS.ACCOUNT_ACTION]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'action'],
    body_preview:
      'Hi {{1}}, please {{2}} at cropsintel.com/settings. Reply HELP if you need assistance.',
    fallback: ({ name, action }) =>
      `Hi ${name || 'there'}, please ${action || 'complete your profile'} at https://cropsintel.com/settings\n\nReply HELP if you need assistance.`,
    button: { text: 'Open settings', url: 'https://cropsintel.com/settings' },
    description: 'Generic nudge — profile-completion, verification, acceptance-needed flows.',
  },

  [TEMPLATE_KEYS.ZYRA_DIGEST]: {
    category: 'utility',
    language: 'en',
    variables: ['name', 'summary'],
    body_preview:
      'Hi {{1}}, Zyra daily digest: {{2}}. Open cropsintel.com/intelligence for the full brief.',
    fallback: ({ name, summary }) =>
      `Hi ${name || 'there'}, Zyra daily digest:\n\n${summary}\n\nOpen https://cropsintel.com/intelligence for the full brief.`,
    button: { text: 'Open Zyra', url: 'https://cropsintel.com/intelligence' },
    description: 'Internal-team utility brief. Daily opt-in.',
  },
};

// ─── Role → invite template map ────────────────────────────────
// Our CRM has two separate buckets:
//   1. crm_contacts.contact_type — buyer / supplier / broker / grower /
//      processor / logistics / industry (external contacts)
//   2. user_profiles.role — buyer / supplier / broker / admin / trader /
//      analyst / logistics / finance / maxons_team / sales / customer /
//      importer / handler / packer / grower / processor
// Both funnel into the four invite templates above.
// LAUNCH NOTE (2026-04-24):
// The user's Twilio Content Editor currently has one approved invite-style
// template: `registration_reminder` (mapped to our `invite_buyer` seed row).
// Per-role variants (invite_supplier / invite_broker / invite_team) are
// defined here and in the migration so the routing shape is ready, but
// until those templates exist on the Twilio side, every contact_type funnels
// through INVITE_BUYER so ALL cold-outreach invites use an approved template
// and deliver outside Meta's 24h window. When per-role templates land, flip
// the supplier/broker/team rows back to their own keys — no other code
// changes needed.
const CONTACT_TYPE_TEMPLATE = {
  buyer:     TEMPLATE_KEYS.INVITE_BUYER,
  customer:  TEMPLATE_KEYS.INVITE_BUYER,
  importer:  TEMPLATE_KEYS.INVITE_BUYER,
  // External suppliers → buyer template for now (only approved one).
  supplier:  TEMPLATE_KEYS.INVITE_BUYER,
  handler:   TEMPLATE_KEYS.INVITE_BUYER,
  grower:    TEMPLATE_KEYS.INVITE_BUYER,
  packer:    TEMPLATE_KEYS.INVITE_BUYER,
  processor: TEMPLATE_KEYS.INVITE_BUYER,
  // Brokers / traders → buyer template for now.
  broker:    TEMPLATE_KEYS.INVITE_BUYER,
  trader:    TEMPLATE_KEYS.INVITE_BUYER,
  // Internal team → buyer template too. V1→V2 migration invites use
  // the same "you recently visited CropsIntel" language across all cohorts
  // until per-role templates are approved.
  maxons_team: TEMPLATE_KEYS.INVITE_BUYER,
  analyst:     TEMPLATE_KEYS.INVITE_BUYER,
  sales:       TEMPLATE_KEYS.INVITE_BUYER,
  admin:       TEMPLATE_KEYS.INVITE_BUYER,
  // Ambiguous buckets.
  logistics: TEMPLATE_KEYS.INVITE_BUYER,
  industry:  TEMPLATE_KEYS.INVITE_BUYER,
  finance:   TEMPLATE_KEYS.INVITE_BUYER,
};

/**
 * Pick the right invite template based on a contact_type or user role string.
 * Falls back to INVITE_BUYER if the type is unknown (safest default — an
 * external buyer-worded invite is more conservative than accidentally
 * pitching someone as a supplier).
 */
export function pickInviteTemplate(contactTypeOrRole) {
  if (!contactTypeOrRole) return TEMPLATE_KEYS.INVITE_BUYER;
  const key = String(contactTypeOrRole).toLowerCase().trim();
  return CONTACT_TYPE_TEMPLATE[key] || TEMPLATE_KEYS.INVITE_BUYER;
}

/**
 * Build the positional `{"1":"...","2":"..."}` JSON object that Twilio's
 * Content API expects for `ContentVariables`. Reads the variable order from
 * the template catalog and the values from `ctx`.
 *
 * Example:
 *   buildTemplateVariables('invite_buyer', { name: 'Alice', inviter: 'MAXONS Team' })
 *   → { '1': 'Alice', '2': 'MAXONS Team' }
 */
export function buildTemplateVariables(templateKey, ctx = {}) {
  const meta = TEMPLATE_CATALOG[templateKey];
  if (!meta) throw new Error(`Unknown template key: ${templateKey}`);
  const out = {};
  meta.variables.forEach((varName, idx) => {
    const v = ctx[varName];
    // Twilio rejects empty strings in ContentVariables — coerce to a space so
    // the send doesn't 400. Callers should pass sensible defaults in `ctx`.
    out[String(idx + 1)] = (v == null || v === '') ? ' ' : String(v);
  });
  return out;
}

/**
 * Render the freeform fallback body for a template. Used inside the 24h
 * window and when the template hasn't been Meta-approved yet.
 */
export function renderFallback(templateKey, ctx = {}) {
  const meta = TEMPLATE_CATALOG[templateKey];
  if (!meta) throw new Error(`Unknown template key: ${templateKey}`);
  if (typeof meta.fallback !== 'function') {
    return meta.body_preview || '';
  }
  return meta.fallback(ctx);
}

// ─── Convenience: list all templates for admin UI ──────────────
export function listAllTemplates() {
  return Object.entries(TEMPLATE_CATALOG).map(([key, meta]) => ({
    template_key: key,
    ...meta,
  }));
}
