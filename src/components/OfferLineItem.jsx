// CropsIntelV2 — OfferLineItem
// A single product row in the offer builder. Previously inlined in Trading.jsx
// (lines ~370-451); extracted so the Buyer/Supplier portals can reuse the
// exact same widget for quote review, and so per-line UX improvements (margin
// delta, price-source pill) land in one place.
//
// New vs V2 inline version:
//   - Margin delta chip: shows `+$0.12/lb` alongside the margin %
//   - Strata coverage pill: live / fallback / default with tint
//   - Reorder handles (up/down) when multi-line
//   - Compact/full display modes (compact for preview modal)
//
// Props:
//   item       — enriched line item (via offerCalcs.enrichItem)
//   index      — 1-based product number
//   total      — total count of line items (to hide remove when only one)
//   readOnly   — boolean, hide edit controls for preview
//   onChange   — (patch) => void
//   onRemove   — () => void
//   onMoveUp   — () => void  (optional — enables the ↑ button)
//   onMoveDown — () => void  (optional — enables the ↓ button)
//
// Created: 2026-04-24 (Wave 2 offer-builder rebuild)

import React from 'react';
import { VARIETIES, GRADES, fmtUSD } from '../lib/offerCalcs';

const SOURCE_PILL = {
  live:     { label: 'live Strata',     cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  fallback: { label: 'fallback price',  cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  default:  { label: 'default \$3.50',  cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

export default function OfferLineItem({
  item,
  index = 1,
  total = 1,
  readOnly = false,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  compact = false,
}) {
  const src = SOURCE_PILL[item.priceSource] || SOURCE_PILL.default;

  // Colour the margin delta chip by sign — green when positive, red when negative
  const marginSign = item.marginPerLb >= 0 ? '+' : '';
  const marginChipCls = item.marginPerLb >= 0
    ? 'text-green-400 bg-green-500/10 border-green-500/20'
    : 'text-red-400 bg-red-500/10 border-red-500/20';

  return (
    <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-3">
      {/* Header row: product label + source pill + controls */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
            Product {index}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${src.cls}`}>
            {src.label}
          </span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2 shrink-0">
            {onMoveUp && (
              <button
                onClick={onMoveUp}
                disabled={index === 1}
                className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                ↑
              </button>
            )}
            {onMoveDown && (
              <button
                onClick={onMoveDown}
                disabled={index === total}
                className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                ↓
              </button>
            )}
            {total > 1 && onRemove && (
              <button
                onClick={onRemove}
                className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                title="Remove this product"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit grid — varieties, grades, volume, margin */}
      {!readOnly && !compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Variety</label>
            <select
              value={item.variety}
              onChange={e => onChange({ variety: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
            >
              {VARIETIES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Grade / Form</label>
            <select
              value={item.grade}
              onChange={e => onChange({ grade: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Volume (MT)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={item.volumeMT}
              onChange={e => onChange({ volumeMT: Number(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 flex items-center justify-between">
              <span>Margin %</span>
              {item.marginPerLb !== 0 && (
                <span className={`text-[9px] px-1 py-0 rounded border font-mono ${marginChipCls}`}>
                  {marginSign}{fmtUSD(Math.abs(item.marginPerLb)).replace('$', '$')}/lb
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.5"
              value={item.marginPct}
              onChange={e => onChange({ marginPct: Number(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
        </div>
      )}

      {/* Read-only / compact header — variety grade + volume only */}
      {(readOnly || compact) && (
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-white font-medium">
            {item.variety} · {item.grade}
          </span>
          <span className="text-gray-400 font-mono">
            {item.volumeMT.toLocaleString()} MT
          </span>
        </div>
      )}

      {/* Per-line price preview (always visible) */}
      <div className={`grid grid-cols-2 ${compact ? '' : 'md:grid-cols-4'} gap-2 ${compact ? '' : 'mt-2'} text-[11px] text-gray-400`}>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Strata ref</span>
          <span className="font-mono text-white">{fmtUSD(item.basePrice)}/lb</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">MAXONS</span>
          <span className="font-mono text-green-400">{fmtUSD(item.maxonsPrice)}/lb</span>
        </div>
        {!compact && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Volume</span>
            <span className="font-mono text-white">{item.volumeLbs.toLocaleString()} lbs</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Line total</span>
          <span className="font-mono text-white font-semibold">
            {fmtUSD(item.lineRevenue, { compact: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
