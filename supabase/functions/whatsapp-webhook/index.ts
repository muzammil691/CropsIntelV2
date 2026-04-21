// CropsIntelV2 — WhatsApp Webhook Edge Function
// Receives incoming WhatsApp messages from Twilio
// Routes to: OTP verification, Zyra AI chat, offer responses, registration
//
// POST /whatsapp-webhook (Twilio sends form-encoded data)
// Twilio expects TwiML XML response or empty 200

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || '+12345622692';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// ─── Helpers ──────────────────────────────────────────────────

function parseFormData(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  body.split('&').forEach(pair => {
    const [key, val] = pair.split('=').map(s => decodeURIComponent(s.replace(/\+/g, ' ')));
    params[key] = val;
  });
  return params;
}

function cleanPhone(phone: string): string {
  return phone.replace('whatsapp:', '').trim();
}

// Send WhatsApp reply via Twilio REST API (not TwiML, for async responses)
async function sendReply(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const fromNumber = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
    },
    body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: body }).toString(),
  });
}

// Ask Claude (Zyra) for a response
async function askZyra(message: string, history: Array<{role: string; content: string}>, marketCtx: string): Promise<string> {
  const systemPrompt = `You are Zyra, the AI trading intelligence assistant for CropsIntel by MAXONS International Trading (Dubai).

You specialize in California almond market analysis — pricing trends, supply/demand forecasting, trade opportunity identification, and global almond trade intelligence.

You are chatting via WhatsApp. Keep responses concise (under 300 words), use emoji sparingly for readability, and be conversational but data-driven. Format for WhatsApp (use *bold* and _italic_, no markdown headers).

${marketCtx ? `CURRENT MARKET DATA:\n${marketCtx}\n` : ''}

Key rules:
- Always cite data when making claims (ABC position data, Strata prices)
- MAXONS adds 3% margin to Strata market prices — never reveal margin to non-team contacts
- Crop year runs Aug-Jul (current: 2025/26)
- Be actionable: give specific buy/sell/hold guidance when asked
- If asked about registration: direct to https://cropsintel.net/register
- If asked about pricing: direct to https://cropsintel.net/pricing
- If user says ACCEPT/DETAILS/PASS regarding an offer, acknowledge and log it`;

  try {
    const messages = [
      ...history.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      console.error('Claude API error:', errData);
      return "I'm having a brief technical issue. Please try again in a moment, or visit https://cropsintel.net for full access to market intelligence.";
    }

    const data = await res.json();
    return data.content?.[0]?.text || "I couldn't process that. Try asking about almond prices, supply data, or trade opportunities.";
  } catch (err) {
    console.error('Zyra error:', err);
    return "I'm temporarily offline. Visit https://cropsintel.net for real-time market data.";
  }
}

// ─── Main Handler ─────────────────────────────────────────────

