// CropsIntelV2 — WhatsApp Templates Sync (2026-04-24)
//
// Reads YOUR Twilio account's Content API + WhatsApp ApprovalRequests and
// upserts each template into the `whatsapp_templates` table. Run this once
// after deployment (and whenever you add/update templates in Twilio Content
// Editor). No more guessing body text — the DB matches reality.
//
// Twilio endpoints used:
//   GET https://content.twilio.com/v1/Content?PageSize=100
//     → list all content resources (ContentSid, friendly_name, types[], variables, language)
//   GET https://content.twilio.com/v1/Content/{ContentSid}/ApprovalRequests
//     → per-template approval status + category for the whatsapp channel
//
// Upsert strategy:
//   1. Fetch all Content.
//   2. For each, pull approval status.
//   3. Match DB row by either template_key = friendly_name OR by
//      twilio_friendly_name = friendly_name (if admin already linked it).
//   4. UPSERT into whatsapp_templates — overwrites body_preview, category,
//      approval_status, twilio_content_sid, last_synced_at.
//   5. Returns a JSON report listing what was found/updated/new.
//
// POST /whatsapp-templates-sync
// Body (optional): { dry_run: true } to preview without writing
//
// Auth: requires SUPABASE_SERVICE_ROLE_KEY via Authorization bearer, OR is
// callable from inside an admin-only frontend route (RLS-level check in
// future — for now any authenticated caller with service key can sync).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')  || '';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TWILIO_BASE = 'https://content.twilio.com/v1';

console.log('[whatsapp-templates-sync] boot', {
  hasTwilioSid: !!TWILIO_ACCOUNT_SID,
  hasTwilioToken: !!TWILIO_AUTH_TOKEN,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_KEY,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function twilioAuth(): string {
  return 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
}

// Map Twilio's category (UPPERCASE) → our lowercase taxonomy.
function normalizeCategory(raw: string | undefined): string {
  const c = (raw || '').toUpperCase();
  if (c === 'AUTHENTICATION') return 'authentication';
  if (c === 'UTILITY')        return 'utility';
  if (c === 'MARKETING')      return 'marketing';
  // Twilio may return others (SERVICE, TRANSACTIONAL) — map to closest.
  return 'utility';
}

// Map Twilio approval status → our column constraint.
function normalizeApprovalStatus(raw: string | undefined): string {
  const s = (raw || '').toLowerCase();
  if (['approved','pending','rejected','paused','disabled','submitted'].includes(s)) return s;
  // Twilio sometimes uses "unsubmitted" / "received" — bucket them.
  if (s === 'unsubmitted') return 'pending';
  if (s === 'received')    return 'submitted';
  return 'pending';
}

// Pull the text body from a Content resource. Twilio supports many types
// (twilio/text, twilio/quick-reply, twilio/card, ...). We prefer the richest
// available body text the user sees on WhatsApp.
function extractBody(types: Record<string, any> | undefined): string {
  if (!types) return '';
  // Common WhatsApp-eligible types, in preference order.
  const priority = ['twilio/text', 'twilio/quick-reply', 'twilio/call-to-action', 'twilio/card', 'twilio/list-picker'];
  for (const t of priority) {
    if (types[t]?.body) return String(types[t].body);
    // `twilio/card` stores body in .body or .title+.subtitle
    if (types[t]?.title) return String(types[t].title) + (types[t].subtitle ? `\n${types[t].subtitle}` : '');
  }
  // Fallback: grab the first type with a `body`
  for (const k of Object.keys(types)) {
    if (types[k]?.body) return String(types[k].body);
  }
  return '';
}

// Pull button metadata (first actionable button, if any).
function extractButton(types: Record<string, any> | undefined): { text?: string; url?: string } {
  if (!types) return {};
  const cta = types['twilio/call-to-action'];
  if (cta?.actions?.[0]) {
    const a = cta.actions[0];
    return { text: a.title || undefined, url: a.url || undefined };
  }
  const qr = types['twilio/quick-reply'];
  if (qr?.actions?.[0]) {
    return { text: qr.actions[0].title || undefined };
  }
  return {};
}

// Pull the variable definitions — Twilio returns e.g. { "1": "{{name}}", "2": "{{inviter}}" }
function extractVariables(variables: Record<string, string> | undefined): Array<{ name: string; example: string; description: string }> {
  if (!variables) return [];
  return Object.entries(variables)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([pos, example]) => ({
      name: pos,
      example: String(example || ''),
      description: `Variable ${pos}`,
    }));
}

async function fetchAllContent(): Promise<any[]> {
  const all: any[] = [];
  let url = `${TWILIO_BASE}/Content?PageSize=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: twilioAuth() } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Twilio Content list failed (HTTP ${res.status}): ${txt}`);
    }
    const data = await res.json();
    if (Array.isArray(data.contents)) all.push(...data.contents);
    // Twilio pagination: meta.next_page_url
    url = data.meta?.next_page_url || '';
  }
  return all;
}

