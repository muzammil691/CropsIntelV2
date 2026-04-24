// CropsIntelV2 — WhatsApp Webhook Edge Function
// Receives incoming WhatsApp messages from Twilio
// Routes to: OTP verification, Zyra AI chat, offer responses, registration
//
// POST /whatsapp-webhook (Twilio sends form-encoded data)
// Twilio expects TwiML XML response or empty 200

// 2026-04-23: Version bump — see whatsapp-send/index.ts for context.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || '+12345622692';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const ADMIN_WHATSAPP = (Deno.env.get('ADMIN_WHATSAPP') || '+971527854447').trim();

console.log('[whatsapp-webhook] boot', {
  hasTwilioSid: !!TWILIO_ACCOUNT_SID,
  hasTwilioToken: !!TWILIO_AUTH_TOKEN,
  twilioFrom: TWILIO_WHATSAPP_FROM,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_KEY,
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
});

// ─── Zyra Learning System (edge-function version) ────────────

// Load active learnings for system prompt injection — makes Zyra smarter over time
async function loadLearningContext(sb: any): Promise<string> {
  try {
    const [learningsRes, errorsRes, patternsRes] = await Promise.all([
      sb.from('zyra_learnings')
        .select('category, learning, confidence, frequency')
        .eq('is_active', true)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .order('frequency', { ascending: false })
        .limit(15),
      sb.from('zyra_errors')
        .select('error_type, error_message, user_query, occurrence_count')
        .eq('is_resolved', false)
        .order('occurrence_count', { ascending: false })
        .limit(3),
      sb.from('zyra_question_patterns')
        .select('pattern, category, frequency, best_response_template')
        .order('frequency', { ascending: false })
        .limit(3),
    ]);

    let ctx = '';

    // Learnings grouped by category
    const learnings = learningsRes.data || [];
    if (learnings.length) {
      const grouped: Record<string, any[]> = {};
      learnings.forEach((l: any) => {
        if (!grouped[l.category]) grouped[l.category] = [];
        grouped[l.category].push(l);
      });

      const labels: Record<string, string> = {
        faq: 'Frequently Asked',
        correction: 'Corrections (avoid these mistakes)',
        customer_insight: 'Customer Insights',
        market_pattern: 'Market Patterns',
        error_fix: 'Error Fixes',
        product_feedback: 'Product Feedback',
        common_question: 'Common Questions',
        trade_signal: 'Trade Signals',
      };

      ctx += '\nZYRA LEARNED KNOWLEDGE (from past conversations):\n';
      for (const [category, items] of Object.entries(grouped)) {
        ctx += `\n[${labels[category] || category}]\n`;
        items.forEach((item: any) => {
          ctx += `- ${item.learning} (confidence: ${(item.confidence * 100).toFixed(0)}%, seen ${item.frequency}x)\n`;
        });
      }
    }

    // Unresolved errors
    const errors = errorsRes.data || [];
    if (errors.length) {
      ctx += '\nKNOWN ISSUES (avoid repeating these errors):\n';
      errors.forEach((e: any) => {
        ctx += `- [${e.error_type}] ${(e.error_message || '').substring(0, 100)} (occurred ${e.occurrence_count}x)`;
        if (e.user_query) ctx += ` — triggered by: "${e.user_query.substring(0, 50)}"`;
        ctx += '\n';
      });
    }

    // Top patterns
    const patterns = patternsRes.data || [];
    if (patterns.length) {
      ctx += '\nMOST ASKED QUESTIONS (be ready for these):\n';
      patterns.forEach((p: any) => {
        ctx += `- "${p.pattern}" (asked ${p.frequency}x, category: ${p.category})`;
        if (p.best_response_template) ctx += ` → template: ${p.best_response_template.substring(0, 80)}`;
        ctx += '\n';
      });
    }

    return ctx;
  } catch (err) {
    console.warn('Learning context load failed:', err);
    return '';
  }
}

