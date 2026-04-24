// CropsIntelV2 — WhatsApp Send Edge Function
// Sends WhatsApp messages via Twilio API
//
// 2026-04-24: Refactored to use Twilio Content API (ContentSid + ContentVariables)
//             with freeform fallback. Root cause of "OTP never arrives unless
//             user texts us first": outside Meta's 24-hour customer-service
//             window, Twilio only delivers pre-approved TEMPLATES. Freeform
//             `Body:` is silently dropped — Twilio returns 200 OK but WhatsApp
//             never delivers.
//
//             The new flow:
//               1. Caller passes either `type: 'template'` with template_key, OR
//                  a legacy type (otp / alert / offer / zyra_reply / custom)
//                  which we internally map to a template_key.
//               2. We look up whatsapp_templates.twilio_content_sid.
//               3. If ContentSid exists → send via Content API (ALWAYS delivers).
//               4. If ContentSid is NULL → freeform fallback (only delivers inside
//                  24h window), status tagged `sent_window_dependent` in the log.
//               5. Special case: OTP always tries Content API first; if no SID
//                  we still attempt freeform (historical behavior) but the log
//                  warns the admin that approval is pending.
//
// POST /whatsapp-send
// Body (new):
//   { type: 'template', to: '+X', template_key: 'otp_verification', variables: { code: '123456' } }
// Body (legacy, still supported):
//   { type: 'otp' | 'alert' | 'offer' | 'zyra_reply' | 'custom', to: '+X', ... }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')  || '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || '+12345622692';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')        || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

console.log('[whatsapp-send] boot', {
  hasTwilioSid: !!TWILIO_ACCOUNT_SID,
  hasTwilioToken: !!TWILIO_AUTH_TOKEN,
  twilioFrom: TWILIO_WHATSAPP_FROM,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_KEY,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Inlined template catalog (mirrors src/lib/whatsapp-templates.js) ─────
// Edge functions run on Deno and can't import from src/; this keeps the two
// in sync by convention. If you edit TEMPLATE_KEYS or fallback bodies, edit
// both files. Kept minimal here — just routing + fallback text.
const TEMPLATE_KEYS = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function twilioFrom(): string {
  return TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
}
function twilioTo(to: string): string {
  return to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
}

// Look up the DB row for a template_key.
async function getTemplate(supabase: SupabaseClient, template_key: string) {
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('template_key, twilio_content_sid, twilio_friendly_name, approval_status, category, body_preview, button_text, button_url, language_code, variables')
    .eq('template_key', template_key)
    .maybeSingle();
  if (error) {
    console.warn('[whatsapp-send] getTemplate error', { template_key, error: error.message });
    return null;
  }
  return data;
}

// Send via Twilio Content API (bypasses 24h window).
async function sendViaContentApi(to: string, contentSid: string, variables: Record<string, string> | null) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    From: twilioFrom(),
    To: twilioTo(to),
    ContentSid: contentSid,
  });
  if (variables && Object.keys(variables).length > 0) {
    params.append('ContentVariables', JSON.stringify(variables));
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (res.ok) return { success: true, sid: data.sid, mode: 'content_api' as const };
    console.error('[whatsapp-send] Content API error:', data);
    return { success: false, error: data.message || 'Twilio Content API error', mode: 'content_api' as const };
  } catch (err) {
    console.error('[whatsapp-send] Content API network error:', err);
    return { success: false, error: (err as Error).message, mode: 'content_api' as const };
  }
}

// Legacy freeform send — only reliably delivers inside the 24h window.
async function sendViaFreeform(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    From: twilioFrom(),
    To: twilioTo(to),
    Body: body,
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (res.ok) return { success: true, sid: data.sid, mode: 'freeform' as const };
    console.error('[whatsapp-send] freeform error:', data);
    return { success: false, error: data.message || 'Twilio freeform error', mode: 'freeform' as const };
  } catch (err) {
    console.error('[whatsapp-send] freeform network error:', err);
    return { success: false, error: (err as Error).message, mode: 'freeform' as const };
  }
}

// Call the DB helper to check the 24h freeform window.
async function insideFreeformWindow(supabase: SupabaseClient, phone: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('whatsapp_inbound_within_24h', { p_phone: phone });
    if (error) {
      console.warn('[whatsapp-send] 24h check error', error.message);
      return false;
    }
    return !!data;
  } catch (err) {
    console.warn('[whatsapp-send] 24h check threw', (err as Error).message);
    return false;
  }
}

