// CropsIntelV2 — Offer calculation utilities
// Pure functions extracted from src/pages/Trading.jsx (550+ line inline block)
// so they can be tested, reused in Buyer/Supplier portals, and reasoned about
// without reading the Trading page.
//
// Design goals:
//   - Every function is pure (no React, no Supabase, no side-effects)
//   - Matches current behavior exactly — no silent math changes
//   - Adds new derivations the V1 version never had:
//       * marginPerLb      — dollars per lb added vs Strata reference
//       * landedCostPerLb  — grandTotal ÷ totalVolumeLbs (what the buyer pays)
//       * incoterm warnings
//       * Strata coverage summary
//
// Created: 2026-04-24 (Wave 2 offer-builder rebuild)

// ─── Constants (shared across builder, portals, zyra tool-use) ────
export const VARIETIES  = ['Nonpareil', 'Carmel', 'Butte/Padres', 'California', 'Mission', 'Monterey', 'Independence', 'Fritz'];
export const GRADES     = ['23/25', '25/27', '27/30', '30/32', 'Extra #1', 'Supreme', 'Whole Natural', 'Blanched', 'Sliced', 'Diced'];
export const INCOTERMS  = ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP'];
export const PACKAGING  = ['25 kg cartons', '50 lb bags', '22.68 kg cartons', 'Bulk (tote bags)', 'Custom'];

// Fallback Strata-base prices — used ONLY if the strata_prices table has no row
// for a given variety+grade combo. The live scraper keeps strata_prices fresh;
// this map is kept so the builder never shows $0 while the table loads or for
// combinations the scraper hasn't indexed yet.
export const FALLBACK_PRICES = {
  'Nonpareil-23/25': 3.85, 'Nonpareil-25/27': 3.60, 'Nonpareil-27/30': 3.40,
  'Nonpareil-Whole Natural': 3.75, 'Nonpareil-Blanched': 4.10, 'Nonpareil-Sliced': 4.50,
  'Carmel-23/25': 3.40, 'Carmel-25/27': 3.20, 'Carmel-27/30': 3.05,
  'Butte/Padres-23/25': 3.30, 'Butte/Padres-25/27': 3.10, 'Butte/Padres-Extra #1': 2.90,
  'California-23/25': 3.50, 'California-25/27': 3.30,
  'Mission-23/25': 3.15, 'Monterey-25/27': 3.25, 'Independence-23/25': 3.45,
};

// MT → lbs conversion (1 metric tonne = 2,204.62 pounds)
export const LBS_PER_MT = 2204.62;

// ─── Price resolution ───────────────────────────────────────────
/**
 * Resolve Strata base price for a variety+grade combo.
 *
 * Preference order:
 *   1. Live table (stratamap) — most recent price_date per combo
 *   2. Hardcoded FALLBACK_PRICES
 *   3. $3.50/lb default
 *
 * Returns { price, source } so callers can show coverage status.
 */
export function resolveStrataPrice(stratamap, variety, grade) {
  const key = `${variety}-${grade}`;
  if (stratamap && stratamap[key] != null) {
    return { price: Number(stratamap[key]), source: 'live' };
  }
  if (FALLBACK_PRICES[key] != null) {
    return { price: FALLBACK_PRICES[key], source: 'fallback' };
  }
  return { price: 3.50, source: 'default' };
}

// Legacy shape — `resolveStrataPrice` used to return a number. We keep a helper
// that returns just the price for callers that don't care about source.
export function resolveStrataPriceValue(stratamap, variety, grade) {
  return resolveStrataPrice(stratamap, variety, grade).price;
}

// ─── Grade → form mapping ──────────────────────────────────────
export function gradeToForm(grade) {
  if (!grade) return 'Whole Natural';
  if (grade.includes('Blanched')) return 'Blanched';
  if (grade.includes('Sliced'))   return 'Sliced';
  if (grade.includes('Diced'))    return 'Diced';
  return 'Whole Natural';
}

// ─── Blank item factory ────────────────────────────────────────
export function makeBlankItem() {
  return {
    id: Math.random().toString(36).slice(2, 8),
    variety: 'Nonpareil',
    grade: '23/25',
    volumeMT: 100,
    marginPct: 3.0,
  };
}

// ─── Per-line enrichment ───────────────────────────────────────
/**
 * Enrich a single line item with all derived pricing fields.
 * Adds: basePrice, priceSource, maxonsPrice, volumeLbs, lineRevenue,
 *       lineBaseVal, lineMargin, marginPerLb.
 *
 * `marginPerLb` is NEW in V2 — shows traders the dollar delta per lb so
 * they can reason about "+$0.12/lb" instead of just "+3%".
 */