// Log a WhatsApp conversation to zyra_conversations
async function logWhatsAppConversation(sb: any, phone: string, userMsg: string, zyraReply: string, hadError: boolean) {
  try {
    const topics = detectTopics(userMsg + ' ' + zyraReply);
    const sentiment = detectSentiment(zyraReply);
    await sb.from('zyra_conversations').insert({
      session_id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      channel: 'whatsapp',
      phone_number: phone,
      user_tier: 'guest',
      messages: JSON.stringify([
        { role: 'user', content: userMsg.substring(0, 2000), timestamp: new Date().toISOString() },
        { role: 'assistant', content: zyraReply.substring(0, 2000), timestamp: new Date().toISOString() },
      ]),
      message_count: 2,
      topics,
      sentiment,
      had_error: hadError,
      ended_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('WA conversation log failed:', err);
  }
}

// Log errors for learning
async function logZyraError(sb: any, errorType: string, errorMessage: string, userQuery?: string) {
  try {
    const { data: existing } = await sb
      .from('zyra_errors')
      .select('id, occurrence_count')
      .eq('error_type', errorType)
      .ilike('error_message', `%${errorMessage.substring(0, 50)}%`)
      .eq('is_resolved', false)
      .limit(1)
      .single();

    if (existing) {
      await sb.from('zyra_errors')
        .update({ occurrence_count: existing.occurrence_count + 1, last_seen_at: new Date().toISOString(), user_query: userQuery })
        .eq('id', existing.id);
    } else {
      await sb.from('zyra_errors').insert({
        error_type: errorType,
        error_message: errorMessage,
        user_query: userQuery?.substring(0, 500),
        channel: 'whatsapp',
      });
    }
  } catch (err) {
    console.warn('Error log failed:', err);
  }
}

// Track question patterns for learning
async function trackPattern(sb: any, query: string) {
  try {
    const pattern = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\b(the|a|an|is|are|was|were|what|how|why|when|where|can|could|would|should|do|does|did)\b/g, '')
      .replace(/\s+/g, ' ').trim().substring(0, 100);

    if (!pattern) return;

    const category = categorizeQuery(query);
    const { data: existing } = await sb.from('zyra_question_patterns')
      .select('id, frequency, example_questions')
      .eq('pattern', pattern).limit(1).single();

    if (existing) {
      const examples = existing.example_questions || [];
      if (examples.length < 5 && !examples.includes(query.substring(0, 200))) {
        examples.push(query.substring(0, 200));
      }
      await sb.from('zyra_question_patterns').update({
        frequency: existing.frequency + 1,
        example_questions: examples,
        last_asked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await sb.from('zyra_question_patterns').insert({
        pattern, category,
        example_questions: [query.substring(0, 200)],
        frequency: 1,
      });
    }
  } catch (_) { /* silent */ }
}

function categorizeQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('price') || lower.includes('cost') || lower.includes('margin')) return 'pricing';
  if (lower.includes('supply') || lower.includes('position') || lower.includes('abc')) return 'supply';
  if (lower.includes('demand') || lower.includes('ship') || lower.includes('export')) return 'demand';
  if (lower.includes('recommend') || lower.includes('should') || lower.includes('strategy')) return 'strategy';
  if (lower.includes('forecast') || lower.includes('predict') || lower.includes('outlook')) return 'forecast';
  return 'general';
}

function detectTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const topics: string[] = [];
  const topicMap: Record<string, string[]> = {
    pricing: ['price', 'pricing', 'cost', 'rate', 'margin', 'strata', 'bid', 'ask', 'fob', 'cif'],
    supply: ['supply', 'position', 'uncommitted', 'inventory', 'abc', 'crop year'],
    demand: ['demand', 'shipment', 'export', 'import', 'buyer', 'customer'],
    india: ['india', 'indian', 'mumbai', 'delhi', 'nhava'],
    europe: ['europe', 'eu', 'spain', 'germany', 'italy', 'barcelona'],
    china: ['china', 'chinese', 'shanghai', 'beijing'],
    middle_east: ['uae', 'dubai', 'saudi', 'qatar', 'middle east', 'gulf'],
    varieties: ['nonpareil', 'carmel', 'butte', 'independence', 'monterey', 'fritz'],
    weather: ['weather', 'frost', 'drought', 'rain', 'water', 'bloom'],
    forecast: ['forecast', 'prediction', 'outlook', 'expect', 'estimate'],
    strategy: ['strategy', 'recommend', 'should i', 'should we', 'buy or', 'timing'],
    shipping: ['shipping', 'freight', 'container', 'logistics', 'port', 'transit'],
  };
  for (const [topic, keywords] of Object.entries(topicMap)) {
    if (keywords.some(k => lower.includes(k))) topics.push(topic);
  }
  return topics.slice(0, 5);
}

