// CropsIntel V2 — /map Launch Gates (bird's-eye view)
// 2026-04-25 · Mini-Phase 1
//
// Three-tier milestone layout:
//   SOFT LAUNCH (V2 Core)      @ 35% of total plan
//   FULL LAUNCH (V2 Polish)    @ 50% of total plan
//   V3 TRADE HUB               @ 100% of total plan
//
// Each gate rolls up the relevant phases from progress.json + computes
// an honest percent-of-plan figure. Every phase row expands to show
// summary, status, and files/gaps.

import React, { useState, useMemo } from 'react';

// Weighting: each gate contributes a share of the TOTAL 100% plan.
// Soft = phases 1–6 + autodev/map/zyra unify     (35% share)
// Full = post-launch V2 polish                   (15% share → cumulative 50%)
// V3   = phases 7.1–7.9 (Trade Hub full)         (50% share → cumulative 100%)
const GATE_SHARES = { soft: 35, full: 15, v3: 50 };

// Mapping progress.json phases → which gate they belong to
const PHASE_GATE = {
  1: 'soft', 2: 'soft', 3: 'soft', 4: 'soft', 5: 'soft', 6: 'soft',
  7: 'v3',   8: 'v3',   9: 'v3',   10: 'v3',
};

// The intrinsic phases for "Full Launch" — work not yet broken into Phase rows
const FULL_LAUNCH_PLACEHOLDERS = [
  { key: 'abc-real-scrapers',  label: 'Real ABC PDF scrapers (B2 / B4 / B5 / B6)',        pct: 30 },
  { key: 'v1-realdevice',      label: 'V1 → V2 user real-device tests (65 users)',         pct: 10 },
  { key: 'ios-testflight',     label: 'iOS TestFlight + App Store screenshots',            pct: 0  },
];

const GATE_META = {
  soft: { cum: 35,  color: 'emerald', label: 'Soft Launch — V2 Core',    tag: 'V2 GATE 1' },
  full: { cum: 50,  color: 'sky',     label: 'Full Launch — V2 Polish',  tag: 'V2 GATE 2' },
  v3:   { cum: 100, color: 'violet',  label: 'V3 Trade Hub',              tag: 'V3 GATE'  },
};

const COLOR_CLASSES = {
  emerald: { bar: 'bg-emerald-500', soft: 'bg-emerald-500/15', text: 'text-emerald-300', ring: 'ring-emerald-500/30', border: 'border-emerald-500/30' },
  sky:     { bar: 'bg-sky-500',     soft: 'bg-sky-500/15',     text: 'text-sky-300',     ring: 'ring-sky-500/30',     border: 'border-sky-500/30' },
  violet:  { bar: 'bg-violet-500',  soft: 'bg-violet-500/15',  text: 'text-violet-300',  ring: 'ring-violet-500/30',  border: 'border-violet-500/30' },
};