export function enrichItem(item, stratamap) {
  const { price: basePrice, source: priceSource } = resolveStrataPrice(stratamap, item.variety, item.grade);
  const marginPct    = Number(item.marginPct) || 0;
  const maxonsPrice  = basePrice * (1 + marginPct / 100);
  const volumeMT     = Number(item.volumeMT) || 0;
  const volumeLbs    = Math.round(volumeMT * LBS_PER_MT);
  const lineRevenue  = maxonsPrice * volumeLbs;
  const lineBaseVal  = basePrice * volumeLbs;
  const lineMargin   = lineRevenue - lineBaseVal;
  const marginPerLb  = maxonsPrice - basePrice;

  return {
    ...item,
    basePrice,
    priceSource,
    maxonsPrice,
    volumeMT,
    volumeLbs,
    lineRevenue,
    lineBaseVal,
    lineMargin,
    marginPerLb,
  };
}

// ─── Offer-level totals ─────────────────────────────────────────
/**
 * Compute full offer totals from enriched items + ancillary costs.
 * Adds: subtotalRevenue, subtotalBase, subtotalMargin, totalVolumeMT,
 *       totalVolumeLbs, grandTotal, weightedMarginPct, landedCostPerLb.
 */
export function computeOfferTotals(enrichedItems, { freightUSD = 0, insuranceUSD = 0 } = {}) {
  const subtotalRevenue = enrichedItems.reduce((s, it) => s + it.lineRevenue, 0);
  const subtotalBase    = enrichedItems.reduce((s, it) => s + it.lineBaseVal, 0);
  const subtotalMargin  = enrichedItems.reduce((s, it) => s + it.lineMargin, 0);
  const totalVolumeMT   = enrichedItems.reduce((s, it) => s + (Number(it.volumeMT) || 0), 0);
  const totalVolumeLbs  = enrichedItems.reduce((s, it) => s + it.volumeLbs, 0);

  const freight   = Number(freightUSD)   || 0;
  const insurance = Number(insuranceUSD) || 0;
  const grandTotal = subtotalRevenue + freight + insurance;

  const weightedMarginPct = subtotalBase > 0
    ? (subtotalMargin / subtotalBase) * 100
    : 0;

  const landedCostPerLb = totalVolumeLbs > 0
    ? grandTotal / totalVolumeLbs
    : 0;

  return {
    subtotalRevenue,
    subtotalBase,
    subtotalMargin,
    totalVolumeMT,
    totalVolumeLbs,
    grandTotal,
    weightedMarginPct,
    landedCostPerLb,
    freight,
    insurance,
  };
}

// ─── Incoterm helpers ──────────────────────────────────────────
/**
 * Which incoterms expect freight paid by seller (i.e. freight > 0 is normal).
 * CFR, CIF, CIP, DDP, DAP → seller pays freight
 * FOB, FCA, EXW            → buyer arranges; freight should be $0
 */
const FREIGHT_BY_SELLER = new Set(['CFR', 'CIF', 'CIP', 'DDP', 'DAP']);
const INSURANCE_BY_SELLER = new Set(['CIF', 'CIP', 'DDP']);

export function incotermExpectsFreight(incoterm) {
  return FREIGHT_BY_SELLER.has(incoterm);
}

export function incotermExpectsInsurance(incoterm) {
  return INSURANCE_BY_SELLER.has(incoterm);
}

/**
 * Return an array of warnings when incoterm expectations don't match entered
 * freight/insurance. Empty array = no warnings. UI can render these as amber
 * chips to alert the trader before save.
 */
export function incotermWarnings({ incoterm, freightUSD = 0, insuranceUSD = 0 }) {
  const warnings = [];
  const freight   = Number(freightUSD)   || 0;
  const insurance = Number(insuranceUSD) || 0;

  if (incotermExpectsFreight(incoterm) && freight === 0) {
    warnings.push(`${incoterm} typically includes freight — you have \$0 entered`);
  }
  if (!incotermExpectsFreight(incoterm) && freight > 0) {
    warnings.push(`${incoterm} means buyer arranges freight — are you sure the \$${freight.toLocaleString()} is correct?`);
  }
  if (incotermExpectsInsurance(incoterm) && insurance === 0) {
    warnings.push(`${incoterm} typically includes insurance — you have \$0 entered`);
  }
  if (!incotermExpectsInsurance(incoterm) && insurance > 0) {
    warnings.push(`${incoterm} usually excludes insurance — are you sure this line applies?`);
  }

  return warnings;
}

// ─── Strata coverage summary ─────────────────────────────────────
/**
 * Summarize how many line items were priced from live Strata vs fallback.
 * Used in the top-of-form coverage indicator.
 */
