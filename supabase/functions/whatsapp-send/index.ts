// CropsIntelV2 — WhatsApp Send Edge Function
// Sends WhatsApp messages via Twilio API
// Supports: OTP, trade alerts, offer notifications, Zyra replies
//
// POST /whatsapp-send
// Body: { type: 'otp' | 'alert' | 'offer' | 'zyra_reply' | 'custom', to: '+1234567890', ... }

// 2026-04-23: Bumped std 0.168.0 → 0.224.0 and supabase-js 2.39.3 → 2.45.4.
// All 4 WhatsApp edge functions were 503 BOOT_ERRORing on the prod project.
// Older pinned esm.sh versions can stop resolving; matching the pins that
// email-send uses (known-deployable) plus a bump to a current stable.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || '+12345622692';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Boot-time diagnostic — logs to Supabase function logs on cold start so we
// can see at-a-glance which secret is missing when debugging. Does not block
// boot (missing secret returns a 500 with a clear message per-request).
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

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send WhatsApp message via Twilio API
async function sendWhatsApp(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  // Ensure WhatsApp prefix
  const fromNumber = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const params = new URLSearchParams({
    From: fromNumber,
    To: toNumber,
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

    if (res.ok) {
      return { success: true, sid: data.sid };
    } else {
      console.error('Twilio error:', data);
      return { success: false, error: data.message || 'Twilio API error' };
    }
  } catch (err) {
    console.error('Network error sending WhatsApp:', err);
    return { success: false, error: err.message };
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, to, ...payload } = await req.json();

    if (!to || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean phone number — ensure + prefix
    const cleanTo = to.startsWith('+') ? to : `+${to}`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let body = '';
    let result;

    switch (type) {
      // ─── OTP Verification ───────────────────────────
      case 'otp': {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

        // Store OTP in database
        await supabase.from('whatsapp_otps').upsert({
          phone_number: cleanTo,
          otp_code: otp,
          expires_at: expiresAt,
          verified: false,
          attempts: 0,
          created_at: new Date().toISOString(),
        }, { onConflict: 'phone_number' });

        body = `🌰 *CropsIntel Verification*\n\nYour verification code is: *${otp}*\n\nThis code expires in 10 minutes.\nDo not share this code with anyone.\n\n— CropsIntel by MAXONS`;

        result = await sendWhatsApp(cleanTo, body);

        // Log the send
        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'otp',
          body: '[OTP sent]', // Don't store actual OTP in message log
          twilio_sid: result.sid || null,
          status: result.success ? 'sent' : 'failed',
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, error: result.error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Trade Alert ────────────────────────────────
      case 'alert': {
        const { title, summary, urgency } = payload;
        const urgencyEmoji = urgency === 'high' ? '🔴' : urgency === 'medium' ? '🟡' : '🟢';

        body = `${urgencyEmoji} *CropsIntel Trade Alert*\n\n*${title}*\n\n${summary}\n\n📊 View full analysis: https://cropsintel.com/intelligence\n\n— Zyra AI, CropsIntel`;

        result = await sendWhatsApp(cleanTo, body);

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'trade_alert',
          body,
          twilio_sid: result.sid || null,
          status: result.success ? 'sent' : 'failed',
          metadata: { title, urgency },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Offer Notification ─────────────────────────
      case 'offer': {
        const { offer_id, variety, grade, form, price, quantity, incoterm, validity } = payload;

        body = `🌰 *New MAXONS Offer*\n\n` +
          `*${variety}* ${grade} ${form}\n` +
          `💰 Price: $${price}/lb ${incoterm}\n` +
          `📦 Quantity: ${quantity}\n` +
          `⏳ Valid until: ${validity}\n\n` +
          `Reply *ACCEPT* to confirm interest\nReply *DETAILS* for full specs\nReply *PASS* to decline\n\n` +
          `🔗 View in portal: https://cropsintel.com/trading\n\n— MAXONS International Trading`;

        result = await sendWhatsApp(cleanTo, body);

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'offer',
          body,
          twilio_sid: result.sid || null,
          status: result.success ? 'sent' : 'failed',
          metadata: { offer_id, variety, grade, price },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Zyra AI Reply ──────────────────────────────
      case 'zyra_reply': {
        const { message, conversation_id } = payload;
        body = message;

        result = await sendWhatsApp(cleanTo, body);

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'zyra_reply',
          body,
          twilio_sid: result.sid || null,
          status: result.success ? 'sent' : 'failed',
          metadata: { conversation_id },
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ─── Custom Message ─────────────────────────────
      case 'custom': {
        const { message } = payload;
        body = message;

        result = await sendWhatsApp(cleanTo, body);

        await supabase.from('whatsapp_messages').insert({
          direction: 'outbound',
          phone_number: cleanTo,
          message_type: 'custom',
          body,
          twilio_sid: result.sid || null,
          status: result.success ? 'sent' : 'failed',
          created_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({ success: result.success, sid: result.sid }),
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