function PhaseRow({ phase, expanded, onToggle }) {
  const status = phase.status || (phase.percent >= 100 ? 'done' : phase.percent > 0 ? 'active' : 'queued');
  const pct = phase.percent ?? 0;
  const statusIcon = status === 'done' ? '✓' : status === 'active' ? '◔' : '○';
  const statusClass =
    status === 'done'   ? 'text-emerald-400' :
    status === 'active' ? 'text-amber-400'   :
                          'text-slate-500';

  return (
    <div className="border-t border-slate-800 first:border-t-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-3 px-4 hover:bg-slate-800/30 transition-colors text-left"
      >
        <span className={`text-sm font-mono ${statusClass} w-5`}>{statusIcon}</span>
        <span className="text-sm text-slate-200 flex-1 min-w-0 truncate">
          <span className="text-slate-500 font-mono text-[11px] mr-2">#{phase.id}</span>
          {phase.name}
        </span>
        <span className="text-xs text-slate-400 font-mono">{pct}%</span>
        <span className="text-slate-600 text-xs ml-2">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && phase.summary && (
        <div className="pl-12 pr-4 pb-4 text-[12px] text-slate-400 leading-relaxed whitespace-pre-wrap">
          {phase.summary}
          {phase.completedDate && (
            <div className="text-[10px] text-slate-600 font-mono mt-2">
              completed · {phase.completedDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GateCard({ gateKey, phases, placeholders = [], liveProgress }) {
  const [expandedId, setExpandedId] = useState(null);
  const meta = GATE_META[gateKey];
  const cc = COLOR_CLASSES[meta.color];

  // Gate rollup % — average of phase percents (weighted equally among phases in the gate)
  const rollup = useMemo(() => {
    const all = phases.map(p => p.percent ?? 0);
    if (placeholders.length) placeholders.forEach(p => all.push(p.pct));
    if (!all.length) return 0;
    return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
  }, [phases, placeholders]);

  return (
    <div className={`bg-slate-900/60 border ${cc.border} rounded-xl overflow-hidden shadow-xl shadow-black/10 ring-1 ${cc.ring}`}>
      {/* Gate header bar */}
      <div className={`${cc.soft} px-5 py-4 flex items-center justify-between gap-4`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase tracking-wider font-mono ${cc.text}`}>{meta.tag}</span>
            <span className="text-slate-600 text-[10px]">·</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">milestone @ {meta.cum}% of total plan</span>
          </div>
          <div className={`text-base font-semibold ${cc.text} truncate`}>{meta.label}</div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <div className={`text-2xl font-bold ${cc.text}`}>{rollup}%</div>
          <div className="text-[10px] text-slate-500 font-mono">gate rollup</div>
        </div>
      </div>

      {/* Linear progress bar */}
      <div className="h-1.5 bg-slate-900">
        <div className={`h-full ${cc.bar} transition-all duration-700 ease-out`} style={{ width: `${rollup}%` }} />
      </div>

      {/* Phase list */}
      <div>
        {phases.length === 0 && placeholders.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-600">No phases mapped to this gate.</div>
        )}
        {phases.map(p => (
          <PhaseRow
            key={p.id}
            phase={p}
            expanded={expandedId === `p-${p.id}`}
            onToggle={() => setExpandedId(prev => prev === `p-${p.id}` ? null : `p-${p.id}`)}
          />
        ))}
        {placeholders.map(ph => (
          <PhaseRow
            key={ph.key}
            phase={{ id: ph.key, name: ph.label, percent: ph.pct, status: ph.pct >= 100 ? 'done' : ph.pct > 0 ? 'active' : 'queued', summary: `Placeholder roll-up: ${ph.pct}% complete. Detailed phase rows land when this work item begins.` }}
            expanded={expandedId === `ph-${ph.key}`}
            onToggle={() => setExpandedId(prev => prev === `ph-${ph.key}` ? null : `ph-${ph.key}`)}
          />
        ))}
      </div>
    </div>
  );
}

export default function LaunchGates({ progress }) {
  const phases = progress?.phases || [];
  const phasesBy = useMemo(() => {
    const g = { soft: [], full: [], v3: [] };
    phases.forEach(p => {
      const k = PHASE_GATE[p.id];
      if (k) g[k].push(p);
    });
    return g;
  }, [phases]);

  // Total-plan progress: weighted sum of gate rollups
  const totalPct = useMemo(() => {
    const gateRollup = (ps, extras = []) => {
      const all = ps.map(p => p.percent ?? 0);
      extras.forEach(e => all.push(e.pct));
      if (!all.length) return 0;
      return all.reduce((a, b) => a + b, 0) / all.length;
    };
    const soft = gateRollup(phasesBy.soft);
    const full = gateRollup([], FULL_LAUNCH_PLACEHOLDERS);
    const v3   = gateRollup(phasesBy.v3);
    return Math.round(
      (soft / 100) * GATE_SHARES.soft +
      (full / 100) * GATE_SHARES.full +
      (v3   / 100) * GATE_SHARES.v3
    );
  }, [phasesBy]);

  return (
    <div className="space-y-6">
      {/* Total plan progress hero */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 shadow-xl shadow-black/30">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">Total plan progress</div>
            <div className="text-4xl font-bold text-white">{totalPct}%</div>
            <div className="text-xs text-slate-400 mt-1">Honest weighted average across all 3 gates</div>
          </div>
          <div className="flex gap-2 text-xs">
            <div className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 font-mono">{GATE_SHARES.soft}% @ soft</div>
            <div className="px-2.5 py-1 rounded bg-sky-500/10 text-sky-300 font-mono">{GATE_SHARES.full}% @ full</div>
            <div className="px-2.5 py-1 rounded bg-violet-500/10 text-violet-300 font-mono">{GATE_SHARES.v3}% @ v3</div>
          </div>
        </div>
        {/* Segmented 3-gate bar */}
        <div className="h-3 bg-slate-950 rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${GATE_SHARES.soft}%` }} title="Soft launch segment" />
          <div className="bg-sky-500    transition-all duration-700 ease-out" style={{ width: `${GATE_SHARES.full}%` }} title="Full launch segment" />
          <div className="bg-violet-500 transition-all duration-700 ease-out" style={{ width: `${GATE_SHARES.v3}%` }}   title="V3 segment" />
        </div>
        {progress?.v2Scope && (
          <div className="mt-4 text-[12px] text-slate-400 bg-slate-950/50 border border-slate-800 rounded-lg p-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-mono mr-2">V2 scope</span>
            {progress.v2Scope}
          </div>
        )}
      </div>

      {/* Three gate cards */}
      <GateCard gateKey="soft" phases={phasesBy.soft} />
      <GateCard gateKey="full" phases={phasesBy.full} placeholders={FULL_LAUNCH_PLACEHOLDERS} />
      <GateCard gateKey="v3"   phases={phasesBy.v3} />
    </div>
  );
}
