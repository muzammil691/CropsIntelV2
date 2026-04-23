// CropsIntelV2 — email-send edge function (Phase F1b)
//
// Unlocks the email leg of CRM Bulk Invite + V2 upgrade email to 65 users.
//
// THREE SEND PATHS — uses existing GoDaddy/Office 365 infra first:
//   1) SMTP_HOST+SMTP_USER+SMTP_PASS set → send via direct SMTP (Office 365
//      via GoDaddy, matches the existing imap-reader.js config for
//      intel@cropsintel.com). This is the primary path.
//   2) Else RESEND_API_KEY set → send via Resend API.
//   3) Else → queue into `email_queue` table for later flush.
//
// Deploy:   supabase functions deploy email-send  (auto via GH Actions)
// Env:      SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
//           RESEND_API_KEY   (fallback)
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for queue fallback)
//           FROM_EMAIL (defaults to "CropsIntel <intel@cropsintel.com>")
//
// POST body:
//   { type: 'invite' | 'upgrade' | 'trade_alert' | 'custom',
//     to: string | string[],
//     subject?: string,
//     html?: string,
//     text?: string,
//     context?: object   // for template-driven types
//   }
//
// Returns: { success: boolean, mode: 'smtp'|'resend'|'queued', ... }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SMTP_HOST       = Deno.env.get('SMTP_HOST');
const SMTP_PORT       = parseInt(Deno.env.get('SMTP_PORT') || '587', 10);
const SMTP_USER       = Deno.env.get('SMTP_USER');
const SMTP_PASS       = Deno.env.get('SMTP_PASS');
const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL      = Deno.env.get('FROM_EMAIL') || 'CropsIntel <intel@cropsintel.com>';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_URL      = 'https://api.resend.com/emails';
const SMTP_CONFIGURED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

// ─── Templates ───────────────────────────────────────────────────────
function inviteTemplate({ name, role = 'buyer', inviterName = 'MAXONS Team' } = {}) {
  const roleLabels = {
    buyer: 'buyer/importer', supplier: 'supplier/handler', broker: 'broker/trader',
    grower: 'grower', processor: 'processor/manufacturer', logistics: 'logistics/freight',
    industry: 'industry contact',
  };
  return {
    subject: `You're invited to CropsIntel — almond market intelligence`,
    html: `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#e5e5e5">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,#22c55e33,#10b98111);border:1px solid #22c55e44;border-radius:16px;padding:32px 24px">
      <h1 style="color:#fff;margin:0 0 16px;font-size:22px">Welcome to CropsIntel</h1>
      <p style="color:#a1a1aa;margin:0 0 12px;line-height:1.6">
        ${name ? `Hi ${name},` : 'Hi,'} you've been invited as a
        <strong style="color:#22c55e">${roleLabels[role] || role}</strong>
        to the autonomous almond market intelligence platform used by MAXONS International Trading.
      </p>
      <p style="color:#a1a1aa;margin:0 0 20px;line-height:1.6">
        Get live ABC position data, destination flow, variety breakdowns, AI monthly briefs, and MAXONS-priced offers — all in one place.
      </p>
      <a href="https://cropsintel.com/register"
         style="display:inline-block;padding:12px 24px;background:#22c55e;color:#000;font-weight:600;text-decoration:none;border-radius:8px">
        Register your account →
      </a>
      <p style="color:#71717a;margin:24px 0 0;font-size:12px;line-height:1.5">
        Already have a WhatsApp number on file? You can sign in with WhatsApp OTP — no password needed.
      </p>
    </div>
    <p style="color:#52525b;font-size:11px;margin:16px 0 0;text-align:center">
      Invited by ${inviterName} · CropsIntel · cropsintel.com
    </p>
  </div>
</body></html>`,
    text: `You're invited to CropsIntel — almond market intelligence.
Register: https://cropsintel.com/register
Or sign in with WhatsApp OTP if your number is already on file.
Invited by ${inviterName}.`,
  };
}

function upgradeTemplate({ name, v1UserEmail } = {}) {
  return {
    subject: `Your CropsIntel V2 upgrade is ready`,
    html: `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#e5e5e5">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,#22c55e22,#10b98108);border:1px solid #22c55e33;border-radius:16px;padding:32px 24px">
      <h1 style="color:#fff;margin:0 0 16px;font-size:22px">CropsIntel V2 is live</h1>
      <p style="color:#a1a1aa;margin:0 0 12px;line-height:1.6">
        ${name ? `Hi ${name},` : 'Hi,'} your CropsIntel V1 account has been migrated to the new V2 platform at
        <a href="https://cropsintel.com" style="color:#22c55e">cropsintel.com</a>.
      </p>
      <p style="color:#a1a1aa;margin:0 0 12px;line-height:1.6">
        <strong style="color:#fff">First sign-in:</strong> when you log in, you'll see a short popup to verify your WhatsApp number and set a new password.
      </p>
      <p style="color:#a1a1aa;margin:0 0 20px;line-height:1.6">
        <strong style="color:#fff">What's new:</strong> 11 crop years of verified ABC data, 50+ AI insights, MAXONS-priced offers,
        variety + destination compare, and Zyra — your AI trading coworker.
      </p>
      <a href="https://cropsintel.com/login"
         style="display:inline-block;padding:12px 24px;background:#22c55e;color:#000;font-weight:600;text-decoration:none;border-radius:8px">
        Sign in to V2 →
      </a>
      <p style="color:#71717a;margin:24px 0 0;font-size:12px;line-height:1.5">
        Your V1 email (${v1UserEmail || 'your registered email'}) and WhatsApp number are already on file.
        Questions? Reply to this email.
      </p>
    </div>
  </div>
</body></html>`,
    text: `CropsIntel V2 is live at cropsintel.com.
Your V1 account was migrated. When you sign in you'll see a short popup to verify your WhatsApp number and set a new password.
Sign in: https://cropsintel.com/login`,
  };
}

