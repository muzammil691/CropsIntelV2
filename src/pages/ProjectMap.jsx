import React, { useState, useEffect } from 'react';

const CATEGORY_COLORS = {
  data: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', bar: 'bg-blue-500', glow: 'shadow-blue-500/20' },
  ai: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', bar: 'bg-purple-500', glow: 'shadow-purple-500/20' },
  users: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', bar: 'bg-amber-500', glow: 'shadow-amber-500/20' },
  platform: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', bar: 'bg-green-500', glow: 'shadow-green-500/20' },
  future: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', bar: 'bg-gray-500', glow: 'shadow-gray-500/20' },
};

const STATUS_ICONS = { done: '\u2705', wip: '\u26A0\uFE0F', todo: '\u23F3' };

function AnimatedCounter({ target, duration = 1500 }) {
  // Default to the target value so first paint shows the real number.
  const [count, setCount] = useState(target);
  const prevTarget = React.useRef(target);
  useEffect(() => {
    // Only re-animate when the target ACTUALLY changes. Previously this
    // reset to 0 on every re-render (incl. the 30s auto-refresh), so anyone
    // landing on /map mid-animation saw truncated numbers ("10 overall"
    // instead of "81"). Interpolate from the last displayed value with
    // requestAnimationFrame + ease-out cubic.
    if (prevTarget.current === target) return;
    const from = prevTarget.current ?? 0;
    const delta = target - from;
    if (delta === 0) { prevTarget.current = target; return; }
    const startedAt = performance.now();
    let rafId;
    const tick = (now) => {
      const t = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(from + delta * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
      else prevTarget.current = target;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return <span>{count}</span>;
}

function CircularProgress({ percent, size = 120, strokeWidth = 8, color = '#22c55e', label }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white"><AnimatedCounter target={percent} /></span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label || 'complete'}</span>
      </div>
    </div>
  );
}

function PhaseTimeline({ phases }) {
  return (
    <div className="relative">
      {/* Connecting line */}
      <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-800" />
      <div className="space-y-4">
        {phases.map((phase, i) => {
          const isDone = phase.status === 'done';
          const isActive = phase.status === 'active';
          return (
            <div key={phase.id} className="relative flex items-start gap-4">
              {/* Node */}
              <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                isDone ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30' :
                isActive ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/30 animate-pulse' :
                'bg-gray-800 text-gray-600 ring-2 ring-gray-700'
              }`}>
                {isDone ? '\u2713' : phase.id}
              </div>
              {/* Content */}
              <div className={`flex-1 rounded-xl border p-4 ${
                isDone ? 'bg-green-500/5 border-green-500/20' :
                isActive ? 'bg-amber-500/5 border-amber-500/20' :
                'bg-gray-900/50 border-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-sm font-semibold ${isDone ? 'text-green-400' : isActive ? 'text-amber-400' : 'text-gray-500'}`}>
                    Phase {phase.id}: {phase.name}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isDone ? 'bg-green-500/20 text-green-400' :
                    isActive ? 'bg-amber-500/20 text-amber-400' :
                    'bg-gray-800 text-gray-600'
                  }`}>
                    {phase.percent}%
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{phase.summary}</p>
                {phase.completedDate && (
                  <p className="text-[10px] text-gray-600 mt-2">Completed {phase.completedDate}</p>
                )}
                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${isDone ? 'bg-green-500' : isActive ? 'bg-amber-500' : 'bg-gray-700'}`}
                    style={{ width: `${phase.percent}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SystemCard({ system }) {
  const colors = CATEGORY_COLORS[system.category] || CATEGORY_COLORS.platform;
  const [expanded, setExpanded] = useState(false);
  const doneCount = (system.features || []).filter(f => f.status === 'done').length;
  const totalCount = (system.features || []).length;

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 hover:shadow-lg ${colors.glow} transition-all cursor-pointer`}
      onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{system.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-white">{system.name}</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{system.category}</p>
          </div>
        </div>
        <span className={`text-lg font-bold ${colors.text}`}>{system.percent}%</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">{system.description}</p>
      {/* Progress bar */}
      <div className="h-2 bg-gray-800/80 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full ${colors.bar} transition-all duration-1000`}
          style={{ width: `${system.percent}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>{doneCount}/{totalCount} features</span>
        <span className="flex items-center gap-1">
          {expanded ? '\u25B2 Less' : '\u25BC Details'}
        </span>
      </div>
      {/* Expanded feature list */}
      {expanded && system.features && system.features.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800/50 space-y-1.5">
          {system.features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 mt-0.5">{STATUS_ICONS[f.status] || '\u23F3'}</span>
              <span className={f.status === 'done' ? 'text-gray-400' : f.status === 'wip' ? 'text-amber-400' : 'text-gray-600'}>
                {f.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneTimeline({ milestones }) {
  // Group milestones by date
  const grouped = {};
  milestones.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m.text);
  });
  const dates = Object.keys(grouped).sort().reverse();

  return (
    <div className="space-y-3">
      {dates.slice(0, 8).map(date => (
        <div key={date} className="flex gap-3">
          <div className="shrink-0 w-20 text-right">
            <span className="text-[10px] text-gray-500 font-mono">{date}</span>
          </div>
          <div className="relative flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-500/20 shrink-0" />
            {dates.indexOf(date) < dates.length - 1 && <div className="w-0.5 flex-1 bg-gray-800 mt-1" />}
          </div>
          <div className="flex-1 pb-4 space-y-1">
            {grouped[date].map((text, i) => (
              <p key={i} className="text-xs text-gray-400 leading-relaxed">{text}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ value, label, icon }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center">
      <span className="text-lg mb-1 block">{icon}</span>
      <div className="text-xl font-bold text-white"><AnimatedCounter target={value} /></div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function AccessTierCard({ tier }) {
  const statusColors = {
    built: 'bg-green-500/20 text-green-400',
    partial: 'bg-amber-500/20 text-amber-400',
    planned: 'bg-gray-700 text-gray-500',
  };
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-white">{tier.name}</h4>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[tier.status] || statusColors.planned}`}>
          {tier.status}
        </span>
      </div>
      <p className="text-xs text-gray-500">{tier.description}</p>
    </div>
  );
}

function NextPriorityCard({ item }) {
  return (
    <div className="flex items-start gap-3 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
      <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: item.color + '33' }}>
        {item.id}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-white">{item.title}</h4>
        <p className="text-xs text-gray-500 mt-1">{item.description}</p>
      </div>
    </div>
  );
}

function CurrentWorkBanner({ currentWork }) {
  if (!currentWork) return null;
  const phaseProgress = currentWork.phaseProgress ?? 0;
  return (
    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/30 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/20 relative">
          <span className="text-lg">{'\u26A1'}</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-green-400 font-semibold">Now Working On</span>
            {currentWork.phase && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-mono">
                Phase {currentWork.phase}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-white">{currentWork.step}</h3>
          {currentWork.description && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{currentWork.description}</p>
          )}
          {phaseProgress > 0 && (
            <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${phaseProgress}%` }} />
            </div>
          )}
          {currentWork.startedAt && (
            <p className="text-[10px] text-gray-600 mt-2 font-mono">
              Started {new Date(currentWork.startedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockersAlert({ blockers }) {
  if (!blockers?.length) return null;
  const severityColors = {
    high:   { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-400' },
    medium: { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-400' },
    low:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-400' },
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        {'\uD83D\uDEA7'} Blockers ({blockers.length})
        <span className="text-[10px] text-gray-500 font-normal">needs user action</span>
      </h3>
      {blockers.map(b => {
        const c = severityColors[b.severity] || severityColors.medium;
        return (
          <div key={b.id} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">{'\u26A0\uFE0F'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`text-sm font-semibold ${c.text}`}>{b.title}</h4>
                  {b.severity && (
                    <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${c.badge}`}>
                      {b.severity}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-300/90 leading-relaxed whitespace-pre-wrap">{b.description}</p>
                {b.blocks && (
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    <strong>Blocks:</strong> {b.blocks}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentCommitsRow({ commits }) {
  if (!commits?.length) return null;
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        {'\uD83D\uDCDD'} Recent Commits
      </h3>
      <div className="space-y-1.5">
        {commits.slice(0, 6).map(c => (
          <div key={c.sha} className="flex items-start gap-3 text-xs py-1">
            <span className="font-mono text-green-400/70 shrink-0 w-16">{c.sha.slice(0, 7)}</span>
            <span className="text-gray-400 flex-1 leading-relaxed">{c.message}</span>
            <span className="text-[10px] text-gray-600 font-mono shrink-0">{c.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// LaunchFindingsPanel — renders the /map logbook of walkthrough bugs
// found + fixed by Claude during the L1 data-correctness audit.
function LaunchFindingsPanel({ findings }) {
  if (!findings?.length) return null;
  const sevColor = {
    critical: 'bg-red-600/25 text-red-300 border-red-500/40',
    high:     'bg-red-500/20 text-red-400 border-red-500/30',
    medium:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
    info:     'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  const statusColor = {
    fixed:       'text-green-400',
    open:        'text-amber-400',
    observed:    'text-gray-400',
    false_alarm: 'text-gray-500',
  };
  const fixedCount = findings.filter(f => f.status === 'fixed').length;
  const openCount  = findings.filter(f => f.status === 'open').length;
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            {'\uD83D\uDD0D'} Launch Walkthrough Findings
            <span className="text-[10px] font-normal text-gray-500">({findings.length} total)</span>
          </h3>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Real bugs Claude caught during the live-site audit tonight. Fixed = already shipped to cropsintel.com.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {fixedCount > 0 && <span className="text-green-400">✓ {fixedCount} fixed</span>}
          {openCount  > 0 && <span className="text-amber-400">◉ {openCount} open</span>}
        </div>
      </div>
      <div className="space-y-2">
        {findings.map(f => (
          <div key={f.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${sevColor[f.severity] || sevColor.info}`}>
                {f.severity}
              </span>
              <span className="text-[10px] text-gray-500 font-mono">{f.id}</span>
              <span className="text-[10px] text-gray-400">{f.found_at}</span>
              <span className={`ml-auto text-[10px] font-mono ${statusColor[f.status] || 'text-gray-500'}`}>
                {f.status === 'fixed' ? '✓ fixed' : f.status === 'false_alarm' ? 'false alarm' : f.status}
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{f.issue}</p>
            {f.note && <p className="text-[11px] text-gray-500 mt-1 italic leading-relaxed">{f.note}</p>}
            {f.fixCommit && f.fixCommit !== 'pending' && (
              <p className="text-[10px] text-green-400/70 mt-1 font-mono">fix: {f.fixCommit}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// NightShiftPanel — renders launchFocusPlan + nightShiftPlan blocks so
// the user can see what Claude was working on + what's queued next.
function NightShiftPanel({ launchFocus, nightShift }) {
  if (!launchFocus?.items && !nightShift?.blocks) return null;
  const statusIcon = {
    done:        '✓',
    in_progress: '…',
    queued:      '○',
    parked:      '⏸',
  };
  const statusColor = {
    done:        'text-green-400',
    in_progress: 'text-amber-400',
    queued:      'text-gray-500',
    parked:      'text-gray-600',
  };
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        {'\uD83C\uDF19'} Night-Shift Plan
      </h3>
      {launchFocus?.items?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Launch-focus queue</p>
          <div className="space-y-1.5">
            {launchFocus.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 text-xs">
                <span className={`shrink-0 w-5 text-center ${statusColor[item.status] || 'text-gray-500'}`}>
                  {statusIcon[item.status] || '○'}
                </span>
                <span className="font-mono text-[10px] text-gray-500 w-6">{item.id}</span>
                <span className={`flex-1 ${item.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-300'}`}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {nightShift?.blocks?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
            Night-shift blocks {nightShift.note ? '(vision scaffolds — see note)' : ''}
          </p>
          <div className="space-y-1">
            {nightShift.blocks.map(b => (
              <div key={b.id} className="flex items-center gap-3 text-[11px]">
                <span className={`shrink-0 w-5 text-center ${statusColor[b.status] || 'text-gray-500'}`}>
                  {statusIcon[b.status] || '○'}
                </span>
                <span className="text-gray-500 w-4">{b.id}</span>
                <span className={`flex-1 ${b.status === 'done' ? 'text-gray-400 line-through' : b.status === 'parked' ? 'text-gray-500 italic' : 'text-gray-300'}`}>
                  {b.name}
                </span>
              </div>
            ))}
          </div>
          {nightShift.note && <p className="text-[10px] text-gray-600 mt-2 italic">{nightShift.note}</p>}
        </div>
      )}
    </div>
  );
}

// MonitorBotPanel — renders public/monitor-log.json (findings from the
// background self-audit agent). Empty-state when the agent hasn't run yet.
function MonitorBotPanel({ monitorLog }) {
  if (!monitorLog) {
    return (
      <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          {'\uD83E\uDD16'} Monitor Bot
        </h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Background self-audit agent. Walks the public site, scans for error signals, reports findings back to Claude.
          Shipped MVP 2026-04-24 — see <code>scripts/monitor-agent.js</code>. Runs will start streaming here after workflow wiring (Phase 10 also adds the auto-fix loop behind founder WhatsApp+OTP gate).
        </p>
      </div>
    );
  }
  const { totals = {}, entries = [], generated_at } = monitorLog;
  const failing = entries.filter(e => !e.ok || e.findings?.length > 0);
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            {'\uD83E\uDD16'} Monitor Bot — latest run
          </h3>
          <p className="text-[10px] text-gray-600 mt-0.5 font-mono">{generated_at}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-400">✓ {totals.ok_count || 0}/{totals.routes_checked || 0} OK</span>
          {totals.findings_count > 0 && <span className="text-amber-400">{totals.findings_count} findings</span>}
        </div>
      </div>
      {failing.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No active findings. All {totals.routes_checked || 0} scanned routes are clean.</p>
      ) : (
        <div className="space-y-1.5">
          {failing.slice(0, 10).map(e => (
            <div key={e.route} className="flex items-center gap-3 text-[11px]">
              <span className={`shrink-0 font-mono ${e.ok ? 'text-amber-400' : 'text-red-400'}`}>
                {e.status ?? 'ERR'}
              </span>
              <span className="text-gray-400 flex-1 truncate">{e.route}</span>
              <span className="text-gray-500">{e.findings?.length || 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectMap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastRefresh, setLastRefresh] = useState(null);

  const [monitorLog, setMonitorLog] = useState(null);
  const fetchData = async () => {
    try {
      const [progressRes, monitorRes] = await Promise.all([
        fetch('/progress.json?t=' + Date.now()),
        fetch('/monitor-log.json?t=' + Date.now()).catch(() => null),
      ]);
      const json = await progressRes.json();
      setData(json);
      if (monitorRes && monitorRes.ok) {
        try {
          const ml = await monitorRes.json();
          setMonitorLog(ml);
        } catch { /* ignore */ }
      }
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load progress.json:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading project map...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <p className="text-red-400 text-sm">Failed to load progress data</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '\uD83D\uDCCA' },
    { id: 'systems', label: 'Systems', icon: '\u2699\uFE0F' },
    { id: 'timeline', label: 'Timeline', icon: '\uD83D\uDCC5' },
    { id: 'migration', label: 'V2 Migration', icon: '\uD83D\uDE80' },
  ];

  // Category grouping for systems
  const categories = ['data', 'ai', 'users', 'platform', 'future'];
  const categoryLabels = { data: 'Data & Intelligence', ai: 'AI Systems', users: 'Users & CRM', platform: 'Platform', future: 'Future' };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-lg">
              {'\uD83D\uDDFA\uFE0F'}
            </span>
            Project Map
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            CropsIntel V2 — Live Progress Tracker
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live — refreshes every 30s
          </div>
          {lastRefresh && (
            <span className="text-[10px] text-gray-700 font-mono">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded border border-gray-800 hover:border-gray-600 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Now Working On — live session banner */}
      <CurrentWorkBanner currentWork={data.currentWork} />

      {/* Blockers — only renders when something needs user action */}
      <BlockersAlert blockers={data.blockers} />

      {/* Hero stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1 bg-gray-900/50 border border-gray-800 rounded-xl p-6 flex items-center justify-center">
          <CircularProgress percent={data.overallPercent} size={140} label="overall" />
        </div>
        <div className="col-span-2 md:col-span-1 bg-gray-900/50 border border-gray-800 rounded-xl p-6 flex items-center justify-center">
          <CircularProgress percent={data.targetPercent} size={140} color="#f59e0b" label="target" />
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-3">
          <StatCard value={data.stats.pagesLive || 0} label="Pages Live" icon={'\uD83D\uDCC4'} />
          <StatCard value={data.stats.realReports || data.stats.positionReports || 0} label="Position Reports" icon={'\uD83D\uDCCA'} />
          <StatCard value={data.stats.countriesTracked || data.stats.countriesTargeted || 0} label="Countries Targeted" icon={'\uD83C\uDF0D'} />
          <StatCard value={data.stats.usersImported || 0} label="Users" icon={'\uD83D\uDC65'} />
          <StatCard value={data.stats.loginMethods || 0} label="Login Methods" icon={'\uD83D\uDD10'} />
          <StatCard value={data.stats.cropYears || data.stats.cropYearsPositionReports || 0} label="Crop Years" icon={'\uD83C\uDF3E'} />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-xl p-1">
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-gray-500 hover:text-white hover:bg-gray-800/50'
            }`}>
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Phases */}
          <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              {'\uD83C\uDFAF'} Phase Progress
            </h2>
            <PhaseTimeline phases={data.phases} />
          </div>
          {/* Next priorities */}
          <div className="space-y-6">
            <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {'\uD83D\uDD25'} Next Priorities
              </h2>
              <div className="space-y-3">
                {data.nextPriorities.map(p => <NextPriorityCard key={p.id} item={p} />)}
              </div>
            </div>
            <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {'\uD83D\uDD10'} Access Tiers
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {data.accessTiers.map(t => <AccessTierCard key={t.id} tier={t} />)}
              </div>
            </div>
            {/* Night-shift plan + Launch findings + Monitor Bot — night-shift session panels */}
            <NightShiftPanel launchFocus={data.launchFocusPlan} nightShift={data.nightShiftPlan} />
            <LaunchFindingsPanel findings={data.launchFindings} />
            <MonitorBotPanel monitorLog={monitorLog} />

            {/* Recent commits — small chip list, only renders when present */}
            <RecentCommitsRow commits={data.recentCommits} />
          </div>
        </div>
      )}

      {activeTab === 'systems' && (
        <div className="space-y-8">
          {categories.map(cat => {
            const systems = data.systems.filter(s => s.category === cat);
            if (systems.length === 0) return null;
            return (
              <div key={cat}>
                <h2 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${CATEGORY_COLORS[cat]?.text || 'text-gray-400'}`}>
                  <div className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[cat]?.bar || 'bg-gray-500'}`} />
                  {categoryLabels[cat]}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {systems.map(s => <SystemCard key={s.id} system={s} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            {'\uD83D\uDCC5'} Milestone Timeline
          </h2>
          <MilestoneTimeline milestones={data.milestones} />
        </div>
      )}

      {activeTab === 'migration' && data.v2Migration && (
        <div className="space-y-6">
          <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{data.v2Migration.title}</h2>
                <p className="text-xs text-gray-500 mt-1">{data.v2Migration.description}</p>
              </div>
              <CircularProgress percent={data.v2Migration.overallPercent} size={80} strokeWidth={6} color="#8b5cf6" label="v2" />
            </div>
            {data.v2Migration.actionRequired && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-400 flex items-center gap-2">
                  {'\u26A0\uFE0F'} <strong>Action Required:</strong> {data.v2Migration.actionRequired}
                </p>
              </div>
            )}
          </div>
          {/* Migration items */}
          <div className="bg-gray-900/30 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Migration Checklist</h3>
            <div className="space-y-2">
              {data.v2Migration.items.map(item => {
                const isDone = item.status === 'done';
                const isHigh = item.priority === 'high';
                return (
                  <div key={item.id} className={`flex items-start gap-3 rounded-lg p-3 ${
                    isDone ? 'bg-green-500/5' : isHigh ? 'bg-red-500/5' : 'bg-gray-800/30'
                  }`}>
                    <span className="text-sm mt-0.5">{isDone ? '\u2705' : isHigh ? '\uD83D\uDD34' : '\u23F3'}</span>
                    <div className="flex-1">
                      <p className={`text-xs ${isDone ? 'text-gray-400 line-through' : 'text-white'}`}>{item.name}</p>
                      {item.date && <p className="text-[10px] text-gray-600 mt-0.5">{item.date}</p>}
                      {item.note && !isDone && <p className="text-[10px] text-amber-500 mt-0.5">{item.note}</p>}
                    </div>
                    {item.priority && !isDone && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        isHigh ? 'bg-red-500/20 text-red-400' :
                        item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-gray-700 text-gray-500'
                      }`}>{item.priority}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-6 border-t border-gray-800">
        <p className="text-[10px] text-gray-600">
          Last updated: {data.lastUpdated} | {data.updatedBy} | Session: {data.sessionStatus}
        </p>
      </div>
    </div>
  );
}
