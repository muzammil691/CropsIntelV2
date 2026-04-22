// Reusable chip-filter bar + compare toggle.
//
// Pattern extracted from /analysis page (the reference implementation for
// "widget interactivity" rule — every widget on every tab needs relevant
// filters + user-driven compare).
//
// Usage:
//   <FilterBar
//     label="Crop Year"
//     options={[{ value: '2024/25', label: '2024/25', color: '#ef4444' }, ...]}
//     selected={['2024/25', '2025/26']}
//     onToggle={value => ...}
//     quickActions={[
//       { label: 'All', action: () => setSelected(allValues) },
//       { label: 'Last 3', action: () => setSelected(allValues.slice(-3)) }
//     ]}
//   />

import React from 'react';

export function FilterChip({ value, label, active, color = '#888', onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'text-white border'
          : 'bg-gray-800/50 text-gray-500 border border-gray-800 hover:border-gray-600'
      }`}
      style={active ? {
        backgroundColor: color + '20',
        borderColor: color + '60',
        color,
      } : undefined}
    >
      {label}
    </button>
  );
}

export function QuickAction({ label, onClick, dimmed = true }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
        dimmed
          ? 'text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300'
          : 'text-white bg-gray-700 border-gray-700 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Chip multi-select filter bar with optional quick-action buttons on the right.
 * Works for compare-by-year, compare-by-variety, compare-by-country, etc.
 */
export default function FilterBar({
  label,
  options = [],
  selected = [],
  onToggle,
  quickActions = [],
  emptyHint = 'Select at least one to compare',
}) {
  return (
    <div className="mb-6">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            {label}
          </span>
          {selected.length === 0 && emptyHint && (
            <span className="text-[10px] text-amber-400/70">{emptyHint}</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <FilterChip
            key={opt.value}
            value={opt.value}
            label={opt.label}
            active={selected.includes(opt.value)}
            color={opt.color}
            onClick={() => onToggle?.(opt.value)}
          />
        ))}
        {quickActions.map((qa, i) => (
          <QuickAction key={i} label={qa.label} onClick={qa.action} />
        ))}
      </div>
    </div>
  );
}

/**
 * Single-value select chip bar (like a tab group). Clicking a chip replaces
 * the selection instead of toggling.
 */
export function SingleSelectBar({ label, options = [], value, onChange }) {
  return (
    <div className="mb-4">
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block mb-2">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <FilterChip
            key={opt.value}
            value={opt.value}
            label={opt.label}
            active={value === opt.value}
            color={opt.color}
            onClick={() => onChange?.(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Shared color palette for crop years — matches Analysis.jsx CROP_COLORS
 * so re-used widgets stay visually consistent across pages.
 */
export const CROP_YEAR_COLORS = {
  '2015/16': '#4f46e5', '2016/17': '#6366f1', '2017/18': '#8b5cf6', '2018/19': '#a855f7',
  '2019/20': '#06b6d4', '2020/21': '#14b8a6', '2021/22': '#22c55e',
  '2022/23': '#eab308', '2023/24': '#f97316', '2024/25': '#ef4444',
  '2025/26': '#3b82f6',
};

export const VARIETY_COLORS = {
  'Nonpareil':     '#3b82f6',
  'Independence':  '#22c55e',
  'Monterey':      '#a855f7',
  'Butte/Padre':   '#f59e0b',
  'Butte':         '#f59e0b',
  'Padre':         '#d97706',
  'Fritz':         '#06b6d4',
  'Carmel':        '#ef4444',
  'Wood Colony':   '#10b981',
  'Aldrich':       '#eab308',
  'Sonora':        '#f43f5e',
  'Price':         '#8b5cf6',
  'Winters':       '#14b8a6',
  'Avalon':        '#ec4899',
  'Supareil':      '#6366f1',
  'Shasta':        '#84cc16',
  'Merced':        '#f97316',
  'Mission':       '#64748b',
  'All Other':     '#6b7280',
};
