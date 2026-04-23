// CropsIntelV2 — Premium Card primitive
// One consistent surface for every widget across the app. Replaces the scattered
// `bg-gray-900/50 border border-gray-800 rounded-xl p-5` repetitions.
//
// Design principles (user directive 2026-04-24: "premium" + "professional"):
//   - Glass-dark surface with subtle gradient top highlight
//   - Hover lift (hairline border glow) — feels tactile
//   - Optional title + subtitle + action slot so every page can use the same shell
//   - Tone variants for accent panels (green/amber/red/blue)
//
// Usage:
//   <Card title="Supply Trend" subtitle="2020/21 → 2025/26" action={<Button>Export</Button>}>
//     <Chart ... />
//   </Card>
//
//   <Card tone="green" title="Launch Ready" padding="md">…</Card>
//
//   <Card.Stat label="Total Shipments" value="2.5B lbs" delta="+12%" />

import React from 'react';

const TONES = {
  default: 'bg-gray-900/50 border-gray-800 hover:border-gray-700',
  green:   'bg-green-500/5 border-green-500/20 hover:border-green-500/40',
  amber:   'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40',
  red:     'bg-red-500/5 border-red-500/20 hover:border-red-500/40',
  blue:    'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40',
  indigo:  'bg-indigo-500/5 border-indigo-500/20 hover:border-indigo-500/40',
  // "flush" variant — no hover lift, for nested content or dense grids
  flush:   'bg-gray-900/40 border-gray-800/60',
};

const PADDING = {
  none: 'p-0',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-5', // default — matches existing codebase density
  xl:   'p-6',
};

/**
 * Base Card — generic surface.
 */
function Card({
  children,
  className = '',
  title,
  subtitle,
  action,
  tone = 'default',
  padding = 'lg',
  interactive = false,
  as: Tag = 'div',
  ...rest
}) {
  const toneClass = TONES[tone] || TONES.default;
  const padClass = PADDING[padding] || PADDING.lg;
  const hoverClass = interactive
    ? 'cursor-pointer hover:shadow-lg hover:shadow-green-500/5 hover:-translate-y-0.5'
    : '';

  return (
    <Tag
      className={`relative border rounded-xl transition-all duration-200 ${toneClass} ${padClass} ${hoverClass} ${className}`}
      {...rest}
    >
      {/* Subtle top-highlight for glass feel */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-t-xl"
      />
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-white leading-tight truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/**
 * Card.Stat — KPI variant. Label + big value + optional delta chip.
 */
function Stat({ label, value, delta, deltaTone, icon, className = '' }) {
  const deltaColor =
    deltaTone === 'up' || (typeof delta === 'string' && delta.startsWith('+'))
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : deltaTone === 'down' || (typeof delta === 'string' && delta.startsWith('-'))
      ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : 'text-gray-400 bg-gray-800/60 border-gray-700';

  return (
    <Card className={className} padding="md">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
          {label}
        </p>
        {icon && <span className="text-base leading-none opacity-70">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        {delta && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${deltaColor}`}
          >
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Card.Section — header strip for grouping cards on a page (replaces the
 * inconsistent <h2>/<div>/<p> triplets used all over pages/*.jsx).
 */
function Section({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold text-white">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

Card.Stat = Stat;
Card.Section = Section;

export default Card;
export { Card, Stat as CardStat, Section as CardSection };
