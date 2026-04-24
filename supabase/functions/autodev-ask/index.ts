// CropsIntel V2 — Auto Dev Mode · Ask Edge Function
// 2026-04-25
//
// Writes a question to autodev_questions + fires a WhatsApp notification to the
// admin phone (+971527854447). Used by Claude (session or runner) whenever it hits
// ambiguity that the hard-memory rules say requires user input (scope / destructive /
// subjective / external-credential).
//
// Principle: Claude does NOT block on this. Claude writes the question, fires WA,
// and moves on to the next buildable task. When admin replies via WA, the webhook
// writes the answer back into the same row and the worker picks it up next tick.
//
// POST /autodev-ask
// {
//   question: "Approve semi-auto CRM deal→offer link stub visibility?",
//   suggestion: "Hide the deal→offer link UI entirely until V3 ships",
//   options: [
//     { key: "a", label: "Show 'V3 coming' badge on every deal card" },
//     { key: "b", label: "Hide link entirely until V3 (recommended)" },
//     { key: "c", label: "Show as disabled placeholder" }
//   ],
//   priority: "normal",   // low | normal | high | blocking
//   category: "design",   // scope | design | data | destructive | credential
//   context: {},          // JSONB — anything helpful for the runner to resume
//   asked_by: "claude-session"  // or "runner"
// }
//
// Response: { ok, question_id, whatsapp_sid, whatsapp_skipped, error? }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ADMIN_WHATSAPP = Deno.env.get('ADMIN_WHATSAPP') || '+971527854447';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function numberToOptionChar(i: number): string {
  // 1-indexed → "1","2","3" … (keeping it reply-friendly)
  return String(i);
}

async function sendViaWhatsappSend(phone: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to: phone,
        body,
        message_type: 'autodev_question',
        metadata: { source: 'autodev-ask' },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` };
    return { ok: true, sid: j?.sid || j?.message_sid };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function formatQuestionBody(question: string, suggestion: string | null, options: any[] | null, questionId: string): string {
  let body = `🧭 *Auto Dev — Claude needs you*\n\n${question}\n`;
  if (suggestion) {
    body += `\n💡 *My suggestion:* ${suggestion}\n`;
  }
  if (options && options.length) {
    body += `\nReply with a number:\n`;
    options.forEach((opt, i) => {
      const star = opt.is_recommended ? ' ⭐' : '';
      body += `${numberToOptionChar(i + 1)}) ${opt.label}${star}\n`;
    });
    body += `\nOr send free text if none fit.\n`;
  } else {
    body += `\nReply with your answer in free text.\n`;
  }
  body += `\n_Ref: ${questionId.slice(0, 8)}_`;
  return body;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();
    const {
      question,
      suggestion = null,
      options = null,
      priority = 'normal',
      category = null,
      context = {},
      asked_by = 'claude-session',
      skip_whatsapp = false,
    } = payload;

    if (!question || typeof question !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Missing question' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Insert the question first
    const insertRes = await sb.from('autodev_questions').insert({
      question, suggestion, options, priority, category, context, asked_by,
      status: 'open',
    }).select('id').single();

    if (insertRes.error || !insertRes.data) {
      return new Response(JSON.stringify({ ok: false, error: insertRes.error?.message || 'insert failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const questionId = insertRes.data.id;
    let whatsappSid: string | undefined;
    let whatsappSkipped = true;
    let whatsappError: string | undefined;

    if (!skip_whatsapp && ADMIN_WHATSAPP) {
      const body = formatQuestionBody(question, suggestion, options, questionId);
      const waRes = await sendViaWhatsappSend(ADMIN_WHATSAPP, body);
      whatsappSkipped = false;
      if (waRes.ok && waRes.sid) {
        whatsappSid = waRes.sid;
        await sb.from('autodev_questions').update({ whatsapp_sent_sid: waRes.sid }).eq('id', questionId);
      } else {
        whatsappError = waRes.error;
      }
    }

    // Update status singleton open-questions count
    await sb.rpc('autodev_heartbeat', {
      p_state: 'working',
      p_worker_type: asked_by,
    });

    return new Response(JSON.stringify({
      ok: true,
      question_id: questionId,
      whatsapp_sid: whatsappSid,
      whatsapp_skipped: whatsappSkipped,
      whatsapp_error: whatsappError,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
