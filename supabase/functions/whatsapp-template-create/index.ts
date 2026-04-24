// CropsIntelV2 — WhatsApp Template Create (2026-04-25)
//
// Creates a new Twilio Content resource + submits it for WhatsApp approval,
// then upserts the result into the `whatsapp_templates` DB row. This is the
// mirror of `whatsapp-templates-sync` — where sync reads from Twilio into
// the DB, create writes from our DB (or AI operator) into Twilio.
//
// Use cases:
//   1. Admin clicks "Create in Twilio" next to an unlinked template row in
//      the Settings panel. The modal pre-fills body/vars from our seed row,
//      admin tweaks copy, we POST it here.
//   2. Autonomous runner / Zyra creates post-launch templates as product
//      features light up (offer_new when MAXONS trading activates, etc.).
//
// Twilio endpoints used:
//   POST https://content.twilio.com/v1/Content
//     → creates a new Content resource. Returns {sid, friendly_name, ...}.
//       Docs: https://www.twilio.com/docs/content-api/resources/content-create
//   POST https://content.twilio.com/v1/Content/{sid}/ApprovalRequests/whatsapp
//     → submits the Content for WhatsApp Business Platform approval.
//       Docs: https://www.twilio.com/docs/content-api/resources/approval-create
//
// Request body:
//   {
//     template_key: "account_action",        // required — matches DB row
//     friendly_name?: "account_action",      // default = template_key
//     category: "UTILITY"|"AUTHENTICATION"|"MARKETING",  // required
//     language?: "en",                        // default en
//     body: "Hi {{1}}, please {{2}} ...",    // required
//     variables?: {"1":"Alice","2":"verify your account"},  // sample values for approval
//     button?: {                              // optional call-to-action
//       type: "URL"|"PHONE_NUMBER"|"QUICK_REPLY",
//       text: "Open settings",
//       url?: "https://cropsintel.com/settings",
//       phone?: "+15551234567"
//     },
//     submit_for_approval?: true              // default true — skip if user wants
//                                             //   to tweak in Twilio Console first
//   }
//
// Response:
//   { success: true, twilio_sid, friendly_name, approval_status, db_row_updated }
//
// Failure modes returned explicitly:
//   - 400 "body is required"
//   - 409 "template_key already has a ContentSid — use sync to re-pull"
//   - 502 "Twilio rejected the create (<detail>)"
//   - 500 "DB upsert failed"

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')  || '';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TWILIO_BASE = 'https://content.twilio.com/v1';

