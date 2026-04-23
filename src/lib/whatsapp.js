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

// ─── Send OTP via WhatsApp ────────────────────────────────────
export async function sendWhatsAppOTP(phoneNumber) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      type: 'otp',
      to: phoneNumber,
    }),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to send OTP');
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

// ─── Send Custom Message ──────────────────────────────────────
export async function sendWhatsAppMessage(phoneNumber, message) {
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
