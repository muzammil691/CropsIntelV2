// CropsIntelV2 — OfferBuilder
// The full multi-product offer builder. Extracted from Trading.jsx (lines
// 346-627 of the pre-rebuild file) so:
//   - Testable in isolation
//   - Reusable in Buyer portal (future: "counter-offer" flow)
//   - Easier to reason about — Trading.jsx shrinks from 846 to <400 lines
//
// New vs V2 inline version:
//   1. Strata coverage banner at top ("12/15 live Strata · 3 fallback")
//   2. Incoterm warning chip when CIF without freight, etc.
//   3. Preview modal: review full offer before commit to DB
//   4. Live per-unit margin delta on each line (via OfferLineItem)
//   5. Landed-cost-per-lb readout on summary (what buyer actually pays per lb)
//   6. Line reorder via ↑↓ buttons
//
// Props:
//   contacts        — CRM contacts for buyer dropdown
//   stratamap       — live Strata price map (variety-grade → usd/lb)
//   onSave(payload) — async (payload) => dealRow — caller handles DB insert
//   saving          — bool, disables submit while save in flight
//
// Created: 2026-04-24 (Wave 2 offer-builder rebuild)

import React, { useState, useMemo } from 'react';
import {
  INCOTERMS, PACKAGING,
  makeBlankItem, enrichItem,
  computeOfferTotals, incotermWarnings, strataCoverage,
  validateOffer, buildOfferPayload,
  fmtUSD,
} from '../lib/offerCalcs';
import OfferLineItem from './OfferLineItem';