console.log('[whatsapp-template-create] boot', {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Normalize Twilio's UPPERCASE category enum → our lowercase DB taxonomy.
function normalizeCategoryForDb(raw: string): string {
  const c = (raw || '').toUpperCase();
  if (c === 'AUTHENTICATION') return 'authentication';
  if (c === 'UTILITY')        return 'utility';
  if (c === 'MARKETING')      return 'marketing';
  return 'utility';
}

// Extract {{N}} positions from the body text so we can surface a
// variables-schema entry if the caller didn't pass sample values.
function extractPositionsFromBody(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out.sort((a, b) => Number(a) - Number(b));
}

// Build the `types` object for Twilio Content based on whether a button
// is attached. Keep this narrow — WhatsApp templates primarily use text
// or call-to-action; quick-reply and card are post-MVP.
function buildTypes(body: string, button?: { type?: string; text?: string; url?: string; phone?: string }): Record<string, unknown> {
  if (!button || !button.text) {
    return { 'twilio/text': { body } };
  }
  const actionType = (button.type || 'URL').toUpperCase();
  if (actionType === 'URL') {
    return {
      'twilio/call-to-action': {
        body,
        actions: [{ type: 'URL', title: button.text, url: button.url || '' }],
      },
    };
  }
  if (actionType === 'PHONE_NUMBER') {
    return {
      'twilio/call-to-action': {
        body,
        actions: [{ type: 'PHONE_NUMBER', title: button.text, phone: button.phone || '' }],
      },
    };
  }
  // QUICK_REPLY
  return {
    'twilio/quick-reply': {
      body,
      actions: [{ title: button.text, id: button.text.toLowerCase().replace(/\s+/g, '_') }],
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return json({ error: 'Twilio credentials not configured in Supabase secrets' }, 500);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json({ error: 'Supabase credentials not configured' }, 500);
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    template_key,
    friendly_name,
    category,
    language = 'en',
    body,
    variables = {},
    button,
    submit_for_approval = true,
  } = payload;

  // ─── Input validation ──────────────────────────────────────
  if (!template_key || typeof template_key !== 'string') {
    return json({ error: 'template_key is required' }, 400);
  }
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return json({ error: 'body is required' }, 400);
  }
  if (!category || !['UTILITY', 'AUTHENTICATION', 'MARKETING'].includes(category.toUpperCase())) {
    return json({ error: 'category must be UTILITY | AUTHENTICATION | MARKETING' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ─── Guard: don't clobber an already-linked row ────────────
  // If the DB row for this template_key already has a ContentSid, bail out
  // with 409 — the admin should go to Twilio Console to edit, then re-sync.
  // Creating a new Content with the same body would leave the DB pointing
  // at the OLD sid unless we updated it — too easy to get inconsistency.
  const { data: existing, error: existingErr } = await supabase
    .from('whatsapp_templates')
    .select('template_key, twilio_content_sid, twilio_friendly_name')
    .eq('template_key', template_key)
    .maybeSingle();

  if (existingErr) {
    return json({ error: `DB lookup failed: ${existingErr.message}` }, 500);
  }
  if (existing?.twilio_content_sid) {
    return json({
      error: `template_key "${template_key}" already has ContentSid ${existing.twilio_content_sid}. To re-create, delete the row or rename the key. To refresh metadata, use sync.`,
    }, 409);
  }

  // ─── Build sample variables from body if caller didn't supply ──
  const positions = extractPositionsFromBody(body);
  const varsForTwilio: Record<string, string> = {};
  for (const pos of positions) {
    varsForTwilio[pos] = String(variables[pos] ?? `sample_${pos}`);
  }

  const fName = (friendly_name || template_key).slice(0, 64); // Twilio caps at 64
  const types = buildTypes(body, button);

  // ─── POST to Twilio Content ────────────────────────────────
  let contentSid = '';
  try {
    const createRes = await fetch(`${TWILIO_BASE}/Content`, {
      method: 'POST',
      headers: {
        Authorization: twilioAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        friendly_name: fName,
        language,
        variables: varsForTwilio,
        types,
      }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return json({
        error: `Twilio Content create failed (HTTP ${createRes.status}): ${createData?.message || createData?.detail || JSON.stringify(createData)}`,
        twilio_error: createData,
      }, 502);
    }
    contentSid = createData.sid || '';
    if (!contentSid) {
      return json({ error: 'Twilio returned no sid', twilio_response: createData }, 502);
    }
  } catch (err) {
    return json({ error: `Twilio Content create threw: ${(err as Error).message}` }, 502);
  }

  // ─── POST approval request (optional) ──────────────────────
  let approvalStatus = 'unsubmitted';
  let approvalErr: string | null = null;
  if (submit_for_approval) {
    try {
      const apprRes = await fetch(`${TWILIO_BASE}/Content/${contentSid}/ApprovalRequests/whatsapp`, {
        method: 'POST',
        headers: {
          Authorization: twilioAuth(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fName,
          category: category.toUpperCase(),
        }),
      });
      const apprData = await apprRes.json().catch(() => ({}));
      if (!apprRes.ok) {
        // Content was created but approval submission failed — record anyway.
        approvalErr = `approval submit failed (HTTP ${apprRes.status}): ${apprData?.message || JSON.stringify(apprData)}`;
        console.warn('[create]', approvalErr);
      } else {
        approvalStatus = apprData?.status || apprData?.whatsapp?.status || 'received';
      }
    } catch (err) {
      approvalErr = `approval submit threw: ${(err as Error).message}`;
      console.warn('[create]', approvalErr);
    }
  }

  // ─── Upsert the DB row ─────────────────────────────────────
  // The row may exist (seed from migration) or not (AI-driven creation of
  // a brand-new key). Upsert handles both.
  const dbVariables = positions.map((pos) => ({
    name: pos,
    example: varsForTwilio[pos],
    description: `Variable ${pos}`,
  }));
  const dbApprovalStatus = (() => {
    const s = approvalStatus.toLowerCase();
    if (['approved', 'pending', 'rejected', 'paused', 'submitted'].includes(s)) return s;
    if (s === 'received') return 'submitted';
    if (s === 'unsubmitted') return 'pending';
    return 'pending';
  })();

  const row = {
    template_key,
    twilio_friendly_name: fName,
    twilio_content_sid: contentSid,
    category: normalizeCategoryForDb(category),
    variables: dbVariables,
    body_preview: body,
    button_text: button?.text || null,
    button_url: button?.url || null,
    language_code: language,
    approval_status: dbApprovalStatus,
    approved_at: dbApprovalStatus === 'approved' ? new Date().toISOString() : null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('whatsapp_templates')
    .upsert(row, { onConflict: 'template_key' });

  if (upsertErr) {
    // Content was created on Twilio's side but our DB failed to sync.
    // Return partial success so the caller can manually re-sync.
    return json({
      success: false,
      error: `Twilio Content created (${contentSid}) but DB upsert failed: ${upsertErr.message}. Run Sync from Twilio to reconcile.`,
      twilio_sid: contentSid,
      friendly_name: fName,
      approval_status: dbApprovalStatus,
      db_row_updated: false,
    }, 500);
  }

  return json({
    success: true,
    twilio_sid: contentSid,
    friendly_name: fName,
    approval_status: dbApprovalStatus,
    approval_submit_error: approvalErr,
    db_row_updated: true,
    note: submit_for_approval
      ? `Template submitted to Meta for approval. Watch the Status column in Settings → WhatsApp Templates; it flips to "approved" when Meta signs off (usually hours for utility/auth, days for marketing).`
      : `Template created in Twilio but NOT submitted for approval. Open Twilio Console → Content Template Builder → ${fName} → Submit for WhatsApp approval when ready.`,
  });
});
