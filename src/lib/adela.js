// ADELA — Nervous System / AI Orchestrator
//
// Per vision (April 16, 2026): ADELA is the runtime orchestrator that
// routes each AI job to the appropriate provider (Claude / GPT / Gemini),
// coordinates the multi-model architecture, and enforces information
// walls on every AI response.
//
// This file is the router abstraction. Instead of every Zyra/analysis
// call hardcoding `fetch('.../functions/v1/zyra-chat')`, call:
//
//   import { routeAIJob } from '../lib/adela';
//   const { answer, provider } = await routeAIJob({
//     type: 'market_analysis',
//     prompt: '...',
//     profile,
//   });
//
// ADELA picks the right provider per job type, passes the profile so
// info walls can strip fields pre-send, and tags the response with the
// model used for auditing.

import { projectForRole, familyFor } from './permissions';
import { auditAccess } from './audit-log';

// ─── Provider registry ───────────────────────────────────────────────
// Each entry points to an existing edge function or a placeholder.
// As the Vision's Phase 8+ arrives, we'll add per-provider edge functions
// (zyra-openai, zyra-gemini, brain-ai-multi). For now, Claude covers
// everything and the routing decisions are stubs that all go to Claude
// — but the ABSTRACTION is in place so future swaps are one-line.

const PROVIDERS = {
  claude: {
    id: 'claude',
    label: 'Claude (Sonnet)',
    edgeFunction: 'zyra-chat', // existing
    strengths: ['structured_reasoning', 'document_understanding', 'long_context', 'tool_use', 'market_analysis', 'forecasting'],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI GPT',
    edgeFunction: 'zyra-openai', // TODO (Phase 8)
    strengths: ['general_chat', 'multilingual', 'creative'],
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    edgeFunction: 'zyra-gemini', // TODO (Phase 8)
    strengths: ['multimodal', 'fast_inference'],
  },
  council: {
    // Multi-model debate. When Atlas is auto-shipping changes it asks the
    // council (Claude + GPT + Gemini) to debate the proposal.
    id: 'council',
    label: 'Multi-model Council (Claude + GPT + Gemini)',
    edgeFunction: 'brain-ai', // legacy V1 edge function; Phase 10 rewire
    strengths: ['decision', 'debate', 'atlas_selfdev'],
  },
};

// ─── Job-type → provider routing table ────────────────────────────────
// Each job type gets a preferred provider. Multiple tasks can share a
// provider; this is just the default. Overrides are allowed per call via
// { force: 'gemini' }.

export const JOB_ROUTES = {
  // Customer-facing Zyra chat — one-to-one conversation
  zyra_chat:          'claude',
  // Market analysis — structured reasoning over numbers
  market_analysis:    'claude',
  // Report parsing — document understanding
  report_parsing:     'claude',
  // Trade prescription — needs facts + reasoning
  trade_prescription: 'claude',
  // Monthly brief — long-form generation from data
  monthly_brief:      'claude',
  // Multilingual general chat (Arabic/Hindi/Turkish/Spanish) — GPT often wins
  multilingual_chat:  'openai',
  // Multimodal (image + text) — Gemini
  multimodal:         'gemini',
  // Self-development: Atlas council debate
  atlas_debate:       'council',
  // Default fallback
  default:            'claude',
};

export function providerFor(jobType) {
  return JOB_ROUTES[jobType] || JOB_ROUTES.default;
}

// ─── Info-wall filter for AI responses ────────────────────────────────
// Ensures AI never returns counterparty data the user shouldn't see.
// Applied AFTER the provider call, BEFORE returning to the UI.

function filterAIResponse(response, profile) {
  if (!response || typeof response !== 'object') return response;

  // Strip any counterparty data accidentally leaked in the response
  // (e.g., the LLM might include a supplier name in its answer to a
  // customer). We do a shallow pass on known sensitive keys.
  const safe = { ...response };
  const family = familyFor(profile?.role);

  if (family === 'customer' || family === 'guest') {
    // Strip any hints about supplier/margin/cost
    if (typeof safe.answer === 'string') {
      // Redaction patterns — conservative, error on the side of stripping
      const patterns = [
        /\b(supplier|source):\s*[^.,\n]+/gi,
        /\b(broker):\s*[^.,\n]+/gi,
        /\b(cost\s*basis|margin|markup):\s*\$?\d[\d,.]*/gi,
        /\bMAXONS['']?\s*(margin|cost|markup)/gi,
      ];
      for (const p of patterns) {
        safe.answer = safe.answer.replace(p, '[redacted]');
      }
    }
    delete safe.supplier;
    delete safe.cost_basis;
    delete safe.margin;
  }

  if (family === 'supplier') {
    if (typeof safe.answer === 'string') {
      safe.answer = safe.answer.replace(/\b(customer|buyer):\s*[^.,\n]+/gi, '[redacted]');
    }
    delete safe.customer;
    delete safe.margin;
  }

  if (family === 'broker') {
    if (typeof safe.answer === 'string') {
      safe.answer = safe.answer.replace(/\b(customer|buyer):\s*[^.,\n]+/gi, '[redacted]');
      safe.answer = safe.answer.replace(/\bsupplier\s+price[s]?:?\s*\$?\d[\d,.]*/gi, '[redacted]');
    }
    delete safe.customer;
    delete safe.supplier_pricing;
    delete safe.customer_pricing;
  }

  // Run response through generic projection as a final pass.
  return projectForRole(safe, profile);
}

// ─── Main entry: routeAIJob ───────────────────────────────────────────
// Callers pass: { type, prompt, context, profile, force? }
// Returns: { answer, provider, tokensUsed?, latencyMs, metadata }

export async function routeAIJob({
  type = 'default',
  prompt,
  context = {},
  profile = null,
  force = null,
  supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL,
  supabaseKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY,
} = {}) {
  const providerId = force || providerFor(type);
  const provider = PROVIDERS[providerId] || PROVIDERS.claude;
  const start = performance.now();

  // Scope-guard: strip any counterparty data out of context BEFORE
  // sending to the LLM. Never let a supplier's private pricing reach the
  // provider's servers as part of a customer's prompt.
  const safeContext = projectForRole(context, profile);

  // Audit — every AI call logs. Even failed ones.
  auditAccess({
    action: 'read',
    resource: 'ai:' + type,
    scope: {
      provider: provider.id,
      job_type: type,
      family: familyFor(profile?.role),
    },
  });

  let response;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${provider.edgeFunction}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        type,
        prompt,
        context: safeContext,
        provider: provider.id,
      }),
    });
    response = await res.json();
  } catch (err) {
    response = { answer: '', error: err?.message || 'AI routing error' };
  }

  // Info-wall filter pass on the response
  const safeResponse = filterAIResponse(response, profile);

  return {
    ...safeResponse,
    provider: provider.id,
    providerLabel: provider.label,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── Convenience wrappers for common jobs ─────────────────────────────
export const askZyra       = (prompt, context, profile) => routeAIJob({ type: 'zyra_chat', prompt, context, profile });
export const analyzeMarket = (prompt, context, profile) => routeAIJob({ type: 'market_analysis', prompt, context, profile });
export const parseReport   = (prompt, context, profile) => routeAIJob({ type: 'report_parsing', prompt, context, profile });
export const monthlyBrief  = (prompt, context, profile) => routeAIJob({ type: 'monthly_brief', prompt, context, profile });

// Council debate (Atlas self-dev)
export const atlasDebate   = (prompt, context, profile) => routeAIJob({ type: 'atlas_debate', prompt, context, profile });

// Exposed for /map + debugging — lets UI show which provider handled which job
export { PROVIDERS };