async function fetchApprovalStatus(contentSid: string): Promise<{ status: string; category: string; name: string; rejection_reason?: string } | null> {
  const url = `${TWILIO_BASE}/Content/${contentSid}/ApprovalRequests`;
  const res = await fetch(url, { headers: { Authorization: twilioAuth() } });
  if (!res.ok) {
    // 404 is normal for content that was never submitted for whatsapp approval
    if (res.status === 404) return null;
    const txt = await res.text();
    console.warn(`[sync] approval fetch failed for ${contentSid}: HTTP ${res.status} ${txt}`);
    return null;
  }
  const data = await res.json();
  // `whatsapp` key lives under `whatsapp` in the response body. Docs:
  // https://www.twilio.com/docs/content-api/resources/approval-fetch
  const wa = data?.whatsapp || data?.approval_requests?.whatsapp;
  if (!wa) return null;
  return {
    status: wa.status,
    category: wa.category,
    name: wa.name || data.name || '',
    rejection_reason: wa.rejection_reason,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'Twilio credentials not configured in Supabase secrets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let dryRun = false;
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    dryRun = !!body?.dry_run;
  } catch { /* ignore */ }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const contents = await fetchAllContent();
    const report: any = {
      twilio_total: contents.length,
      synced: [] as any[],
      skipped: [] as any[],
      errors: [] as any[],
      dry_run: dryRun,
    };

    for (const c of contents) {
      try {
        const friendly_name = c.friendly_name || '';
        const sid           = c.sid;
        const language_code = c.language || 'en';
        const body_preview  = extractBody(c.types);
        const button        = extractButton(c.types);
        const variables     = extractVariables(c.variables);

        const approval = await fetchApprovalStatus(sid);
        const approval_status = normalizeApprovalStatus(approval?.status);
        const category        = normalizeCategory(approval?.category);

        // Matching strategy:
        //   1. If a DB row has twilio_friendly_name = friendly_name → update it (keeps caller's chosen template_key).
        //   2. Else, use friendly_name AS the template_key directly (new row or overwrite stub).
        const { data: existingByFriendly } = await supabase
          .from('whatsapp_templates')
          .select('template_key')
          .eq('twilio_friendly_name', friendly_name)
          .maybeSingle();

        const template_key = existingByFriendly?.template_key || friendly_name;

        const row = {
          template_key,
          twilio_friendly_name: friendly_name,
          twilio_content_sid: sid,
          category,
          variables,
          body_preview,
          button_text: button.text || null,
          button_url:  button.url  || null,
          language_code,
          approval_status,
          approved_at: approval_status === 'approved' ? new Date().toISOString() : null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (dryRun) {
          report.synced.push({ action: 'would_upsert', template_key, friendly_name, sid, approval_status });
          continue;
        }

        const { error } = await supabase
          .from('whatsapp_templates')
          .upsert(row, { onConflict: 'template_key' });

        if (error) {
          report.errors.push({ friendly_name, sid, error: error.message });
        } else {
          report.synced.push({ template_key, friendly_name, sid, approval_status, category });
        }
      } catch (innerErr) {
        report.errors.push({ sid: c.sid, error: (innerErr as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, report }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[whatsapp-templates-sync] fatal:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