export function strataCoverage(enrichedItems) {
  const counts = { live: 0, fallback: 0, default: 0 };
  enrichedItems.forEach(it => {
    counts[it.priceSource] = (counts[it.priceSource] || 0) + 1;
  });
  const total = enrichedItems.length;
  const livePct = total > 0 ? Math.round((counts.live / total) * 100) : 0;
  return {
    ...counts,
    total,
    livePct,
    isFullyLive: counts.fallback === 0 && counts.default === 0 && total > 0,
  };
}

// ─── Validation ─────────────────────────────────────────────────
/**
 * Validate the offer before save. Returns { ok, errors } — errors is an
 * array of human-readable strings, empty when ok=true.
 */
export function validateOffer({ enrichedItems, buyer, contactId, incoterm, destination }) {
  const errors = [];

  const validItems = (enrichedItems || []).filter(it => (it.volumeMT || 0) > 0);
  if (validItems.length === 0) {
    errors.push('Add at least one product with volume > 0');
  }

  if (!buyer && !contactId) {
    errors.push('Select a CRM contact or enter a buyer name');
  }

  if (!incoterm) {
    errors.push('Choose an incoterm');
  }

  // Warn-level checks — still ok to save, but user should see them first
  const warns = [];
  if (incotermExpectsFreight(incoterm) && validItems.length > 0 && !destination) {
    warns.push(`${incoterm} shipments usually name a destination port`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: warns,
    validItems,
  };
}

// ─── Offer payload builder ──────────────────────────────────────
/**
 * Build the full crm_deals INSERT payload from builder state.
 * Extracted so tests can verify shape without a Supabase client.
 */
export function buildOfferPayload({
  enrichedItems,
  totals,
  freightUSD,
  insuranceUSD,
  incoterm,
  destination,
  shipDate,
  packaging,
  buyer,
  contactId,
  notes,
  userId,
}) {
  const validItems = enrichedItems.filter(it => (it.volumeMT || 0) > 0);
  const primary    = validItems[0];

  const weightedMargin = totals.subtotalBase > 0
    ? (totals.subtotalMargin / totals.subtotalBase) * 100
    : (primary?.marginPct || 0);

  return {
    contact_id: contactId || null,
    deal_type: 'sell',
    stage: 'draft',
    variety: primary.variety,
    grade: primary.grade,
    form: gradeToForm(primary.grade),
    volume_lbs: totals.totalVolumeLbs,
    volume_mt: totals.totalVolumeMT,
    strata_base_price: primary.basePrice,
    maxons_price: primary.maxonsPrice,
    margin_pct: Number(weightedMargin.toFixed(2)),
    total_value_usd: Math.round(totals.grandTotal),
    incoterm,
    destination_port: destination || null,
    estimated_ship_date: shipDate || null,
    notes: [
      buyer ? `Buyer: ${buyer}` : '',
      packaging ? `Packaging: ${packaging}` : '',
      validItems.length > 1 ? `Multi-product (${validItems.length} items)` : '',
      (Number(freightUSD) || 0) > 0 ? `Freight: \$${Number(freightUSD).toLocaleString()}` : '',
      (Number(insuranceUSD) || 0) > 0 ? `Insurance: \$${Number(insuranceUSD).toLocaleString()}` : '',
      notes,
    ].filter(Boolean).join('. '),
    metadata: {
      line_items: validItems.map(it => ({
        variety: it.variety,
        grade: it.grade,
        form: gradeToForm(it.grade),
        volume_mt: Number(it.volumeMT),
        volume_lbs: it.volumeLbs,
        margin_pct: Number(it.marginPct),
        margin_per_lb: Number(it.marginPerLb.toFixed(4)),
        strata_base_price: Number(it.basePrice.toFixed(4)),
        strata_source: it.priceSource,
        maxons_price: Number(it.maxonsPrice.toFixed(4)),
        line_revenue_usd: Math.round(it.lineRevenue),
        line_margin_usd: Math.round(it.lineMargin),
      })),
      is_multi_product: validItems.length > 1,
      freight_cost_usd:   Number(freightUSD)   || 0,
      insurance_cost_usd: Number(insuranceUSD) || 0,
      subtotal_revenue_usd: Math.round(totals.subtotalRevenue),
      subtotal_margin_usd:  Math.round(totals.subtotalMargin),
      grand_total_usd:      Math.round(totals.grandTotal),
      landed_cost_per_lb:   Number(totals.landedCostPerLb.toFixed(4)),
      packaging,
    },
    created_by: userId || null,
  };
}

// ─── Format helpers ─────────────────────────────────────────────
export function fmtUSD(n, opts = {}) {
  const { compact = false } = opts;
  const num = Number(n) || 0;
  if (compact && Math.abs(num) >= 1000) {
    return `\$${(num / 1000).toFixed(1)}K`;
  }
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtLbs(n) {
  return `${(Number(n) || 0).toLocaleString()} lbs`;
}
