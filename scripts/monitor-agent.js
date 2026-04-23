#!/usr/bin/env node
/*
 * CropsIntelV2 — Monitor Bot (background self-audit agent)
 *
 * Walks the public site, scans each page's HTML for known-error signals,
 * and writes findings to public/monitor-log.json so /map can render them.
 *
 * Safe MVP — does NOT auto-fix code. Reports only. Author (Claude) picks
 * up findings in the morning and applies fixes with human approval.
 *
 * Run:    node scripts/monitor-agent.js
 * Cron:   add to .github/workflows/auto-scrape.yml (requires workflow scope)
 *
 * Phase 10 (ATLAS) will extend this with:
 *   - Playwright-based authenticated walker
 *   - Multi-model AI council scoring each finding
 *   - Auto-propose PR fixes gated on admin WhatsApp+OTP approval
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE = process.env.MONITOR_BASE_URL || 'https://cropsintel.com';

// Routes to walk. Guest-visible first; team-gated routes skipped because
// we can't auth from CI yet (Phase 7b Playwright adds that).
const ROUTES = [
  { path: '/',              label: 'Welcome (root)' },
  { path: '/welcome',       label: 'Welcome' },
  { path: '/dashboard',     label: 'Dashboard' },
  { path: '/supply',        label: 'Supply & Demand' },
  { path: '/destinations',  label: 'Destinations' },
  { path: '/pricing',       label: 'Live Pricing' },
  { path: '/forecasts',     label: 'Crop Forecasts' },
  { path: '/news',          label: 'News & Intelligence' },
  { path: '/analysis',      label: 'Market Analysis' },
  { path: '/intelligence',  label: 'AI Intelligence (Zyra)' },
  { path: '/reports',       label: 'Reports' },
  { path: '/map',           label: 'Project Map' },
  { path: '/login',         label: 'Sign In' },
  { path: '/register',      label: 'Register' },
];

// Signals that likely indicate a real issue on the page.
// Scored — severity is "info" | "low" | "medium" | "high" | "critical".
const SIGNALS = [
  { pattern: /\bNaN\b/,                           severity: 'high',   label: 'NaN visible in rendered HTML' },
  { pattern: /\[object Object\]/,                  severity: 'high',   label: 'Unstringified object in HTML' },
  { pattern: /undefined(?!\s*=)/,                 severity: 'low',    label: 'Literal "undefined" in HTML' },
  { pattern: /Error: /,                            severity: 'high',   label: 'Error: string in HTML' },
  { pattern: /TypeError/,                          severity: 'critical', label: 'TypeError in rendered HTML' },
  { pattern: /Failed to fetch/,                    severity: 'high',   label: 'Failed-to-fetch message visible' },
  { pattern: /cropsintel\.net/i,                   severity: 'medium', label: 'cropsintel.net reference (should all be .com)' },
  { pattern: /Coming soon/i,                       severity: 'info',   label: 'Coming-soon placeholder visible' },
];

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function scanRoute(route) {
  const url = BASE + route.path;
  const started = Date.now();
  const entry = {
    route: route.path,
    label: route.label,
    url,
    status: null,
    ok: false,
    duration_ms: null,
    findings: [],
    checked_at: new Date().toISOString(),
  };
  try {
    const res = await fetchWithTimeout(url);
    entry.status = res.status;
    entry.ok = res.ok;
    entry.duration_ms = Date.now() - started;
    if (!res.ok) {
      entry.findings.push({ severity: res.status === 404 ? 'critical' : 'high', label: `HTTP ${res.status}` });
      return entry;
    }
    // SPA serves index.html for every route — content is hydrated client-side,
    // so the server HTML is mostly a shell. Scan it anyway for build artefacts
    // and static text. Phase 7b will use headless Chrome to scan post-hydration.
    const html = await res.text();
    for (const sig of SIGNALS) {
      if (sig.pattern.test(html)) {
        entry.findings.push({ severity: sig.severity, label: sig.label });
      }
    }
  } catch (err) {
    entry.ok = false;
    entry.findings.push({ severity: 'critical', label: `Fetch failed: ${err.message}` });
  }
  return entry;
}

async function main() {
  const started = new Date().toISOString();
  console.log(`Monitor Bot start — base=${BASE} routes=${ROUTES.length} at ${started}`);
  const entries = [];
  for (const r of ROUTES) {
    const e = await scanRoute(r);
    entries.push(e);
    console.log(`  ${e.ok ? '✓' : '✗'} ${r.path.padEnd(18)} ${e.status ?? 'ERR'} ${e.findings.length} findings ${e.duration_ms ?? '-'}ms`);
  }
  const totals = {
    routes_checked: entries.length,
    ok_count: entries.filter(e => e.ok).length,
    fail_count: entries.filter(e => !e.ok).length,
    findings_count: entries.reduce((s, e) => s + e.findings.length, 0),
    by_severity: entries.reduce((acc, e) => {
      for (const f of e.findings) acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {}),
  };
  const log = {
    generated_at: started,
    generated_by: 'monitor-agent.js (night-shift MVP 2026-04-24)',
    base_url: BASE,
    totals,
    entries,
    phase_10_note: 'Phase 10 (ATLAS): replace heuristic scan with Playwright + multi-model AI council. Current scan inspects static HTML only — SPA post-hydration issues NOT detected yet.',
  };
  const out = path.join(__dirname, '..', 'public', 'monitor-log.json');
  fs.writeFileSync(out, JSON.stringify(log, null, 2));
  console.log(`Wrote ${out}`);
  console.log(`Totals: ${totals.ok_count}/${totals.routes_checked} routes ok, ${totals.findings_count} findings`);
}

main().catch(err => { console.error('Monitor Bot crashed:', err); process.exit(1); });