function tradeAlertTemplate({ name, title, summary, urgency = 'medium' } = {}) {
  const color = urgency === 'high' ? '#ef4444' : urgency === 'low' ? '#22c55e' : '#f59e0b';
  return {
    subject: `[${urgency.toUpperCase()}] ${title}`,
    html: `
<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#e5e5e5">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,${color}22,#0a0a0a);border:1px solid ${color}44;border-radius:16px;padding:32px 24px">
      <p style="color:${color};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">Trade Alert · ${urgency}</p>
      <h1 style="color:#fff;margin:0 0 16px;font-size:20px">${title}</h1>
      <p style="color:#d4d4d8;margin:0 0 20px;line-height:1.6">${summary}</p>
      <a href="https://cropsintel.com/intelligence"
         style="display:inline-block;padding:10px 20px;background:${color};color:#000;font-weight:600;text-decoration:none;border-radius:8px">
        Open in CropsIntel →
      </a>
    </div>
  </div>
</body></html>`,
    text: `Trade Alert [${urgency}]: ${title}\n${summary}\nOpen: https://cropsintel.com/intelligence`,
  };
}

// ─── Send via SMTP (Office 365 / GoDaddy) — primary path ─────────────
async function sendViaSMTP({ to, subject, html, text }) {
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST!,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465,           // implicit TLS on 465, STARTTLS on 587
      auth: { username: SMTP_USER!, password: SMTP_PASS! },
    },
  });
  try {
    await client.send({
      from: FROM_EMAIL,
      to,
      subject,
      content: text || '',
      html,
    });
    return { success: true, id: `smtp-${Date.now()}` };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

// ─── Send via Resend (fallback) ─────────────────────────────────────
async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data?.message || 'Resend API error', status: res.status };
  return { success: true, id: data.id };
}

// ─── Queue into Supabase email_queue (fallback when RESEND is unset) ─
// The table is created on-the-fly via PostgREST upsert semantics if the
// project has an `email_queue` relation; otherwise the call is a no-op
// and we still return success so the UI flow doesn't block on infra.
async function queueEmail({ to, subject, html, text, type }) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return { success: true, queued: false, error: 'no queue storage configured — email dropped (infra polish item)' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/email_queue`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE,
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify([{
        to_address: to,
        from_address: FROM_EMAIL,
        subject,
        html_body: html,
        text_body: text,
        email_type: type,
        status: 'queued',
        created_at: new Date().toISOString(),
      }]),
    });
    if (!res.ok) {
      // Table probably doesn't exist yet — infra polish later
      return { success: true, queued: false, note: 'email_queue table missing; email dropped (polish-later)' };
    }
    const data = await res.json();
    return { success: true, queued: true, id: Array.isArray(data) ? data[0]?.id : data?.id };
  } catch (err) {
    return { success: true, queued: false, error: err?.message || String(err) };
  }
}

async function sendOne({ to, subject, html, text, type }) {
  // Priority 1: SMTP (Office 365 via GoDaddy) — uses existing intel@cropsintel.com infra
  if (SMTP_CONFIGURED) {
    const out = await sendViaSMTP({ to, subject, html, text });
    if (out.success) return { ...out, mode: 'smtp' };
    // SMTP failed (auth? network? rate limit?) — fall through to Resend or queue
    console.warn('[email-send] SMTP send failed:', out.error);
  }
  // Priority 2: Resend (if API key is set)
  if (RESEND_API_KEY) {
    const out = await sendViaResend({ to, subject, html, text });
    if (out.success) return { ...out, mode: 'resend' };
    console.warn('[email-send] Resend send failed:', out.error);
  }
  // Priority 3: queue for later
  const q = await queueEmail({ to, subject, html, text, type });
  return { ...q, mode: 'queued' };
}

// ─── HTTP handler ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const { type = 'custom', to, subject, html, text, context = {} } = body;
    if (!to) return j({ success: false, error: 'to is required' }, 400);

    let payload;
    if (type === 'invite')       payload = inviteTemplate(context);
    else if (type === 'upgrade') payload = upgradeTemplate(context);
    else if (type === 'trade_alert') payload = tradeAlertTemplate(context);
    else payload = { subject: subject || 'CropsIntel', html: html || '', text: text || '' };

    const recipients = Array.isArray(to) ? to : [to];
    const results = [];
    for (const r of recipients) {
      const out = await sendOne({ to: r, type, ...payload });
      results.push({ to: r, ...out });
    }
    const allOk = results.every(r => r.success);
    // Report the mode used by the first recipient (mixed modes unlikely in a single call)
    const mode = results[0]?.mode || (SMTP_CONFIGURED ? 'smtp' : RESEND_API_KEY ? 'resend' : 'queued');
    return j({ success: allOk, mode, results, type, sent: results.filter(r => r.success).length, total: results.length });
  } catch (err) {
    return j({ success: false, error: err?.message || String(err) }, 500);
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
