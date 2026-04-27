// CropsIntel V2 — SearchableMultiSelect
// W5 (2026-04-27): high-cardinality multi-select with autocomplete dropdown.
//
// Use case: the user has asked multiple times for a "dropdown with search and
// click-to-add" picker for destination countries (40+ options). FilterBar.jsx
// renders chips and works well up to ~15 options, but doesn't scale.
//
// Props:
//   options       Array<{ value: string, label: string, group?: string,
//                         color?: string, meta?: string }>
//   selected      Array<string>                — currently-picked values
//   onChange      (Array<string>) => void      — fires with the new selection
//   label         string                       — section heading
//   placeholder   string                       — input placeholder
//   maxSelected   number?                      — soft cap; warn but don't block
//   quickActions  Array<{ label: string, action: () => void }>?
//   emptyHint     string?                      — shown when nothing picked yet
//
// Behaviour:
//   - Type to filter dropdown (case-insensitive substring on label + meta).
//   - Click an option to add. ↑/↓ to navigate, Enter to add focused option.
//   - Already-selected options stay in the list but render greyed-out and
//     a click on a selected row REMOVES it (so the dropdown doubles as a
//     toggle list — the same UX pattern as Notion / Linear).
//   - Selected items appear as removable chips above the input. × removes.
//   - Esc closes the dropdown without changing selection.
//   - Click outside the component closes the dropdown.
//
// No external dependency — pure React + Tailwind. ~190 LOC.

import React, { useState, useRef, useEffect, useMemo } from 'react';

export default function SearchableMultiSelect({
  options = [],
  selected = [],
  onChange,
  label,
  placeholder = 'Type to search…',
  maxSelected = null,
  quickActions = [],
  emptyHint = 'Nothing selected yet',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Filtered list — matches label OR meta substring (case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => {
      const hay = `${o.label} ${o.meta || ''} ${o.group || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  // Reset focus when filter changes
  useEffect(() => { setFocusIdx(0); }, [query, open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (value) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      if (maxSelected != null && selected.length >= maxSelected) return;
      onChange([...selected, value]);
    }
  };

  const remove = (value) => onChange(selected.filter(v => v !== value));
  const clear = () => onChange([]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx(i => Math.min(i + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[focusIdx];
      if (opt) {
        toggle(opt.value);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Backspace' && !query && selected.length > 0) {
      // Backspace on empty input removes the last selected chip
      onChange(selected.slice(0, -1));
    }
  };

  // Reverse-lookup labels for selected values so chips show pretty names
  const labelByValue = useMemo(() => {
    const m = new Map();
    options.forEach(o => m.set(o.value, o.label));
    return m;
  }, [options]);

  return (
    <div className="mb-4" ref={wrapperRef}>
      {label && (
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-xs text-gray-400 font-medium">{label}</p>
          <div className="flex items-center gap-1.5">
            {quickActions.map(qa => (
              <button
                key={qa.label}
                onClick={qa.action}
                type="button"
                className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
              >
                {qa.label}
              </button>
            ))}
            {selected.length > 0 && (
              <button
                onClick={clear}
                type="button"
                className="px-2 py-1 text-[10px] uppercase tracking-wider text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded transition-colors"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(v => {
            const opt = options.find(o => o.value === v);
            const color = opt?.color;
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs text-white"
                style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
              >
                {labelByValue.get(v) || v}
                <button
                  onClick={() => remove(v)}
                  type="button"
                  aria-label={`Remove ${labelByValue.get(v) || v}`}
                  className="text-gray-500 hover:text-red-400 transition-colors leading-none"
                >×</button>
              </span>
            );
          })}
        </div>
      ) : (
        emptyHint && <p className="text-[11px] text-gray-600 mb-2">{emptyHint}</p>
      )}

      {/* Search input + dropdown */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
        />
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500">
                No matches for &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = selectedSet.has(opt.value);
                const isFocused = i === focusIdx;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { toggle(opt.value); inputRef.current?.focus(); }}
                    onMouseEnter={() => setFocusIdx(i)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                      isFocused ? 'bg-gray-800' : ''
                    } ${
                      isSelected ? 'text-gray-500' : 'text-white hover:bg-gray-800'
                    }`}
                    style={opt.color ? { borderLeftColor: opt.color, borderLeftWidth: 3 } : undefined}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-gray-600'
                    }`}>
                      {isSelected ? '✓' : ''}
                    </span>
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.meta && (
                      <span className="text-[10px] text-gray-500 shrink-0">{opt.meta}</span>
                    )}
                    {opt.group && !opt.meta && (
                      <span className="text-[10px] text-gray-600 shrink-0">{opt.group}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
