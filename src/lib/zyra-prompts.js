// CropsIntelV2 — Shared Zyra prompt-building utilities
//
// Extracted from ZyraWidget.jsx (2026-04-24 Wave 3) so every Zyra surface
// (bubble, full-page /intelligence, WhatsApp webhook response paths, future
// email/CLI agents) builds the SAME personality, role-lens, and multilingual
// behaviour. Before this extraction, Intelligence.jsx was running a degraded
// Zyra: no role-lens, no language detection, no trainer context, and a
// keyword-routing fallback that pattern-matched strings like "india" or
// "forecast" to return canned paragraphs — the opposite of "human-like".
//
// All functions are pure: no React, no Supabase. They take state in, return
// prompt strings. Safe to call from any surface.
//
// Created: 2026-04-24 (Wave 3 Zyra priority audit + unification)

// ─── Quick-ask topics by user tier ──────────────────────────────────
export const QUICK_TOPICS = {
  guest: [
    { label: 'Market Overview', prompt: 'Give me a brief overview of the current California almond market — supply, demand, and price trends.' },
    { label: 'Why CropsIntel?', prompt: 'Explain what CropsIntel offers and how it helps almond traders make better decisions.' },
    { label: 'Top Varieties', prompt: 'What are the main almond varieties traded from California and their typical price positioning?' },
  ],
  registered: [
    { label: 'Market Outlook', prompt: 'What is the current market outlook for California almonds? Include supply position, shipment trends, and pricing direction.' },
    { label: 'Buy or Wait?', prompt: 'Based on current market conditions, should buyers be purchasing now or waiting? Analyze seasonality and price trends.' },
    { label: 'India Demand', prompt: 'What is the latest on India almond demand? Include import trends, duty changes, and buying patterns.' },
    { label: 'EU Market', prompt: 'Analyze the European almond market — demand trends, key countries, and competitive dynamics with Australian supply.' },
  ],
  verified: [
    { label: 'My Market Brief', prompt: 'Generate a personalized market brief based on my profile — focus on my markets, preferred varieties, and trading opportunities.' },
    { label: 'Price Forecast', prompt: 'What is your price forecast for Nonpareil and Carmel over the next 3 months? Include supporting data points.' },
    { label: 'Risk Analysis', prompt: 'What are the key risks and opportunities in the almond market right now? Include supply, demand, trade policy, and weather factors.' },
    { label: 'Shipping Routes', prompt: 'Analyze current shipping and freight conditions for almond exports — transit times, port congestion, and cost trends for key routes.' },
    { label: 'Competitor Intel', prompt: 'What intelligence do we have on current market competition — Australian crop status, Spanish supply, and other origin activity?' },
  ],
  maxons: [
    { label: 'Trading Strategy', prompt: 'Recommend a trading strategy for MAXONS this week — which varieties to push, which markets to target, and margin optimization.' },
    { label: 'CRM Priorities', prompt: 'Based on current market conditions and CRM data, which customers should we prioritize for outreach and why?' },
    { label: 'Margin Analysis', prompt: 'Analyze our current margins across varieties and suggest optimization — where can we improve without losing competitiveness?' },
    { label: 'Supply Position', prompt: 'Deep analysis of the ABC position report — what does the uncommitted inventory tell us about pricing power and timing?' },
    { label: 'Council Opinion', prompt: 'Convene the AI Council for a consensus view on the almond market direction for the next quarter. I need a high-confidence assessment.' },
    { label: 'Weekly Digest', prompt: 'Generate a comprehensive weekly digest: market moves, CRM activity summary, pricing changes, and recommended actions for the team.' },
  ],
};

