// CropsIntelV2 — WhatsApp Integration Client
// Frontend helper for WhatsApp OTP, messaging, and alerts

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Env-var guard — surface misconfig loudly instead of silently 400-ing on
// every WhatsApp call. Previously an empty VITE_SUPABASE_URL would produce
// a fetch to "/functions/v1/whatsapp-send" which hits the app's own origin
// and 404s with no useful error. Now we fail fast with a readable message.
function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'WhatsApp client not configured — VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from the build. ' +
      'Contact the administrator or check your .env.'
    );
  }
}

// Decode Supabase edge function failure modes into readable errors.
// Before: every failure surfaced as "Failed to fetch" (browser-generic) or
// a bare JSON parse error. This helper separates the cases:
//   - HTTP 503 BOOT_ERROR → "Server is starting up — please try again in 30s"
//   - HTTP 404 NOT_FOUND  → "Service temporarily unavailable (not deployed)"
//   - HTTP 4xx            → the function's own error message
//   - res.ok but !success → the function's own error message
async function readEdgeResponse(res, operation) {
  // Try JSON first; edge functions always return JSON even on errors.
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch {}

  if (res.status === 503 && data?.code === 'BOOT_ERROR') {
    throw new Error(
      `${operation}: Server failed to start. This usually means the edge function ` +
      `needs to be redeployed or a required secret is missing. Contact the administrator.`
    );
  }
  if (res.status === 404) {
    throw new Error(
      `${operation}: Service not available — edge function not deployed.`
    );
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `${operation} failed (HTTP ${res.status})`);
  }
  return data;
}

// ─── Send OTP via WhatsApp ────────────────────────────────────
export async function sendWhatsAppOTP(phoneNumber) {
  assertConfigured();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ type: 'otp', to: phoneNumber }),
    });
  } catch (networkErr) {
    throw new Error(
      'Could not reach the OTP service. Check your internet connection, or the ' +
      'edge function may be unreachable. (Original: ' + networkErr.message + ')'
    );
  }

  const data = await readEdgeResponse(res, 'Send OTP');
  if (!data?.success) throw new Error(data?.error || 'Failed to send OTP');
  return data;
}

// ─── Verify OTP ───────────────────────────────────────────────
export async function verifyWhatsAppOTP(phoneNumber, otpCode, userId = null) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      otp_code: otpCode,
      user_id: userId,
    }),
  });

  const data = await res.json();
  if (!data.verified) throw new Error(data.error || 'Verification failed');
  return data;
}

// ─── Send Trade Alert ─────────────────────────────────────────
export async function sendTradeAlert(phoneNumber, { title, summary, urgency = 'medium' }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      type: 'alert',
      to: phoneNumber,
      title,
      summary,
      urgency,
    }),
  });

  return res.json();
}

// ─── Send Offer Notification ──────────────────────────────────
export async function sendOfferNotification(phoneNumber, offer) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      type: 'offer',
      to: phoneNumber,
      ...offer, // offer_id, variety, grade, form, price, quantity, incoterm, validity
    }),
  });

  return res.json();
}

// ─── Send Custom Message (legacy freeform) ───────────────────
// NOTE: Outside Meta's 24-hour customer-service window (i.e. the recipient
// has not messaged us in the last 24h), WhatsApp SILENTLY DROPS freeform
// messages even though Twilio returns 200 OK. If you need guaranteed
// delivery, use sendWhatsAppTemplate() with an approved template key.
// This function will now pass along a `warning` in the response when we
// detect the recipient is outside the window.
export async function sendWhatsAppMessage(phoneNumber, message) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      type: 'custom',
      to: phoneNumber,
      message,
    }),
  });
  return res.json();
}

// ─── Send via Meta-approved Template (guaranteed delivery) ────
// Use this for OTP, invites, alerts, offers, news — anything that must
// reach a recipient who may not have messaged us in the last 24h.
//
// Args:
//   phoneNumber   — E.164 phone (+971501234567)
//   templateKey   — key from TEMPLATE_KEYS in src/lib/whatsapp-templates.js
//                   (e.g. 'invite_buyer', 'otp_verification', 'trade_alert')
//   variables     — context object matching the template's variable list
//                   (e.g. { name: 'Alice', inviter: 'MAXONS Team' })
//   fallbackBody  — optional freeform body if the template's ContentSid is
//                   not yet approved (falls back inside the 24h window only).
export async function sendWhatsAppTemplate(phoneNumber, templateKey, variables = {}, fallbackBody = null) {
  assertConfigured();
  // Lazy-load to avoid circular imports if other modules re-export from here.
  const { buildTemplateVariables, renderFallback } = await import('./whatsapp-templates.js');
  const positionalVars = buildTemplateVariables(templateKey, variables);
  const body = fallbackBody || renderFallback(templateKey, variables);

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        type: 'template',
        to: phoneNumber,
        template_key: templateKey,
        variables: positionalVars,
        fallback_body: body,
      }),
    });
  } catch (networkErr) {
    throw new Error(
      'Could not reach the WhatsApp send service. ' +
      `(Original: ${networkErr.message})`
    );
  }
  return readEdgeResponse(res, `Send template ${templateKey}`);
}

// ─── Sync WhatsApp templates from Twilio (admin only) ─────────
// Calls the `whatsapp-templates-sync` edge function which reads your actual
// Twilio account's Content API + ApprovalRequests and upserts each template
// into `whatsapp_templates` with the real body text, ContentSid, category,
// approval status. Run once after deployment and whenever you edit a
// template in Twilio Content Editor.
//
// Optional opts:
//   { dryRun: true } — preview the would-sync list without writing
//
// Returns the sync report object.
export async function syncWhatsAppTemplates(opts = {}) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-templates-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ dry_run: !!opts.dryRun }),
  });
  return readEdgeResponse(res, 'Sync WhatsApp templates');
}

// ─── WhatsApp OTP Login ──────────────────────────────────────
// Sends OTP, verifies, and returns a Supabase session
export async function whatsAppLogin(phoneNumber, otpCode) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      otp_code: otpCode,
    }),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Login failed');
  return data;
}

// ─── Format phone number for display ──────────────────────────
export function formatPhone(phone) {
  if (!phone) return '';
  // Remove non-digits except leading +
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length >= 12) {
    // International format: +X XXX XXX XXXX
    return clean.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d{4})/, '$1 $2 $3 $4');
  }
  return clean;
}

// ─── Validate phone number ───────────────────────────────────
export function isValidPhone(phone) {
  if (!phone) return false;
  const clean = phone.replace(/[^\d+]/g, '');
  // Must start with + and have 10-15 digits
  return /^\+\d{10,15}$/.test(clean);
}
