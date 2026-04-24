// MarketPulseBand — the "what's moving the market right now" strip.
//
// User directive 2026-04-24: "dashboard widgets are scattered and too much
// free space there, there should be some widgets which are change and
// market momentum changers on the dashboard."
//
// This sits near the top of the dashboard and shows 6 compact momentum
// cells — each one a single number + delta + mini label so a trader can
// scan the dashboard in 2 seconds and know what shifted today.
//
// Takes pre-computed props (parent does the math) so the component stays
// pure + easy to reason about.

import React from 'react';
import { Link } from 'react-router-dom';

function PulseCell({ label, value, delta, deltaLabel, tone = 'neutral', hint, href, icon }) {
  const deltaColor =
    tone === 'bullish' ? 'text-green-400' :
    tone === 'bearish' ? 'text-red-400' :
    'text-gray-400';
  const valueColor =
    tone === 'bullish' ? 'text-green-300' :
    tone === 'bearish' ? 'text-red-300' :
    'text-white';
  const borderAccent =
    tone === 'bullish' ? 'border-l-green-500/50' :
    tone === 'bearish' ? 'border-l-red-500/50' :
    'border-l-gray-700';

  const inner = (
    <div
      className={`h-full bg-gray-900/60 border border-gray-800 ${borderAccent} border-l-2 rounded-lg p-2.5 hover:border-gray-600 transition-colors group`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-sm leading-none opacity-80">{icon}</span>}
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold truncate">
          {label}
        </p>
      </div>
      <p className={`text-base lg:text-lg font-bold leading-tight ${valueColor}`}>
        {value}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        {delta != null && (
          <span className={`text-[11px] font-mono font-medium ${deltaColor}`}>
            {delta}
          </span>
        )}
        {deltaLabel && (
          <span className="text-[10px] text-gray-500 truncate">{deltaLabel}</span>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-gray-600 mt-1 truncate" title={hint}>{hint}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function MarketPulseBand({ pulses = [] }) {
  if (!pulses.length) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Market Pulse
          </h3>
          <span className="text-[10px] text-gray-600">what moved since last update</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {pulses.map((p, i) => (
          <PulseCell key={i} {...p} />
        ))}
      </div>
    </div>
  );
}
