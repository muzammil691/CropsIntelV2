// CropsIntelV2 — send-team-invite edge function
//
// Admin / team member POSTs a new invitation; this fn:
//   1. Validates caller has permission (admin or team tier).
//   2. INSERTs into team_invitations with a gen_random_uuid() token.
//   3. Delivers via email (calls the email-send edge fn) AND/OR WhatsApp
//      (Twilio approved template, funneled through whatsapp-send).
//   4. Writes delivery_email + delivery_whatsapp JSONB onto the invitation row.
//   5. Returns { success, invitation_id, accept_url, delivery } so the admin
//      UI can show a copy-paste fallback if both channels fail.
//
// POST body:
//   { full_name, email?, whatsapp_number?, role, access_tier,
//     company?, personal_note? }
//
// Response:
//   { success: boolean,
//     invitation_id: uuid,
//     accept_url: "https://cropsintel.com/accept-invite?t=<token>",
//     delivery: { email: {...}|null, whatsapp: {...}|null } }
//
// Deploy: supabase functions deploy send-team-invite --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SITE_ORIGIN   = Deno.env.get('SITE_ORIGIN') || 'https://cropsintel.com';

// APPROVED-TEMPLATE FUNNEL — 2026-04-25
// Only invite_buyer and invite_broker are Meta-approved right now.
// invite_supplier is pending; invite_team is submitted.
// Twilio's Content API will accept *any* ContentSid and return an MM... SID,
// but Meta silently drops messages whose templates aren't approved — so the
// recipient sees nothing.
// Until invite_supplier and invite_team are approved we funnel everything
// through invite_buyer (approved, single {{1}} = name variable). The email
// leg carries the real invite text + accept_url; WhatsApp only nudges the
// recipient to check their inbox.
// Original role→template mapping preserved in the commented block below so
// we can flip back once Meta approves the other templates.
const ROLE_TO_TEMPLATE_KEY: Record<string, string> = {
  // Everybody → invite_buyer while non-buyer templates sit in Meta review.
  buyer:       'invite_buyer',
  customer:    'invite_buyer',
  importer:    'invite_buyer',
  supplier:    'invite_buyer',
  handler:     'invite_buyer',
  grower:      'invite_buyer',
  packer:      'invite_buyer',
  processor:   'invite_buyer',
  broker:      'invite_buyer', // invite_broker is approved but has different {{N}} shape; keep unified
  trader:      'invite_buyer',
  admin:       'invite_buyer',
  analyst:     'invite_buyer',
  sales:       'invite_buyer',
  maxons_team: 'invite_buyer',
  seller:      'invite_buyer',
  // TODO(post-meta-approval): restore per-role funnel:
  //   supplier/handler/grower/packer/processor → invite_supplier
  //   admin/analyst/sales/maxons_team/seller   → invite_team
  //   broker/trader                             → invite_broker
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Capability check: the caller must be admin or team.
async function assertCallerIsTeam(supabaseAdmin: ReturnType<typeof createClient>, req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) throw new Error('Missing bearer token');

  // Validate the JWT and get the user id.
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    throw new Error('Invalid bearer token: ' + (userErr?.message || 'no user'));
  }
  const uid = userData.user.id;

  // Check their role/tier in user_profiles.
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('user_profiles')
    .select('role, access_tier, full_name, email')
    .eq('id', uid)
    .maybeSingle();

  if (profErr) throw new Error('Could not load profile: ' + profErr.message);
  if (!profile) throw new Error('No user_profile row — contact admin');

  const TEAM_ROLES = ['admin','analyst','broker','seller','trader','sales','maxons_team'];
  const isTeam = TEAM_ROLES.includes(profile.role)
              || ['admin','maxons_team'].includes(profile.access_tier);
  if (!isTeam) throw new Error('Only team members can send invitations');

  return { uid, profile };
}

// Phone normalization — match whatsapp-send's expectations (+<country>...)
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return null;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// Valid email sniff — good enough to avoid obvious typos.
function looksLikeEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

