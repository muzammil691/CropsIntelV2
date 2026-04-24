// Reusable metric toggle chip-bar.
//
// Lets any widget expose the "multi-metric view" treatment the user asked
// for: a user-driven switch between Volume lbs / Containers / MT / YoY %
// etc. Each page wires the active metric into its Recharts tickFormatter,
// Tooltip formatter, and axis label so the SAME chart re-paints in a new
// unit without re-fetching data.
//
// Usage:
//   const [metric, setMetric] = useState('lbs');
//   <MetricToggle
//     metrics={VOLUME_METRICS}
//     value={metric}
//     onChange={setMetric}
//   />
//
// Pair with getMetric(key) from src/lib/continents.js to grab the active
// metric's formatter + transform functions.

import React from 'react';

export default function MetricToggle({
  metrics = [],
  value,
  onChange,
  label = 'Metric',
  compact = false,
}) {
  if (!metrics.length) return null;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${compact ? '' : 'mb-3'}`}>
      {label && !compact && (
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mr-1">
          {label}
        </span>
      )}
      <div className="inline-flex rounded-lg border border-gray-800 bg-gray-900/50 p-0.5">
        {metrics.map(m => (
          <button
            key={m.key}
            onClick={() => onChange?.(m.key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              value === m.key
                ? 'bg-green-500/20 text-green-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={m.label}
          >
            {compact ? (m.short || m.label) : m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
