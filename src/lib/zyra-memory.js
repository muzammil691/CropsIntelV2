// CropsIntelV2 — Zyra Learning Memory System
// Every conversation makes Zyra smarter. Every error teaches her.
// Logs conversations, extracts learnings, feeds context back into prompts.

import { supabase } from './supabase';

// ─── Generate a unique session ID ─────────────────────────────────
export function generateSessionId() {
  return `zyra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Log a conversation to Supabase ───────────────────────────────
export async function logConversation({
  sessionId,
  channel = 'web',
  userId = null,
  phoneNumber = null,
  userTier = 'guest',
  pageContext = null,
  messages = [],
  topics = [],
  sentiment = null,
  hadError = false,
  errorDetails = null,
  durationSeconds = null,
}) {
  try {
    const { data, error } = await supabase
      .from('zyra_conversations')
      .insert({
        session_id: sessionId,
        channel,
        user_id: userId,
        phone_number: phoneNumber,
        user_tier: userTier,
        page_context: pageContext,
        messages: JSON.stringify(messages.map(m => ({
          role: m.role,
          content: m.content?.substring(0, 2000), // Cap at 2000 chars per message
          timestamp: m.timestamp,
          sentiment: m.sentiment || null,
        }))),
        message_count: messages.length,
        topics,
        sentiment,
        had_error: hadError,
        error_details: errorDetails,
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Zyra memory: conversation log failed:', error.message);
      return null;
    }
    return data?.id;
  } catch (err) {
    console.warn('Zyra memory: log error:', err.message);
    return null;
  }
}

// ─── Log an error for learning ────────────────────────────────────
export async function logError({
  errorType = 'api_failure',
  errorMessage,
  userQuery = null,
  zyraResponse = null,
  channel = 'web',
  conversationId = null,
}) {
  try {
    // Check if similar error exists — increment count instead of duplicating
    const { data: existing } = await supabase
      .from('zyra_errors')
      .select('id, occurrence_count')
      .eq('error_type', errorType)
      .ilike('error_message', `%${errorMessage.substring(0, 50)}%`)
      .eq('is_resolved', false)
      .limit(1)
      .single();

    if (existing) {
      await supabase
        .from('zyra_errors')
        .update({
          occurrence_count: existing.occurrence_count + 1,
          last_seen_at: new Date().toISOString(),
          user_query: userQuery,
        })
        .eq('id', existing.id);
      return existing.id;
    }

    const { data, error } = await supabase
      .from('zyra_errors')
      .insert({
        error_type: errorType,
        error_message: errorMessage,
        user_query: userQuery,
        zyra_response: zyraResponse?.substring(0, 2000),
        channel,
        conversation_id: conversationId,
      })
      .select('id')
      .single();

    return data?.id || null;
  } catch (err) {
    console.warn('Zyra error log failed:', err.message);
    return null;
  }
}

// ─── Track question patterns ──────────────────────────────────────
export async function trackQuestionPattern(query, category = 'general') {
  try {
    // Normalize query to pattern
    const pattern = normalizeToPattern(query);

    // Check if pattern exists
    const { data: existing } = await supabase
      .from('zyra_question_patterns')
      .select('id, frequency, example_questions')
      .eq('pattern', pattern)
      .limit(1)
      .single();

    if (existing) {
      const examples = existing.example_questions || [];
      if (examples.length < 5 && !examples.includes(query.substring(0, 200))) {
        examples.push(query.substring(0, 200));
      }
      await supabase
        .from('zyra_question_patterns')
        .update({
          frequency: existing.frequency + 1,
          example_questions: examples,
          last_asked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('zyra_question_patterns')
        .insert({
          pattern,
          category,
          example_questions: [query.substring(0, 200)],
          frequency: 1,
        });
    }
  } catch (err) {
    // Silent fail — don't disrupt user experience
  }
}

// ─── Normalize a question to a pattern for deduplication ──────────
function normalizeToPattern(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an|is|are|was|were|what|how|why|when|where|can|could|would|should|do|does|did)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

// ─── Detect conversation topics from messages ─────────────────────
export function detectTopics(messages) {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
  const topics = [];

  const topicMap = {
    'pricing': ['price', 'pricing', 'cost', 'rate', 'margin', 'strata', 'bid', 'ask', 'fob', 'cif'],
    'supply': ['supply', 'position', 'uncommitted', 'inventory', 'abc', 'crop year'],
    'demand': ['demand', 'shipment', 'export', 'import', 'buyer', 'customer'],
    'india': ['india', 'indian', 'mumbai', 'delhi', 'nhava'],
    'europe': ['europe', 'eu', 'spain', 'germany', 'italy', 'barcelona'],
    'china': ['china', 'chinese', 'shanghai', 'beijing'],
    'middle_east': ['uae', 'dubai', 'saudi', 'qatar', 'middle east', 'gulf'],
    'varieties': ['nonpareil', 'carmel', 'butte', 'independence', 'monterey', 'fritz'],
    'weather': ['weather', 'frost', 'drought', 'rain', 'water', 'bloom'],
    'forecast': ['forecast', 'prediction', 'outlook', 'expect', 'estimate'],
    'strategy': ['strategy', 'recommend', 'should i', 'should we', 'buy or', 'timing'],
    'crm': ['crm', 'contact', 'customer', 'deal', 'pipeline', 'offer'],
    'shipping': ['shipping', 'freight', 'container', 'logistics', 'port', 'transit'],
  };

  for (const [topic, keywords] of Object.entries(topicMap)) {
    if (keywords.some(k => text.includes(k))) {
      topics.push(topic);
    }
  }

  return topics.slice(0, 5); // Max 5 topics
}

// ─── Detect overall sentiment from conversation ───────────────────
export function detectConversationSentiment(messages) {
  const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content).join(' ').toLowerCase();

  const bullishSignals = ['bullish', 'strong demand', 'prices rising', 'buy now', 'tight supply', 'upward'];
  const bearishSignals = ['bearish', 'weak demand', 'prices falling', 'wait', 'surplus', 'downward', 'oversupply'];

  const bullish = bullishSignals.filter(s => assistantMessages.includes(s)).length;
  const bearish = bearishSignals.filter(s => assistantMessages.includes(s)).length;

  if (bullish > bearish) return 'bullish';
  if (bearish > bullish) return 'bearish';
  if (bullish > 0 && bearish > 0) return 'mixed';
  return 'neutral';
}

// ─── Load active learnings for system prompt injection ─────────────
// This is the KEY function — it makes Zyra smarter over time
export async function loadZyraLearnings(limit = 20) {
  try {
    // Get high-confidence, active learnings
    const { data: learnings } = await supabase
      .from('zyra_learnings')
      .select('category, learning, confidence, frequency')
      .eq('is_active', true)
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .order('frequency', { ascending: false })
      .limit(limit);

    if (!learnings?.length) return '';

    // Group by category
    const grouped = {};
    learnings.forEach(l => {
      if (!grouped[l.category]) grouped[l.category] = [];
      grouped[l.category].push(l);
    });

    // Build context string
    let ctx = '\nZYRA LEARNED KNOWLEDGE (from past conversations):\n';

    for (const [category, items] of Object.entries(grouped)) {
      const label = {
        faq: 'Frequently Asked',
        correction: 'Corrections (avoid these mistakes)',
        customer_insight: 'Customer Insights',
        market_pattern: 'Market Patterns',
        error_fix: 'Error Fixes',
        product_feedback: 'Product Feedback',
        common_question: 'Common Questions',
        trade_signal: 'Trade Signals',
      }[category] || category;

      ctx += `\n[${label}]\n`;
      items.forEach(item => {
        ctx += `- ${item.learning} (confidence: ${(item.confidence * 100).toFixed(0)}%, seen ${item.frequency}x)\n`;
      });
    }

    return ctx;
  } catch (err) {
    console.warn('Zyra learnings load failed:', err.message);
    return '';
  }
}

// ─── Load recent errors that are unresolved ────────────────────────
export async function loadUnresolvedErrors(limit = 5) {
  try {
    const { data: errors } = await supabase
      .from('zyra_errors')
      .select('error_type, error_message, user_query, occurrence_count')
      .eq('is_resolved', false)
      .order('occurrence_count', { ascending: false })
      .limit(limit);

    if (!errors?.length) return '';

    let ctx = '\nKNOWN ISSUES (avoid repeating these errors):\n';
    errors.forEach(e => {
      ctx += `- [${e.error_type}] ${e.error_message.substring(0, 100)} (occurred ${e.occurrence_count}x)`;
      if (e.user_query) ctx += ` — triggered by: "${e.user_query.substring(0, 50)}"`;
      ctx += '\n';
    });

    return ctx;
  } catch (err) {
    return '';
  }
}

// ─── Load top question patterns for proactive guidance ─────────────
export async function loadTopPatterns(limit = 5) {
  try {
    const { data: patterns } = await supabase
      .from('zyra_question_patterns')
      .select('pattern, category, frequency, best_response_template')
      .order('frequency', { ascending: false })
      .limit(limit);

    if (!patterns?.length) return '';

    let ctx = '\nMOST ASKED QUESTIONS (be ready for these):\n';
    patterns.forEach(p => {
      ctx += `- "${p.pattern}" (asked ${p.frequency}x, category: ${p.category})`;
      if (p.best_response_template) ctx += ` → template: ${p.best_response_template.substring(0, 80)}`;
      ctx += '\n';
    });

    return ctx;
  } catch (err) {
    return '';
  }
}

// ─── Full learning context for system prompt ──────────────────────
// Call this once when Zyra loads, inject into system prompt
export async function getFullLearningContext() {
  const [learnings, errors, patterns] = await Promise.all([
    loadZyraLearnings(15),
    loadUnresolvedErrors(3),
    loadTopPatterns(3),
  ]);

  return learnings + errors + patterns;
}

// ─── Extract category from user query ─────────────────────────────
export function categorizeQuery(query) {
  const lower = query.toLowerCase();
  if (lower.includes('price') || lower.includes('cost') || lower.includes('margin')) return 'pricing';
  if (lower.includes('supply') || lower.includes('position') || lower.includes('abc')) return 'supply';
  if (lower.includes('demand') || lower.includes('ship') || lower.includes('export')) return 'demand';
  if (lower.includes('recommend') || lower.includes('should') || lower.includes('strategy')) return 'strategy';
  if (lower.includes('forecast') || lower.includes('predict') || lower.includes('outlook')) return 'forecast';
  if (lower.includes('crm') || lower.includes('customer') || lower.includes('contact')) return 'crm';
  if (lower.includes('what is') || lower.includes('how does') || lower.includes('explain')) return 'education';
  return 'general';
}