// ─── Email delivery ───────────────────────────────────────────────────
// Calls the existing email-send edge fn with a bespoke HTML body that
// includes the accept_url as the primary CTA.
async function deliverEmail({
  to, full_name, inviter_name, role, company, personal_note, accept_url,
}: {
  to: string;
  full_name: string;
  inviter_name: string;
  role: string;
  company?: string;
  personal_note?: string;
  accept_url: string;
}) {
  const noteBlock = personal_note
    ? `<p style="color:#a1a1aa;margin:12px 0 16px;padding:12px 16px;background:#18181b;border-left:3px solid #22c55e;border-radius:4px;font-style:italic;line-height:1.6">
         &ldquo;${escapeHtml(personal_note)}&rdquo;<br/>
         <span style="color:#52525b;font-size:11px">— ${escapeHtml(inviter_name)}</span>
       </p>`
    : '';
  const companyLine = company
    ? `<p style="color:#71717a;margin:8px 0 0;font-size:13px">For <strong>${escapeHtml(company)}</strong></p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#e5e5e5">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,#22c55e22,#10b98108);border:1px solid #22c55e44;border-radius:16px;padding:32px 24px">
      <p style="color:#22c55e;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 12px">Invitation · CropsIntel by MAXONS</p>
      <h1 style="color:#fff;margin:0 0 16px;font-size:22px">You're invited, ${escapeHtml(full_name)}</h1>
      <p style="color:#a1a1aa;margin:0 0 12px;line-height:1.6">
        ${escapeHtml(inviter_name)} has invited you to join the CropsIntel platform as a <strong style="color:#22c55e">${escapeHtml(role)}</strong>.
        ${companyLine}
      </p>
      ${noteBlock}
      <p style="color:#a1a1aa;margin:0 0 20px;line-height:1.6">
        Click below to accept the invitation, set up your password, and complete your profile (takes 2 minutes).
      </p>
      <a href="${accept_url}"
         style="display:inline-block;padding:12px 28px;background:#22c55e;color:#000;font-weight:600;text-decoration:none;border-radius:8px;font-size:15px">
        Accept invitation →
      </a>
      <p style="color:#71717a;margin:24px 0 0;font-size:12px;line-height:1.5">
        Link expires in 14 days. If the button doesn't work, copy this URL into your browser:<br/>
        <span style="color:#52525b;word-break:break-all">${accept_url}</span>
      </p>
    </div>
    <p style="color:#52525b;font-size:11px;margin:16px 0 0;text-align:center">
      Invited by ${escapeHtml(inviter_name)} · CropsIntel · cropsintel.com
    </p>
  </div>
</body></html>`;

  const text = `You're invited to CropsIntel by MAXONS.

${inviter_name} has invited you to join as a ${role}.${company ? `\nFor ${company}.` : ''}
${personal_note ? `\n"${personal_note}"\n— ${inviter_name}\n` : ''}
Accept your invitation + set up your profile:
${accept_url}

Link expires in 14 days.`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        type: 'custom',
        to,
        subject: `${inviter_name} invited you to CropsIntel`,
        html,
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: !!data?.success,
      mode: data?.mode || 'unknown',
      id: data?.results?.[0]?.id || null,
      error: data?.success ? null : (data?.error || data?.results?.[0]?.error || `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, mode: 'error', id: null, error: (err as Error).message || String(err) };
  }
}

// ─── WhatsApp delivery ────────────────────────────────────────────────
// Sends via whatsapp-send edge fn using type=template. The send fn will
// look up the approved ContentSid for the template_key and deliver via
// Twilio Content API. If the template isn't approved yet, the send fn
// falls back to freeform (which works inside the 24h window and silently
// drops outside — in which case the email leg carries the invitation).
async function deliverWhatsApp({
  to, full_name, inviter_name, role, accept_url,
}: {
  to: string;
  full_name: string;
  inviter_name: string;
  role: string;
  accept_url: string;
}) {
  const template_key = ROLE_TO_TEMPLATE_KEY[role] || 'invite_buyer';
  // invite_buyer is a single-variable approved template: {{1}} = name.
  // The real invite text + accept_url go via email. WhatsApp is a nudge.
  // Keep '2' populated in case we flip back to multi-var templates later —
  // extra variables on a single-var template are harmless (Twilio ignores them).
  const variables = { '1': full_name, '2': inviter_name };
  const fallback_body =
    `Hi ${full_name}, ${inviter_name} has invited you to CropsIntel by MAXONS.\n\n` +
    `Accept + set up your account: ${accept_url}\n\n` +
    `Link expires in 14 days. — CropsIntel`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        type: 'template',
        to,
        template_key,
        variables,
        fallback_body,
      }),
    });
    const data = await res.json().catch(() => ({}));
    // whatsapp-send returns { success, sid, mode, status, error } — the
    // field is `sid`, NOT `message_sid` (fixed 2026-04-25).
    return {
      ok: !!data?.success,
      template_key,
      mode: data?.mode || 'unknown',
      status: data?.status || null,
      message_sid: data?.sid || null,
      error: data?.success ? null : (data?.error || data?.message || `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, template_key, mode: 'error', status: null, message_sid: null, error: (err as Error).message || String(err) };
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]!);
}