// The core dispatcher: prefer Content API (template), fall back to freeform.
// Returns a normalized status string we store in whatsapp_messages.status.
async function dispatchTemplate(opts: {
  supabase: SupabaseClient;
  to: string;
  template_key: string;
  variables: Record<string, string>;
  fallbackBody: string; // freeform version if ContentSid is NULL
}): Promise<{ success: boolean; sid?: string; status: string; mode: string; error?: string; content_sid?: string | null }> {
  const { supabase, to, template_key, variables, fallbackBody } = opts;

  const tpl = await getTemplate(supabase, template_key);
  const sid = tpl?.twilio_content_sid || null;

  if (sid) {
    const r = await sendViaContentApi(to, sid, variables);
    return {
      success: r.success,
      sid: r.sid,
      status: r.success ? 'sent' : 'failed',
      mode: 'content_api',
      error: r.error,
      content_sid: sid,
    };
  }

  // No ContentSid — freeform fallback. This ONLY delivers if the user has
  // messaged us in the last 24h; we tag the log accordingly.
  const inWindow = await insideFreeformWindow(supabase, to);
  const r = await sendViaFreeform(to, fallbackBody);
  return {
    success: r.success,
    sid: r.sid,
    status: r.success ? (inWindow ? 'sent' : 'sent_window_dependent') : 'failed',
    mode: 'freeform',
    error: r.error,
    content_sid: null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { type, to, ...payload } = await req.json();

    if (!to || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanTo = to.startsWith('+') ? to : `+${to}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    switch (type) {
      // ─── Template (the new first-class path) ────────────────────────────
      case 'template': {
        const { template_key, variables = {}, fallback_body } = payload;
        if (!template_key) {
          return new Response(
            JSON.stringify({ error: 'template_key is required for type=template' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const tpl = await getTemplate(supabase, template_key);
        // Prefer caller-supplied fallback_body (they know the context); else
        // use the seeded body_preview as a best-effort freeform version.
        const fallbackBody = fallback_body || tpl?.body_preview || `CropsIntel: ${template_key}`;

        const result = await dispatchTemplate({
          supabase, to: cleanTo, template_key, variables, fallbackBody,
        });

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: template_key,
          body: tpl?.body_preview || fallbackBody,
          twilio_sid: result.sid || null,
          status: result.status,
          metadata: { template_key, mode: result.mode, content_sid: result.content_sid, variables },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid, mode: result.mode, status: result.status, error: result.error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── OTP Verification (launch blocker — always tries template path) ─
      case 'otp': {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Invalidate any prior unused OTPs for this phone so a user on their
        // second try can't accidentally validate with an old code.
        await supabase.from('whatsapp_otps').update({ verified: true })
          .eq('phone_number', cleanTo).eq('verified', false);

        await supabase.from('whatsapp_otps').upsert({
          phone_number: cleanTo,
          otp_code: otp,
          expires_at: expiresAt,
          verified: false,
          attempts: 0,
          created_at: new Date().toISOString(),
        }, { onConflict: 'phone_number' });

        const fallbackBody =
          `CropsIntel verification code: ${otp}\n\n` +
          `This code expires in 10 minutes. Do not share this code with anyone.\n\n— CropsIntel by MAXONS`;

        const result = await dispatchTemplate({
          supabase,
          to: cleanTo,
          template_key: TEMPLATE_KEYS.OTP_VERIFICATION,
          variables: { '1': otp },
          fallbackBody,
        });

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'otp',
          body: '[OTP sent]', // don't store actual code in log
          twilio_sid: result.sid || null,
          status: result.status,
          metadata: { mode: result.mode, content_sid: result.content_sid },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({
            success: result.success,
            error: result.error,
            mode: result.mode,
            status: result.status,
            // Hint for the frontend UX: if we fell back to freeform without
            // the 24h window, the delivery may silently drop. Login page can
            // surface this as "your code is on the way, if it doesn't arrive
            // message +X on WhatsApp".
            delivery_guaranteed: result.mode === 'content_api',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Trade Alert ────────────────────────────────────────────────────
      case 'alert': {
        const { title = '', summary = '', urgency = 'medium' } = payload;
        const icon = urgency === 'high' ? '🔴' : urgency === 'medium' ? '🟡' : '🟢';
        const fallbackBody =
          `${icon} CropsIntel alert (${urgency}):\n\n${title}\n\n${summary}\n\n` +
          `Full analysis: https://cropsintel.com/intelligence`;

        const result = await dispatchTemplate({
          supabase,
          to: cleanTo,
          template_key: TEMPLATE_KEYS.TRADE_ALERT,
          variables: { '1': title, '2': summary, '3': urgency },
          fallbackBody,
        });

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'trade_alert',
          body: fallbackBody,
          twilio_sid: result.sid || null,
          status: result.status,
          metadata: { title, urgency, mode: result.mode, content_sid: result.content_sid },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid, mode: result.mode, status: result.status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Offer Notification ────────────────────────────────────────────
      case 'offer': {
        const { offer_id, variety, grade, form, price, quantity, incoterm, validity } = payload;
        const product = `${variety || ''} ${grade || ''} ${form || ''}`.trim();
        const priceStr = price ? `$${price}/lb ${incoterm || ''}`.trim() : '';
        const fallbackBody =
          `New MAXONS offer:\n\n${product}\nPrice: ${priceStr}\nQuantity: ${quantity || '—'}\n` +
          `Valid until: ${validity || '—'}\n\nReply ACCEPT to confirm interest.\n` +
          `https://cropsintel.com/trading`;

        const result = await dispatchTemplate({
          supabase,
          to: cleanTo,
          template_key: TEMPLATE_KEYS.OFFER_NEW,
          variables: {
            '1': product || 'MAXONS offer',
            '2': priceStr || '—',
            '3': quantity || '—',
            '4': validity || '—',
          },
          fallbackBody,
        });

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'offer',
          body: fallbackBody,
          twilio_sid: result.sid || null,
          status: result.status,
          metadata: { offer_id, variety, grade, price, mode: result.mode, content_sid: result.content_sid },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid, mode: result.mode, status: result.status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Zyra AI Reply ─────────────────────────────────────────────────
      // This is a user-initiated conversation, so we're ALWAYS inside the
      // 24h window (by definition — they just sent a message). Freeform is
      // fine here; no template needed.
      case 'zyra_reply': {
        const { message, conversation_id } = payload;
        const r = await sendViaFreeform(cleanTo, message);
        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'zyra_reply',
          body: message,
          twilio_sid: r.sid || null,
          status: r.success ? 'sent' : 'failed',
          metadata: { conversation_id, mode: 'freeform' },
          created_at: new Date().toISOString(),
        });
        return new Response(
          JSON.stringify({ success: r.success, sid: r.sid, mode: 'freeform' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Custom Message (legacy) ────────────────────────────────────────
      // Custom sends used to be the default. We now only allow them when
      // we know we're inside the 24h window — outside, they silently drop.
      // Callers should migrate to `type: 'template'` with an appropriate key.
      case 'custom': {
        const { message, template_key: tk } = payload;
        // If caller passed a template_key alongside, upgrade to the template
        // path. Otherwise freeform (and let the 24h-check decide tagging).
        if (tk) {
          const result = await dispatchTemplate({
            supabase,
            to: cleanTo,
            template_key: tk,
            variables: payload.variables || {},
            fallbackBody: message,
          });
          await supabase.from('whatsapp_messages').insert({
            direction: 'outbound',
            phone_number: cleanTo,
            message_type: tk,
            body: message,
            twilio_sid: result.sid || null,
            status: result.status,
            metadata: { mode: result.mode, content_sid: result.content_sid, template_key: tk },
            created_at: new Date().toISOString(),
          });
          return new Response(
            JSON.stringify({ success: result.success, sid: result.sid, mode: result.mode, status: result.status }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const inWindow = await insideFreeformWindow(supabase, cleanTo);
        const r = await sendViaFreeform(cleanTo, message);
        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'custom',
          body: message,
          twilio_sid: r.sid || null,
          status: r.success ? (inWindow ? 'sent' : 'sent_window_dependent') : 'failed',
          metadata: { mode: 'freeform', in_window: inWindow },
          created_at: new Date().toISOString(),
        });
        return new Response(
          JSON.stringify({
            success: r.success,
            sid: r.sid,
            mode: 'freeform',
            in_window: inWindow,
            warning: inWindow ? undefined : 'Message sent but WhatsApp may drop it — recipient has not messaged us in the last 24h. Use type=template with a template_key for guaranteed delivery.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown message type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (err) {
    console.error('WhatsApp send error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