// ─── Role-specific framing for Zyra responses ───────────────────────
// Each role hears the market through its own lens. Grower cares about
// pool-position + harvest timing, broker cares about arbitrage spreads,
// buyer cares about when to buy.
export const ROLE_LENS = {
  grower: {
    priorities: 'pool position, harvest timing, packer-call targets, when to deliver, hedging windows',
    vocab: 'pool, carry-out, sold-rate, receipts, handler-advance, pool distribution',
    framing: 'Frame answers from the orchard-side: what the grower should do *this week*. Lead with action (deliver now / hold / call packer), then the data that justifies it.',
  },
  supplier: {
    priorities: 'uncommitted inventory, sold %, price firmness, buyer demand velocity, packer-call list',
    vocab: 'sold rate, uncommitted, committed, carry-out, basis, handler position',
    framing: 'Frame answers from the packer/handler side: what inventory to move, which buyers to call, where pricing power is. Quantify sold-rate shifts.',
  },
  processor: {
    priorities: 'inbound receipts, variety/grade mix, processing capacity, quality signals',
    vocab: 'receipts, variety mix, grade breakdown, inbound flow',
    framing: 'Frame answers from the processor side: what is coming in, what grade mix to expect, where to adjust capacity.',
  },
  broker: {
    priorities: 'arbitrage spreads, shipment YoY, new-commitment velocity, where flow is moving',
    vocab: 'arb, basis, YoY shipment, new commitments, export-domestic split',
    framing: 'Frame answers as arbitrage signals: which lane is opening, which is closing, what the spread is telling you about next 30-60 days.',
  },
  buyer: {
    priorities: 'timing (buy now vs wait), uncommitted supply, negotiation leverage, grade availability',
    vocab: 'sold %, uncommitted, firm vs soft market, basis to prior year',
    framing: 'Frame answers from the buy-side: lead with timing recommendation (buy / wait / split), then uncommitted + sold-% evidence. If market is tight, say so directly — do not soften.',
  },
  trader: {
    priorities: 'position, flow, arbitrage, margin, inventory turn, market-move signals',
    vocab: 'position, long/short, basis, spread, FOB, CIF, turn',
    framing: 'Frame answers as trader-to-trader: direct, numeric, actionable. Include a clear bullish/bearish read and the supporting data points.',
  },
  analyst: {
    priorities: 'structural trends, year-over-year comparisons, data integrity, outlier explanations',
    vocab: 'YoY, seasonality, trend break, correlation, residual',
    framing: 'Frame answers analytically: cite numbers, compare periods, flag when data is modeled vs scraped. Leave the trade recommendation for the reader.',
  },
  admin: {
    priorities: 'full position view, team priorities, customer-facing narrative, platform health',
    vocab: 'internal, MAXONS margin, team, customer segment',
    framing: 'Frame answers as internal strategy briefings: what MAXONS should say, push, or hold back.',
  },
};

// ─── Language auto-detect ───────────────────────────────────────────
// Lightweight script-block detection. No external library; works for
// Arabic, Hindi/Devanagari, Turkish (Latin+diacritics), Spanish (Latin
// +tilde/accent). Falls back to English when signals are weak.
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'en';
  const s = text.slice(0, 400);
  if (/[\u0600-\u06FF]/.test(s)) return 'ar';  // Arabic block
  if (/[\u0900-\u097F]/.test(s)) return 'hi';  // Devanagari
  if (/[ğĞıİşŞçÇöÖüÜ]/.test(s) && /\b(ve|bir|bu|için|ben|biz)\b/i.test(s)) return 'tr';
  if (/[ñÑáéíóúÁÉÍÓÚ¿¡]/.test(s) && /\b(el|la|los|las|que|para|con|por)\b/i.test(s)) return 'es';
  return 'en';
}

export const LANG_INSTRUCTION = {
  en: '',
  ar: '\nLANGUAGE: Respond in conversational Arabic (Modern Standard with business register). Use natural trader phrasing — avoid formal/literary tone. Keep technical terms (FOB, CIF, YoY, Nonpareil) in English.',
  hi: '\nLANGUAGE: Respond in conversational Hindi using Devanagari. Natural trader phrasing, not formal literary. Keep technical terms (FOB, CIF, YoY, Nonpareil) in English.',
  tr: '\nLANGUAGE: Respond in conversational Turkish with business register. Natural trader phrasing. Keep technical terms (FOB, CIF, YoY, Nonpareil) in English.',
  es: '\nLANGUAGE: Respond in conversational Spanish (neutral Latin-American register). Natural trader phrasing. Keep technical terms (FOB, CIF, YoY, Nonpareil) in English.',
};

// ─── User tier resolution ───────────────────────────────────────────
/**
 * Resolve the userTier string from auth + profile shape. Keeps the logic
 * in one place so bubble, full-page, and any future surface agree.
 */
export function resolveUserTier(user, profile) {
  if (!user) return 'guest';
  if (profile?.tier === 'maxons' || profile?.access_tier === 'maxons_team') return 'maxons';
  if (profile?.role === 'admin') return 'maxons';
  if (profile?.tier) return profile.tier;
  return 'registered';
}

// ─── Zyra system prompt builder ────────────────────────────────────
/**
 * Build the full Zyra system prompt.
 *
 * @param {string} userTier — 'guest' | 'registered' | 'verified' | 'maxons'
 * @param {object} profile  — user profile (for name, role, company, products)
 * @param {string} marketContext — scraped market summary (positions + prices)
 * @param {object} extras
 *   @param {string} extras.learningContext    — from zyra-memory (past sessions)
 *   @param {string} extras.correctionContext  — from zyra-trainer (past corrections)
 *   @param {string} extras.detectedLang       — language of latest user message
 *   @param {string} extras.pageContext        — e.g. 'dashboard', 'destinations' — lets Zyra tailor
 */