// ─── HTTP handler ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST')   return j({ success: false, error: 'POST only' }, 405);

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Authenticate + authorize caller
    const { uid: inviterId, profile: inviterProfile } = await assertCallerIsTeam(supabaseAdmin, req);
    const inviter_name = inviterProfile.full_name || inviterProfile.email || 'MAXONS Team';

    // 2. Validate body
    const body = await req.json().catch(() => ({}));
    const {
      full_name,
      email: rawEmail,
      whatsapp_number: rawPhone,
      role = 'buyer',
      access_tier = 'registered',
      company,
      personal_note,
    } = body || {};

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return j({ success: false, error: 'full_name is required' }, 400);
    }

    const email = looksLikeEmail(rawEmail) ? String(rawEmail).trim().toLowerCase() : null;
    const whatsapp_number = normalizePhone(rawPhone);

    if (!email && !whatsapp_number) {
      return j({ success: false, error: 'Provide at least one of email or whatsapp_number' }, 400);
    }

    // 3. INSERT the invitation
    const { data: invRow, error: insErr } = await supabaseAdmin
      .from('team_invitations')
      .insert({
        full_name: full_name.trim(),
        email,
        whatsapp_number,
        role,
        access_tier,
        company: company?.trim() || null,
        personal_note: personal_note?.trim() || null,
        invited_by: inviterId,
        invited_by_name: inviter_name,
        status: 'pending',
      })
      .select('id, expires_at')
      .single();

    if (insErr) {
      return j({ success: false, error: 'Failed to create invitation: ' + insErr.message }, 500);
    }

    const accept_url = `${SITE_ORIGIN}/accept-invite?t=${invRow.id}`;

    // 4. Deliver (parallel — both channels at once)
    const [emailRes, waRes] = await Promise.all([
      email
        ? deliverEmail({
            to: email, full_name, inviter_name, role,
            company: company?.trim(), personal_note: personal_note?.trim(),
            accept_url,
          })
        : Promise.resolve(null),
      whatsapp_number
        ? deliverWhatsApp({
            to: whatsapp_number, full_name, inviter_name, role, accept_url,
          })
        : Promise.resolve(null),
    ]);

    // 5. Patch the invitation with delivery outcomes
    const anyOk = (emailRes?.ok ?? false) || (waRes?.ok ?? false);
    await supabaseAdmin
      .from('team_invitations')
      .update({
        status: anyOk ? 'sent' : 'pending',  // kept pending so user can retry
        delivery_email: emailRes,
        delivery_whatsapp: waRes,
      })
      .eq('id', invRow.id);

    return j({
      success: true,
      invitation_id: invRow.id,
      accept_url,
      expires_at: invRow.expires_at,
      delivery: {
        email: emailRes,
        whatsapp: waRes,
      },
      any_delivered: anyOk,
    });
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    // Auth / permission errors return 403 so the UI can show the exact reason
    const status = /bearer|permission|only team|no user_profile/i.test(msg) ? 403 : 500;
    return j({ success: false, error: msg }, status);
  }
});