function detectSentiment(text: string): string {
  const lower = text.toLowerCase();
  const bullish = ['bullish', 'strong demand', 'prices rising', 'buy now', 'tight supply', 'upward'].filter(s => lower.includes(s)).length;
  const bearish = ['bearish', 'weak demand', 'prices falling', 'wait', 'surplus', 'downward', 'oversupply'].filter(s => lower.includes(s)).length;
  if (bullish > bearish) return 'bullish';
  if (bearish > bullish) return 'bearish';
  if (bullish > 0 && bearish > 0) return 'mixed';
  return 'neutral';
}

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

// Ask Claude (Zyra) for a response — now with learning context
async function askZyra(message: string, history: Array<{role: string; content: string}>, marketCtx: string, learningCtx: string = ''): Promise<string> {
  const systemPrompt = `You are Zyra, the AI trading intelligence assistant for CropsIntel by MAXONS International Trading (Dubai).

You specialize in California almond market analysis — pricing trends, supply/demand forecasting, trade opportunity identification, and global almond trade intelligence.

You are chatting via WhatsApp. Keep responses concise (under 300 words), use emoji sparingly for readability, and be conversational but data-driven. Format for WhatsApp (use *bold* and _italic_, no markdown headers).

${marketCtx ? `CURRENT MARKET DATA:\n${marketCtx}\n` : ''}
${learningCtx ? learningCtx : ''}
Key rules:
- Always cite data when making claims (ABC position data, Strata prices)
- MAXONS adds 3% margin to Strata market prices — never reveal margin to non-team contacts
- Crop year runs Aug-Jul (current: 2025/26)
- Be actionable: give specific buy/sell/hold guidance when asked
- If asked about registration: direct to https://cropsintel.com/register
- If asked about pricing: direct to https://cropsintel.com/pricing
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
      // Log error for learning (uses global supabase from closure — will be called in context where supabase exists)
      return "I'm having a brief technical issue. Please try again in a moment, or visit https://cropsintel.com for full access to market intelligence.";
    }

    const data = await res.json();
    return data.content?.[0]?.text || "I couldn't process that. Try asking about almond prices, supply data, or trade opportunities.";
  } catch (err: any) {
    console.error('Zyra error:', err);
    return "I'm temporarily offline. Visit https://cropsintel.com for real-time market data.";
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

    // ─── Auto Dev Mode · admin-phone branch ────────────
    // If the message is from the admin (+971527854447) AND there's an open autodev_questions
    // row, parse the reply as a numbered option OR free text and close the question.
    // Admin can also send commands: `status`, `tasks`, `cancel <ref>`.
    if (from === ADMIN_WHATSAPP || from === `+${ADMIN_WHATSAPP.replace(/^\+/, '')}`) {
      try {
        // Admin commands (don't need an open question)
        if (lowerMsg === 'status' || lowerMsg === 's') {
          const { data: live } = await supabase.from('autodev_live').select('*').single();
          const { data: openQs } = await supabase
            .from('autodev_questions').select('id, question, asked_at, priority')
            .eq('status', 'open').order('asked_at', { ascending: false }).limit(5);
          let reply = `📊 *Auto Dev Status*\n\n`;
          reply += `State: *${live?.state || 'unknown'}*\n`;
          reply += `Worker: ${live?.worker_type || '-'}\n`;
          reply += `Current task: ${live?.current_task_title || '(none)'}\n`;
          reply += `Heartbeat age: ${live?.seconds_since_heartbeat ?? '?'}s\n`;
          reply += `Tasks in progress: ${live?.tasks_in_progress ?? 0}\n`;
          reply += `Open questions: ${openQs?.length || 0}\n`;
          if (openQs && openQs.length) {
            reply += `\n*Pending:*\n`;
            openQs.forEach((q: any, i: number) => {
              reply += `${i + 1}. [${q.priority}] ${q.question.slice(0, 80)}${q.question.length > 80 ? '…' : ''}\n`;
            });
          }
          await sendReply(from, reply);
          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { 'Content-Type': 'text/xml' },
          });
        }

        // Find most recent open question
        const { data: openQ } = await supabase
          .from('autodev_questions')
          .select('*')
          .eq('status', 'open')
          .order('asked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openQ) {
          // Try to parse as numbered option first
          let answerKey: string | null = null;
          let answerText: string | null = null;
          const digitMatch = incomingBody.trim().match(/^(\d+)[\s.:)\-]*(.*)$/);
          if (digitMatch && openQ.options && Array.isArray(openQ.options)) {
            const idx = parseInt(digitMatch[1], 10) - 1;
            if (idx >= 0 && idx < openQ.options.length) {
              answerKey = openQ.options[idx].key || String(idx + 1);
              answerText = openQ.options[idx].label;
            }
          }
          // If no numbered match, treat whole body as free text
          if (!answerKey && !answerText) {
            answerText = incomingBody.trim();
          }

          await supabase
            .from('autodev_questions')
            .update({
              status: 'answered',
              answer_key: answerKey,
              answer_text: answerText,
              answered_at: new Date().toISOString(),
              answered_by_phone: from,
              whatsapp_reply_sid: messageSid,
            })
            .eq('id', openQ.id);

          // Bump heartbeat
          await supabase.rpc('autodev_heartbeat', {
            p_state: 'working',
            p_worker_type: 'admin-reply',
          });

          const confirm = `✅ *Got it.*\n\nAnswer recorded for _"${openQ.question.slice(0, 60)}${openQ.question.length > 60 ? '…' : ''}"_\n` +
            (answerKey ? `Option: *${answerKey}* — ${answerText}` : `Your answer: ${answerText?.slice(0, 200) || ''}`) +
            `\n\nI'll resume next tick. Send *status* for current state.`;
          await sendReply(from, confirm);

          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      } catch (adminErr) {
        console.error('[autodev admin branch]', adminErr);
        // fall through to normal flows
      }
    }

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
            "You can also view the offer at: https://cropsintel.com/trading"
          );
        } else if (lowerMsg === 'details') {
          await sendReply(from,
            "📋 *Full Offer Details*\n\n" +
            "View the complete specifications, shipping terms, and payment options at:\n" +
            "https://cropsintel.com/trading\n\n" +
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
          "🌐 Full platform: https://cropsintel.com"
        );
      } else {
        await sendReply(from,
          "🌰 *Welcome to CropsIntel!*\n\n" +
          "To create your account, visit:\n" +
          "https://cropsintel.com/register\n\n" +
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
    // Load conversation history + learning context + market data in parallel
    const [historyRes, learningCtx, marketData] = await Promise.all([
      // Conversation history
      supabase
        .from('whatsapp_messages')
        .select('direction, body, message_type')
        .eq('phone_number', from)
        .in('message_type', ['chat', 'zyra_reply'])
        .order('created_at', { ascending: false })
        .limit(10),
      // Learning context — what Zyra has learned from past conversations
      loadLearningContext(supabase),
      // Market data
      (async () => {
        let ctx = '';
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
            ctx = `ABC Position (${r.crop_year}, ${r.report_year}/${String(r.report_month).padStart(2, '0')}): ` +
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
            ctx += '\nPrices: ' + prices.map((p: any) =>
              `${p.variety} ${p.grade} $${parseFloat(p.price_usd_per_lb).toFixed(2)}/lb`
            ).join(', ');
          }
        } catch (e) { /* graceful */ }
        return ctx;
      })(),
    ]);

    const history = (historyRes.data || [])
      .reverse()
      .map((m: any) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.body,
      }));

    // Track question pattern (non-blocking)
    trackPattern(supabase, incomingBody);

    // Get Zyra response — now with learning context injected
    let hadError = false;
    const zyraReply = await askZyra(incomingBody, history, marketData, learningCtx);

    // Detect if response was an error fallback — log for learning
    if (zyraReply.includes('technical issue') || zyraReply.includes('temporarily offline')) {
      hadError = true;
      logZyraError(supabase, 'api_failure', zyraReply.substring(0, 200), incomingBody);
    }

    // Send reply
    await sendReply(from, zyraReply);

    // Log outbound reply + conversation (non-blocking, don't delay response)
    await Promise.all([
      supabase.from('whatsapp_messages').insert({
        direction: 'outbound',
        phone_number: from,
        message_type: 'zyra_reply',
        body: zyraReply,
        status: 'sent',
        created_at: new Date().toISOString(),
      }),
      // Log to learning system
      logWhatsAppConversation(supabase, from, incomingBody, zyraReply, hadError),
    ]);

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
