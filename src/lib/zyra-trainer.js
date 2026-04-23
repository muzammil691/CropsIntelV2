// Zyra Trainer Loop — capture user feedback on Zyra replies so future
// prompts can reference corrections + preferred phrasing.
//
// Storage strategy:
//   1. Always write to localStorage (works offline, survives sign-out)
//   2. Best-effort insert into public.zyra_feedback (table may not exist yet;
//      we swallow errors so the UI never breaks the chat)
//
// Shape:
//   { id, session_id, user_id, user_query, assistant_reply, rating: 'up'|'down',
//     correction: string | null, page_context, user_tier, created_at }

import { supabase } from './supabase';

const LS_KEY = 'zyra_trainer_feedback_v1';
const LS_CAP = 200;

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries) {
  try {
    const trimmed = entries.slice(-LS_CAP);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — fine */
  }
}

export async function recordFeedback({
  sessionId,
  userId = null,
  userQuery,
  assistantReply,
  rating, // 'up' | 'down'
  correction = null,
  pageContext = null,
  userTier = 'guest',
}) {
  const entry = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    session_id: sessionId,
    user_id: userId,
    user_query: (userQuery || '').slice(0, 1000),
    assistant_reply: (assistantReply || '').slice(0, 2000),
    rating,
    correction: correction ? correction.slice(0, 1500) : null,
    page_context: pageContext,
    user_tier: userTier,
    created_at: new Date().toISOString(),
  };

  // 1. Always save locally (the source of truth for the trainer UI)
  const local = readLocal();
  local.push(entry);
  writeLocal(local);

  // 2. Best-effort remote insert — silent on failure
  try {
    await supabase.from('zyra_feedback').insert(entry);
  } catch {
    /* table may not exist yet; trainer still works via local cache */
  }

  return entry;
}

export function getFeedbackStats() {
  const local = readLocal();
  const up = local.filter(f => f.rating === 'up').length;
  const down = local.filter(f => f.rating === 'down').length;
  const total = local.length;
  const corrections = local.filter(f => f.correction).length;
  return {
    total,
    up,
    down,
    corrections,
    approvalRate: total === 0 ? null : up / total,
  };
}

/**
 * Build a short "What users have corrected before" block that can be
 * appended to Zyra's system prompt. Caps at 800 chars so we don't
 * blow out the context window.
 */
export function buildCorrectionContext() {
  const local = readLocal();
  const corrections = local
    .filter(f => f.rating === 'down' && f.correction)
    .slice(-10); // last 10 corrections
  if (corrections.length === 0) return '';
  const lines = corrections.map((c, i) =>
    `${i + 1}. User asked: "${c.user_query.slice(0, 120)}" — correction: "${c.correction.slice(0, 160)}"`
  );
  const body = lines.join('\n');
  return body.slice(0, 800);
}

export function clearLocalFeedback() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}