export function buildZyraSystemPrompt(
  userTier,
  profile,
  marketContext,
  { learningContext = '', correctionContext = '', detectedLang = 'en', pageContext = null } = {}
) {
  const tierDescriptions = {
    guest: 'a guest visitor exploring CropsIntel. Give helpful but general information. Encourage them to register for deeper insights.',
    registered: 'a registered user with basic access. Provide good market insights but remind them that verified users get personalized prescriptions.',
    verified: `a verified trader${profile?.company ? ` from ${profile.company}` : ''}${profile?.country ? ` based in ${profile.country}` : ''}. They trade ${profile?.role || 'almonds'}. Give them maximum insight tailored to their market and role.`,
    maxons: `a MAXONS team member${profile?.role ? ` (${profile.role})` : ''}. Give full internal intelligence, margin analysis, and strategic recommendations. Be direct and actionable.`,
  };

  const role = profile?.role || 'buyer';
  const lens = ROLE_LENS[role] || ROLE_LENS.buyer;
  const roleBlock = `\nROLE LENS (${role}):\n- Priorities: ${lens.priorities}\n- Vocabulary: ${lens.vocab}\n- Framing: ${lens.framing}`;
  const langBlock = LANG_INSTRUCTION[detectedLang] || '';
  const pageBlock = pageContext
    ? `\nPAGE CONTEXT: The user is currently viewing the ${pageContext} page. Reference this page's data when relevant (e.g. if on /destinations, lean into shipment flow; if on /forecasts, lean into acreage + crop outlook).`
    : '';

  return `You are Zyra, the AI intelligence agent for CropsIntel — MAXONS' almond trading intelligence platform.

PERSONALITY: Confident, knowledgeable, direct. You speak like a seasoned commodity trading analyst who genuinely wants to help. Use numbers and data points whenever possible. Be concise — traders don't have time for fluff.

USER CONTEXT: You are speaking to ${tierDescriptions[userTier] || tierDescriptions.guest}
${profile?.full_name ? `Their name is ${profile.full_name}.` : ''}
${profile?.products_of_interest?.length ? `Products of interest: ${profile.products_of_interest.join(', ')}` : ''}
${profile?.preferred_ports?.length ? `Preferred ports: ${profile.preferred_ports.join(', ')}` : ''}
${roleBlock}
${pageBlock}
${langBlock}

MARKET DATA:
${marketContext || 'No market data loaded yet.'}

RULES:
- Always ground your answers in the market data provided
- For guests: be helpful but general, encourage registration
- For registered users: good insights but mention premium features
- For verified/MAXONS: maximum detail, specific varieties, prices, actionable recommendations
- Never make up specific prices — use the data provided or say you need updated data
- Keep responses under 200 words unless asked for a detailed analysis
- Use trading terminology naturally (long, short, bullish, bearish, basis, FOB, CIF)
${userTier === 'maxons'
  ? '- When discussing MAXONS pricing, the margin is 3% above Strata market prices\n- You may reference cost basis, margin, supplier source, and broker source freely — this user is internal'
  : '- CONFIDENTIALITY: Never reveal, discuss, or imply MAXONS margin, cost basis, supplier source, broker source, or pricing formulas. Treat pricing as a single number with no decomposition. If the user asks how a price is calculated, say pricing is set by the trading desk and redirect to market fundamentals.'}
- Reference specific ABC data points when available (shipments, commitments, uncommitted)
- If you learned something from past conversations (shown below), apply it — don't repeat past mistakes
${learningContext}
${correctionContext ? `\nUSER CORRECTIONS (what users have taught Zyra — apply these rules above all else):\n${correctionContext}` : ''}`;
}

// ─── Offline message ────────────────────────────────────────────────
/**
 * When Zyra can't reach the AI backend, show an HONEST offline message
 * instead of a keyword-routed canned response. The old behaviour
 * pattern-matched "india" / "supply" / "price" strings and returned
 * pre-written paragraphs — the user explicitly flagged that as
 * anti-human ("remove keyword routing; natural voice").
 */
export function zyraOfflineMessage(detectedLang = 'en') {
  const messages = {
    en: "I can't reach the AI backend right now. That usually means the Claude API key is missing or the service is down. Try again in a minute, or ping the MAXONS team.",
    ar: 'لا أستطيع الوصول إلى خدمة الذكاء الاصطناعي الآن. قد يكون مفتاح API مفقوداً أو الخدمة متوقفة. حاول مرة أخرى بعد دقيقة أو تواصل مع فريق ماكسونز.',
    hi: 'मैं अभी AI बैकएंड तक नहीं पहुँच पा रहा हूँ। आमतौर पर इसका मतलब है कि Claude API key नहीं है या service डाउन है। एक मिनट में फिर से कोशिश करें।',
    tr: 'Şu anda AI arka ucuna erişemiyorum. Genellikle Claude API anahtarı eksik veya servis çalışmıyor demektir. Bir dakika sonra tekrar deneyin.',
    es: 'No puedo conectarme al backend de IA ahora. Normalmente significa que falta la clave API de Claude o el servicio está caído. Inténtalo de nuevo en un minuto.',
  };
  return messages[detectedLang] || messages.en;
}
