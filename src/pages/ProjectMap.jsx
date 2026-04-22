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
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setCount(start);
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
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

export default function ProjectMap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/progress.json?t=' + Date.now());
      const json = await res.json();
      setData(json);
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

      {/* Hero stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1 bg-gray-900/50 border border-gray-800 rounded-xl p-6 flex items-center justify-center">
          <CircularProgress percent={data.overallPercent} size={140} label="overall" />
        </div>
        <div className="col-span-2 md:col-span-1 bg-gray-900/50 border border-gray-800 rounded-xl p-6 flex items-center justify-center">
          <CircularProgress percent={data.targetPercent} size={140} color="#f59e0b" label="target" />
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-3">
          <StatCard value={data.stats.pagesLive} label="Pages Live" icon={'\uD83D\uDCC4'} />
          <StatCard value={data.stats.realReports} label="Reports" icon={'\uD83D\uDCCA'} />
          <StatCard value={data.stats.countriesTracked} label="Countries" icon={'\uD83C\uDF0D'} />
          <StatCard value={data.stats.usersImported} label="Users" icon={'\uD83D\uDC65'} />
          <StatCard value={data.stats.loginMethods} label="Login Methods" icon={'\uD83D\uDD10'} />
          <StatCard value={data.stats.cropYears} label="Crop Years" icon={'\uD83C\uDF3E'} />
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
