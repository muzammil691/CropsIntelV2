// CropsIntel V2 — Trigger Scrape Cycle Edge Function (Phase 2 / W3)
// 2026-04-27
//
// Allows the /autonomous page admin button to actually trigger the GitHub Actions
// workflow_dispatch endpoint for `auto-scrape.yml`. Without this, the button could
// only do browser-side YoY math (theatre, not real scraping).
//
// Flow:
//   1. POST from /autonomous with the user's Supabase JWT.
//   2. Verify JWT, look up user_profiles, require admin / super_admin / maxons_team.
//   3. Call GitHub REST: POST /repos/{owner}/{repo}/actions/workflows/auto-scrape.yml/dispatches
//   4. Log the trigger to scraping_logs (scraper_name='manual-trigger').
//   5. Return 202 + ETA so the page can start polling pipeline_runs.
//
// Required Supabase secrets:
//   - GITHUB_DISPATCH_TOKEN — fine-grained PAT with `actions:write` on the repo
//   - GITHUB_REPO           — defaults to 'muzammil691/CropsIntelV2' if unset
//   - GITHUB_WORKFLOW_FILE  — defaults to 'auto-scrape.yml' if unset
//
// Response:
//   202 → { ok: true, triggered_by, eta_minutes, pipeline_run_id?, workflow_dispatched: true }
//   401 → { error: 'unauthenticated' }
//   403 → { error: 'forbidden' (not admin/team) }
//   500 → { error: '...' (GitHub API failure / token invalid) }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

const GITHUB_DISPATCH_TOKEN = Deno.env.get('GITHUB_DISPATCH_TOKEN') || '';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || 'muzammil691/CropsIntelV2';
const GITHUB_WORKFLOW_FILE = Deno.env.get('GITHUB_WORKFLOW_FILE') || 'auto-scrape.yml';
const GITHUB_REF = Deno.env.get('GITHUB_REF') || 'main';

const ETA_MINUTES = 8; // Empirical — full ABC + Strata + Bountiful + News + IMAP + processors + deploy.

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function isAdmin(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('role, access_tier')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  const role = (data as Record<string, string>).role;
  const tier = (data as Record<string, string>).access_tier;
  return ['admin', 'super_admin'].includes(role || '') || ['admin', 'maxons_team'].includes(tier || '');
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // 1. Validate caller JWT.
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonResponse({ error: 'unauthenticated', detail: 'Missing Authorization: Bearer <jwt>' }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: 'unauthenticated', detail: authErr?.message || 'Invalid JWT' }, 401);
  }

  // 2. Authorize — admin / super_admin / maxons_team only.
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const allowed = await isAdmin(supabaseAdmin, user.id);
  if (!allowed) {
    return jsonResponse({ error: 'forbidden', detail: 'Manual-trigger requires admin or maxons_team access tier.' }, 403);
  }

  // 3. Verify dispatch token is configured.
  if (!GITHUB_DISPATCH_TOKEN) {
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: 'manual-trigger',
      status: 'failed',
      error_message: 'GITHUB_DISPATCH_TOKEN not configured in Supabase Edge Function secrets',
      metadata: { triggered_by: user.id, email: user.email },
      completed_at: new Date().toISOString(),
    });
    return jsonResponse({
      error: 'not_configured',
      detail:
        'GITHUB_DISPATCH_TOKEN secret is missing. Add a fine-grained PAT with actions:write under ' +
        'Supabase Dashboard → Project Settings → Edge Functions → Secrets.',
    }, 500);
  }

  // 4. Open a pipeline_runs row in 'queued' state so the UI can begin polling immediately.
  let pipelineRunId: number | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('pipeline_runs')
      .insert({
        run_type: 'autonomous_cycle',
        status: 'running',
        trigger_source: 'manual',
        steps_completed: [],
        summary: `Manual trigger by ${user.email || user.id} — workflow_dispatch queued`,
        errors: [],
      })
      .select('id')
      .single();
    if (!error && data) pipelineRunId = (data as { id: number }).id;
  } catch (_err) {
    // Non-fatal; the workflow itself will open its own pipeline_runs row.
  }

  // 5. Call GitHub workflow_dispatch.
  const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;
  const ghResp = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_DISPATCH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'cropsintel-v2-edge-fn',
    },
    body: JSON.stringify({
      ref: GITHUB_REF,
      inputs: {},
    }),
  });

  // GitHub returns 204 No Content on success.
  if (ghResp.status !== 204) {
    const errText = await ghResp.text().catch(() => '');
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: 'manual-trigger',
      status: 'failed',
      error_message: `GitHub workflow_dispatch failed: HTTP ${ghResp.status} — ${errText.substring(0, 500)}`,
      metadata: { triggered_by: user.id, email: user.email, dispatch_url: dispatchUrl },
      completed_at: new Date().toISOString(),
    });
    if (pipelineRunId) {
      await supabaseAdmin.from('pipeline_runs').update({
        status: 'failed',
        summary: `workflow_dispatch failed: HTTP ${ghResp.status}`,
        errors: [{ scraper: 'manual-trigger', error: errText.substring(0, 500) }],
        completed_at: new Date().toISOString(),
      }).eq('id', pipelineRunId);
    }
    return jsonResponse({
      error: 'github_dispatch_failed',
      status: ghResp.status,
      detail: errText.substring(0, 500),
      hint: ghResp.status === 401 || ghResp.status === 403
        ? 'Check that GITHUB_DISPATCH_TOKEN is a fine-grained PAT with actions:write on this repo.'
        : 'Check that GITHUB_REPO and GITHUB_WORKFLOW_FILE point to a valid workflow on the default branch.',
    }, 500);
  }

  // 6. Success — log the trigger and return.
  await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: 'manual-trigger',
    status: 'success',
    metadata: {
      triggered_by: user.id,
      email: user.email,
      workflow: GITHUB_WORKFLOW_FILE,
      pipeline_run_id: pipelineRunId,
    },
    completed_at: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    workflow_dispatched: true,
    triggered_by: user.email || user.id,
    eta_minutes: ETA_MINUTES,
    pipeline_run_id: pipelineRunId,
    workflow_runs_url: `https://github.com/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}`,
    note: 'Cycle queued on GitHub Actions. Poll /pipeline_runs by id to watch progress.',
  }, 202);
});
