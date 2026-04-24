// CropsIntel V2 — Auto Dev Mode · Ask (Node / runner helper)
// 2026-04-25
//
// Node-side equivalent of supabase/functions/autodev-ask/index.ts.
// The autodev-worker + runner call this when they need admin input.
//
// Usage:
//   import { askAdmin } from './autodev-ask.js';
//   const { questionId } = await askAdmin({
//     question: "Approve semi-auto CRM deal→offer link stub visibility?",
//     suggestion: "Hide link entirely until V3 ships",
//     options: [
//       { key: 'a', label: "Show 'V3 coming' badge on every deal card" },
//       { key: 'b', label: "Hide link entirely (recommended)", is_recommended: true },
//       { key: 'c', label: "Show as disabled placeholder" },
//     ],
//     priority: 'normal',
//     category: 'design',
//     context: { page: 'crm', design_doc: 'docs/TRADE_HUB_CROSSWALK_v1.md#6.5' },
//   });
//
// askAdmin returns immediately (non-blocking). The worker polls
// autodev_questions for status='answered' on its next tick.

import supabaseAdmin from '../lib/supabase-admin.js';

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '+971527854447';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function formatQuestionBody(question, suggestion, options, questionId) {
  let body = `🧭 *Auto Dev — Claude needs you*\n\n${question}\n`;
  if (suggestion) {
    body += `\n💡 *My suggestion:* ${suggestion}\n`;
  }
  if (options && options.length) {
    body += `\nReply with a number:\n`;
    options.forEach((opt, i) => {
      const star = opt.is_recommended ? ' ⭐' : '';
      body += `${i + 1}) ${opt.label}${star}\n`;
    });
    body += `\nOr send free text if none fit.\n`;
  } else {
    body += `\nReply with your answer in free text.\n`;
  }
  body += `\n_Ref: ${String(questionId).slice(0, 8)}_`;
  return body;
}

async function sendWhatsappSend(phone, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to: phone,
        body,
        message_type: 'autodev_question',
        metadata: { source: 'autodev-ask-node' },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` };
    return { ok: true, sid: j?.sid || j?.message_sid };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function askAdmin({
  question,
  suggestion = null,
  options = null,
  priority = 'normal',
  category = null,
  context = {},
  asked_by = 'runner',
  skip_whatsapp = false,
}) {
  if (!question) throw new Error('askAdmin requires question');

  const { data: row, error } = await supabaseAdmin
    .from('autodev_questions')
    .insert({
      question,
      suggestion,
      options,
      priority,
      category,
      context,
      asked_by,
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !row) {
    throw new Error(`Failed to insert autodev_questions row: ${error?.message}`);
  }

  let waResult = { ok: false, skipped: true };
  if (!skip_whatsapp && ADMIN_WHATSAPP && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const body = formatQuestionBody(question, suggestion, options, row.id);
    const wa = await sendWhatsappSend(ADMIN_WHATSAPP, body);
    waResult = { ...wa, skipped: false };
    if (wa.ok && wa.sid) {
      await supabaseAdmin.from('autodev_questions')
        .update({ whatsapp_sent_sid: wa.sid })
        .eq('id', row.id);
    }
  }

  await supabaseAdmin.rpc('autodev_heartbeat', {
    p_state: 'working',
    p_worker_type: asked_by,
  });

  return {
    questionId: row.id,
    whatsapp: waResult,
  };
}

// Poll for the answer. Returns the row once answered, or null if timeout.
export async function waitForAnswer(questionId, { timeoutMs = 0, pollIntervalMs = 30000 } = {}) {
  const started = Date.now();
  while (true) {
    const { data: row } = await supabaseAdmin
      .from('autodev_questions')
      .select('*')
      .eq('id', questionId)
      .single();
    if (row?.status === 'answered') return row;
    if (row?.status === 'cancelled' || row?.status === 'expired') return null;
    if (timeoutMs > 0 && Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

export async function heartbeat({ state, worker_type = 'runner', current_task_title = null, current_task_detail = null, last_error = null }) {
  await supabaseAdmin.rpc('autodev_heartbeat', {
    p_state: state,
    p_worker_type: worker_type,
    p_current_task_title: current_task_title,
    p_current_task_detail: current_task_detail,
    p_last_error: last_error,
  });
}