serve(async (req) => {
  // Twilio sends POST with form-encoded body
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const bodyText = await req.text();
    const params = parseFormData(bodyText);

    const from = cleanPhone(params.From || '');
    const incomingBody = (params.Body || '').trim();
    const messageSid = params.MessageSid || '';
    const numMedia = parseInt(params.NumMedia || '0');

    if (!from || !incomingBody) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Log incoming message
    await supabase.from('whatsapp_messages').insert({
      direction: 'inbound',
      phone_number: from,
      message_type: 'chat',
      body: incomingBody,
      twilio_sid: messageSid,
      status: 'received',
      metadata: { num_media: numMedia },
      created_at: new Date().toISOString(),
    });

    const lowerMsg = incomingBody.toLowerCase().trim();

    // ─── Check if this is an OTP response ─────────────
    if (/^\d{6}$/.test(lowerMsg)) {
      const { data: otpRecord } = await supabase
        .from('whatsapp_otps')
        .select('*')
        .eq('phone_number', from)
        .eq('verified', false)
        .single();

      if (otpRecord && new Date(otpRecord.expires_at) > new Date()) {
        if (otpRecord.otp_code === lowerMsg) {
          // Verify OTP
          await supabase.from('whatsapp_otps').update({ verified: true }).eq('phone_number', from);
          await supabase.from('user_profiles').update({
            whatsapp_verified: true,
            updated_at: new Date().toISOString(),
          }).eq('whatsapp_number', from);

          await sendReply(from,
            "✅ *WhatsApp Verified!*\n\n" +
            "Your number is now connected to CropsIntel. You'll receive:\n" +
            "• Trade alerts & market updates\n" +
            "• Offer notifications\n" +
            "• AI-powered market insights from Zyra\n\n" +
            "Send any message to chat with Zyra about almond markets.\n\n" +
            "— CropsIntel by MAXONS"
          );

          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { 'Content-Type': 'text/xml' },
          });
        } else {
          const remaining = 5 - (otpRecord.attempts + 1);
          await supabase.from('whatsapp_otps').update({ attempts: otpRecord.attempts + 1 }).eq('phone_number', from);
          await sendReply(from, `❌ Incorrect code. ${remaining} attempts remaining. Please try again.`);
          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      }
    }

    // ─── Check if this is an offer response ───────────
    if (['accept', 'details', 'pass'].includes(lowerMsg)) {
      // Find the most recent offer sent to this number
      const { data: lastOffer } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone_number', from)
        .eq('message_type', 'offer')
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastOffer?.metadata?.offer_id) {
        const offerId = lastOffer.metadata.offer_id;

        if (lowerMsg === 'accept') {
          await supabase.from('crm_deals').update({ stage: 'negotiation' }).eq('id', offerId);
          await sendReply(from,
            "🤝 *Interest Registered!*\n\n" +
            "Our trading team will contact you shortly with contract details.\n" +
            "You can also view the offer at: https://cropsintel.net/trading"
          );
        } else if (lowerMsg === 'details') {
          await sendReply(from,
            "📋 *Full Offer Details*\n\n" +
            "View the complete specifications, shipping terms, and payment options at:\n" +
            "https://cropsintel.net/trading\n\n" +
            "Or reply with any questions — Zyra is here to help."
          );
        } else if (lowerMsg === 'pass') {
          await supabase.from('crm_activities').insert({
            deal_id: offerId,
            activity_type: 'offer_declined',
            description: 'Customer declined via WhatsApp',
            created_at: new Date().toISOString(),
          });
          await sendReply(from,
            "👍 No problem. We'll keep you updated on future opportunities.\n" +
            "You'll still receive market alerts. Send STOP to unsubscribe."
          );
        }

        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
    }

    // ─── Registration via WhatsApp ────────────────────
    if (lowerMsg === 'register' || lowerMsg === 'signup' || lowerMsg === 'join') {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('whatsapp_number', from)
        .single();

      if (existing) {
        await sendReply(from,
          `👋 Welcome back${existing.full_name ? ', ' + existing.full_name : ''}!\n\n` +
          "You're already registered. Chat with Zyra anytime — just send your question.\n\n" +
          "🌐 Full platform: https://cropsintel.net"
        );
      } else {
        await sendReply(from,
          "🌰 *Welcome to CropsIntel!*\n\n" +
          "To create your account, visit:\n" +
          "https://cropsintel.net/register\n\n" +
          "Your WhatsApp number will be automatically linked.\n\n" +
          "Meanwhile, you can chat with Zyra right here! Try asking:\n" +
          "• _What are current almond prices?_\n" +
          "• _How's the 2025/26 supply position?_\n" +
          "• _Which markets are growing fastest?_"
        );
      }

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ─── STOP / Unsubscribe ───────────────────────────
    if (lowerMsg === 'stop' || lowerMsg === 'unsubscribe') {
      await supabase
        .from('user_profiles')
        .update({ metadata: { whatsapp_alerts: false } })
        .eq('whatsapp_number', from);

      await sendReply(from,
        "You've been unsubscribed from WhatsApp alerts.\n" +
        "Send START to re-subscribe anytime.\n\n— CropsIntel"
      );

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    if (lowerMsg === 'start') {
      await supabase
        .from('user_profiles')
        .update({ metadata: { whatsapp_alerts: true } })
        .eq('whatsapp_number', from);

      await sendReply(from,
        "✅ You're re-subscribed to WhatsApp alerts!\n" +
        "You'll receive trade alerts, market updates, and offer notifications.\n\n— CropsIntel"
      );

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ─── Zyra AI Chat (default) ───────────────────────
    // Load conversation history for this phone number
    const { data: recentMessages } = await supabase
      .from('whatsapp_messages')
      .select('direction, body, message_type')
      .eq('phone_number', from)
      .in('message_type', ['chat', 'zyra_reply'])
      .order('created_at', { ascending: false })
      .limit(10);

    const history = (recentMessages || [])
      .reverse()
      .map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.body,
      }));

    // Load market context for Zyra
    let marketCtx = '';
    try {
      const { data: reports } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false })
        .limit(1);

      if (reports?.[0]) {
        const r = reports[0];
        const soldPct = r.total_supply_lbs > 0
          ? (((r.total_supply_lbs - (r.uncommitted_lbs || 0)) / r.total_supply_lbs) * 100).toFixed(1)
          : '0';
        marketCtx = `ABC Position (${r.crop_year}, ${r.report_year}/${String(r.report_month).padStart(2, '0')}): ` +
          `Supply ${(Number(r.total_supply_lbs) / 1e6).toFixed(0)}M lbs | ` +
          `Shipped ${(Number(r.total_shipped_lbs) / 1e6).toFixed(0)}M | ` +
          `Committed ${(Number(r.total_committed_lbs) / 1e6).toFixed(0)}M | ` +
          `Uncommitted ${(Number(r.uncommitted_lbs) / 1e6).toFixed(0)}M | ` +
          `${soldPct}% sold`;
      }

      const { data: prices } = await supabase
        .from('strata_prices')
        .select('variety, grade, price_usd_per_lb')
        .order('price_date', { ascending: false })
        .limit(5);

      if (prices?.length) {
        marketCtx += '\nPrices: ' + prices.map(p =>
          `${p.variety} ${p.grade} $${parseFloat(p.price_usd_per_lb).toFixed(2)}/lb`
        ).join(', ');
      }
    } catch (e) { /* graceful */ }

    // Get Zyra response
    const zyraReply = await askZyra(incomingBody, history, marketCtx);

    // Send reply
    await sendReply(from, zyraReply);

    // Log outbound reply
    await supabase.from('whatsapp_messages').insert({
      direction: 'outbound',
      phone_number: from,
      message_type: 'zyra_reply',
      body: zyraReply,
      status: 'sent',
      created_at: new Date().toISOString(),
    });

    // Return empty TwiML (we already sent via REST API)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200, // Always return 200 to Twilio
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});
