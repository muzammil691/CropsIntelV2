// CropsIntelV2 — email-send edge function (Phase F1b)
//
// Unlocks the email leg of CRM Bulk Invite + V2 upgrade email to 65 users.
// Uses Resend (resend.com) as the SMTP provider — simplest path and has
// generous free tier. Swap provider trivially by changing the fetch URL
// and auth header.
//
// Deploy:   supabase functions deploy email-send
// Env:      RESEND_API_KEY (in Supabase function secrets)
// Optional: FROM_EMAIL (defaults to "CropsIntel <noreply@cropsintel.com>")
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
// Returns: { success: boolean, id?: string, error?: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'CropsIntel <noreply@cropsintel.com>';
const RESEND_URL     = 'https://api.resend.com/emails';

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

// ─── Send via Resend ────────────────────────────────────────────────
async function sendOne({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not set in function secrets' };
  }
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
      const out = await sendOne({ to: r, ...payload });
      results.push({ to: r, ...out });
    }
    const allOk = results.every(r => r.success);
    return j({ success: allOk, results, type, sent: results.filter(r => r.success).length, total: results.length });
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