export default function OfferBuilder({
  contacts = [],
  stratamap = {},
  userId,
  onSave,
  saving = false,
  saveMsg = '',
}) {
  // ─── Line items ─────────────────────────────────────────────
  const [items, setItems] = useState([makeBlankItem()]);

  // ─── Offer-level fields ─────────────────────────────────────
  const [incoterm,     setIncoterm]     = useState('CIF');
  const [destination,  setDestination]  = useState('');
  const [packaging,    setPackaging]    = useState('25 kg cartons');
  const [notes,        setNotes]        = useState('');
  const [buyer,        setBuyer]        = useState('');
  const [contactId,    setContactId]    = useState('');
  const [shipDate,     setShipDate]     = useState('');
  const [freightUSD,   setFreightUSD]   = useState(0);
  const [insuranceUSD, setInsuranceUSD] = useState(0);

  // ─── Preview modal state ────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [localErrors, setLocalErrors] = useState([]);

  // ─── Derived (memo so enrichment only re-runs on meaningful changes) ──
  const enrichedItems = useMemo(
    () => items.map(it => enrichItem(it, stratamap)),
    [items, stratamap]
  );
  const totals   = useMemo(
    () => computeOfferTotals(enrichedItems, { freightUSD, insuranceUSD }),
    [enrichedItems, freightUSD, insuranceUSD]
  );
  const warnings = useMemo(
    () => incotermWarnings({ incoterm, freightUSD, insuranceUSD }),
    [incoterm, freightUSD, insuranceUSD]
  );
  const coverage = useMemo(() => strataCoverage(enrichedItems), [enrichedItems]);

  // ─── Item mutators ──────────────────────────────────────────
  function updateItem(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }
  function addItem() {
    setItems(prev => [...prev, makeBlankItem()]);
  }
  function removeItem(id) {
    setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev);
  }
  function moveItem(id, direction) {
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  // ─── Preview + save ─────────────────────────────────────────
  function openPreview() {
    const validation = validateOffer({ enrichedItems, buyer, contactId, incoterm, destination });
    setLocalErrors(validation.errors);
    if (!validation.ok) return;
    setShowPreview(true);
  }

  async function confirmSave() {
    setShowPreview(false);
    const payload = buildOfferPayload({
      enrichedItems, totals,
      freightUSD, insuranceUSD,
      incoterm, destination, shipDate, packaging,
      buyer, contactId, notes, userId,
    });
    try {
      const saved = await onSave(payload);
      if (saved) {
        // Reset form
        setBuyer(''); setDestination(''); setNotes(''); setContactId(''); setShipDate('');
        setFreightUSD(0); setInsuranceUSD(0);
        setItems([makeBlankItem()]);
      }
    } catch (err) {
      // Error handling delegated to parent (via saveMsg prop)
      console.error('confirmSave failed:', err);
    }
  }

  // ─── Coverage banner palette ────────────────────────────────
  const coverageBannerCls = coverage.isFullyLive
    ? 'bg-green-500/10 border-green-500/30 text-green-300'
    : coverage.livePct >= 50
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
    : 'bg-red-500/10 border-red-500/30 text-red-300';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ─── Builder form ────────────────────────────────────── */}
      <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Build New Offer</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Add one or more products. Each line pulls its Strata reference price live.
            </p>
          </div>
          <button
            onClick={addItem}
            className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 text-green-300 border border-green-500/40 rounded-lg text-xs font-medium transition-colors"
          >
            + Add product
          </button>
        </div>

        {/* ─── Strata coverage banner ─────────────────────── */}
        <div className={`text-[11px] px-3 py-2 rounded-lg border ${coverageBannerCls}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Strata coverage: {coverage.live}/{coverage.total} live · {coverage.fallback} fallback · {coverage.default || 0} default
            </span>
            <span className="font-mono">
              {coverage.livePct}% live
            </span>
          </div>
          {!coverage.isFullyLive && (
            <p className="text-[10px] opacity-80 mt-0.5">
              {coverage.default > 0
                ? 'Some combos defaulted to $3.50/lb — run strata-scraper or pick a different grade.'
                : 'Some combos used fallback prices — live data unavailable for these grades right now.'}
            </p>
          )}
        </div>

        {/* ─── Line items ─────────────────────────────────── */}
        <div className="space-y-3">
          {enrichedItems.map((it, idx) => (
            <OfferLineItem
              key={it.id}
              item={it}
              index={idx + 1}
              total={items.length}
              onChange={patch => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onMoveUp={items.length > 1 ? () => moveItem(it.id, 'up') : undefined}
              onMoveDown={items.length > 1 ? () => moveItem(it.id, 'down') : undefined}
            />
          ))}
        </div>

        {/* ─── Offer-level fields ──────────────────────────── */}
        <div className="border-t border-gray-800 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">CRM Contact (Buyer)</label>
              <select value={contactId} onChange={e => {
                setContactId(e.target.value);
                const c = contacts.find(x => x.id === e.target.value);
                if (c) setBuyer(`${c.contact_name} — ${c.company_name}`);
              }} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Select from CRM...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.company_name} — {c.contact_name} ({c.country})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Or Type Buyer Name</label>
              <input
                type="text"
                value={buyer}
                onChange={e => setBuyer(e.target.value)}
                placeholder="Contact or company name"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Incoterm</label>
              <select value={incoterm} onChange={e => setIncoterm(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Destination Port</label>
              <input
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="e.g. Jebel Ali, Mumbai"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Estimated Ship Date</label>
              <input
                type="date"
                value={shipDate}
                onChange={e => setShipDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          {/* Freight + insurance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                Freight (USD total) <span className="text-gray-600">— blank if Ex-Works / FOB</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  value={freightUSD}
                  onChange={e => setFreightUSD(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                Insurance (USD total) <span className="text-gray-600">— CIF / CIP typically</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  value={insuranceUSD}
                  onChange={e => setInsuranceUSD(Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Incoterm warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                  <span className="text-amber-400">⚠</span>
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Packaging</label>
              <select value={packaging} onChange={e => setPackaging(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                {PACKAGING.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Payment terms, special conditions..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
          </div>

          {/* Validation errors (pre-preview) */}
          {localErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-1">
              {localErrors.map((e, i) => (
                <p key={i} className="text-[11px] text-red-300">• {e}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={openPreview}
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : `Review Offer${items.length > 1 ? ` (${items.length} products)` : ''}`}
            </button>
            {saveMsg && (
              <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Summary sidebar ─────────────────────────────────── */}
      <div className="space-y-4">
        {/* Per-item breakdown */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Offer Breakdown</h3>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {enrichedItems.map((it, idx) => (
              <div key={it.id} className="text-[11px] border-b border-gray-800 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">#{idx + 1} {it.variety} {it.grade}</span>
                  <span className="font-mono text-white">{fmtUSD(it.lineRevenue, { compact: true })}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>{it.volumeMT} MT · {fmtUSD(it.maxonsPrice)}/lb</span>
                  <span className="text-green-500/70">+{fmtUSD(it.lineMargin, { compact: true })} margin</span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 mt-3 pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-white font-mono">{fmtUSD(totals.subtotalRevenue, { compact: true })}</span>
            </div>
            {totals.freight > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">+ Freight</span>
                <span className="text-white font-mono">{fmtUSD(totals.freight, { compact: true })}</span>
              </div>
            )}
            {totals.insurance > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">+ Insurance</span>
                <span className="text-white font-mono">{fmtUSD(totals.insurance, { compact: true })}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1.5 border-t border-gray-800">
              <span className="text-xs text-white font-medium">Grand total</span>
              <span className="text-lg text-white font-bold font-mono">
                {fmtUSD(totals.grandTotal, { compact: true })}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-gray-500">MAXONS Margin</span>
              <span className="text-green-400 font-bold">{fmtUSD(totals.subtotalMargin, { compact: true })}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-500">Weighted margin %</span>
              <span className="text-white font-mono">{totals.weightedMarginPct.toFixed(2)}%</span>
            </div>
            {totals.landedCostPerLb > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Landed cost / lb</span>
                <span className="text-white font-mono">{fmtUSD(totals.landedCostPerLb)}</span>
              </div>
            )}
          </div>
        </div>

        {/* At-a-glance summary */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Offer Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Products</span>
              <span className="text-white">{items.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Total Volume</span>
              <span className="text-white">{totals.totalVolumeMT.toLocaleString()} MT</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Terms</span>
              <span className="text-white">{incoterm} {destination || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Buyer</span>
              <span className="text-white truncate max-w-[180px]">{buyer || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Ship date</span>
              <span className="text-white">{shipDate || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Preview modal ───────────────────────────────────── */}
      {showPreview && (
        <OfferPreviewModal
          enrichedItems={enrichedItems}
          totals={totals}
          incoterm={incoterm}
          destination={destination}
          shipDate={shipDate}
          packaging={packaging}
          buyer={buyer}
          notes={notes}
          warnings={warnings}
          onCancel={() => setShowPreview(false)}
          onConfirm={confirmSave}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Preview modal (inline subcomponent) ─────────────────────
function OfferPreviewModal({
  enrichedItems, totals,
  incoterm, destination, shipDate, packaging, buyer, notes,
  warnings = [],
  onCancel, onConfirm, saving,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Confirm Offer</h3>
            <p className="text-[11px] text-gray-500">Review everything below, then commit to save.</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-white text-xl leading-none"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Buyer + terms */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Buyer</p>
              <p className="text-white">{buyer || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Terms</p>
              <p className="text-white">{incoterm} {destination || ''}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Ship date</p>
              <p className="text-white">{shipDate || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Packaging</p>
              <p className="text-white">{packaging}</p>
            </div>
          </div>

          {/* Line items (compact, read-only) */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
              Line items ({enrichedItems.length})
            </p>
            <div className="space-y-2">
              {enrichedItems.map((it, idx) => (
                <OfferLineItem
                  key={it.id}
                  item={it}
                  index={idx + 1}
                  total={enrichedItems.length}
                  readOnly
                  compact
                />
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-white font-mono">{fmtUSD(totals.subtotalRevenue)}</span>
            </div>
            {totals.freight > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">+ Freight</span>
                <span className="text-white font-mono">{fmtUSD(totals.freight)}</span>
              </div>
            )}
            {totals.insurance > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">+ Insurance</span>
                <span className="text-white font-mono">{fmtUSD(totals.insurance)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-700 pt-1.5">
              <span className="text-white font-medium">Grand total</span>
              <span className="text-white font-bold font-mono">{fmtUSD(totals.grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">MAXONS Margin</span>
              <span className="text-green-400 font-mono">{fmtUSD(totals.subtotalMargin)} ({totals.weightedMarginPct.toFixed(2)}%)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Landed cost / lb</span>
              <span className="text-white font-mono">{fmtUSD(totals.landedCostPerLb)}</span>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
              <p className="text-[11px] text-amber-200 font-medium">Before you save:</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-300">• {w}</p>
              ))}
            </div>
          )}

          {notes && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Notes</p>
              <p className="text-xs text-gray-300">{notes}</p>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Back to edit
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm & Save Offer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
