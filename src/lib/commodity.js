// CropsIntelV2 — Commodity Abstraction Layer
//
// The platform MUST support N commodities from day one per the vision
// handoff (April 16, 2026). Almonds is the first commodity; pistachios
// and pineapples follow. Architecture requirement: adding a commodity
// should be a config change, NOT a code rewrite.
//
// This module is the ONE place code should go to ask:
//   - What commodity are we operating on right now?
//   - What varieties / sizes / forms are valid for that commodity?
//   - Which scraper / parser / schema applies?
//   - What UI labels should we show?
//
// Rule: NEVER hardcode the string 'almond' or 'almonds' outside this file.
// Use ACTIVE_COMMODITY.label, ACTIVE_COMMODITY.varieties, etc.

// ─── Commodity registry ───────────────────────────────────────────────
// Each entry is a self-contained config. Adding pistachios means adding
// one block here + matching scraper + matching data source.

export const COMMODITIES = {
  almond: {
    id: 'almond',
    label: 'Almond',
    pluralLabel: 'Almonds',
    icon: '🌰',
    live: true,
    primarySource: 'ABC (Almond Board of California)',
    cropYearMonth: 8, // Aug = start of crop year
    varieties: [
      'Nonpareil', 'Independence', 'Monterey', 'Butte', 'Butte/Padre',
      'Padre', 'Fritz', 'Carmel', 'Wood Colony', 'Aldrich', 'Sonora',
      'Price', 'Winters', 'Avalon', 'Supareil', 'Shasta', 'Merced', 'Mission',
    ],
    sizes: ['18/20', '20/22', '23/25', '25/27', '27/30', '30/32'],
    forms: ['Whole Natural', 'Blanched', 'Sliced', 'Slivered', 'Meal/Flour'],
    scraperModule: 'abc-scraper',
    scraperTables: [
      'abc_position_reports',
      'abc_shipment_reports',
      'abc_crop_receipts',
      'abc_forecasts',
      'abc_acreage_reports',
      'abc_almanac',
    ],
  },
  pistachio: {
    id: 'pistachio',
    label: 'Pistachio',
    pluralLabel: 'Pistachios',
    icon: '🥜',
    live: false, // Phase 7+ rollout
    primarySource: 'American Pistachio Growers (APG) + USDA',
    cropYearMonth: 9, // Sep = start of pistachio crop year
    varieties: ['Kerman', 'Golden Hills', 'Lost Hills', 'Randy'],
    sizes: ['18/20', '20/22', '22/24', '24/26'],
    forms: ['In-Shell', 'Shelled', 'Roasted Salted', 'Raw'],
    scraperModule: 'apg-scraper', // TODO: implement when commodity activates
    scraperTables: [], // TODO: design pistachio_* tables mirroring abc_*
  },
  pineapple: {
    id: 'pineapple',
    label: 'Pineapple',
    pluralLabel: 'Pineapples',
    icon: '🍍',
    live: false,
    primarySource: 'USDA-FAS + Del Monte industry data',
    cropYearMonth: 1, // Pineapple is continuous; Jan as placeholder
    varieties: ['MD-2', 'Smooth Cayenne', 'Queen'],
    sizes: ['6-count', '7-count', '8-count', '9-count'],
    forms: ['Fresh Whole', 'Fresh Cut', 'Canned'],
    scraperModule: 'usda-fas-scraper', // TODO
    scraperTables: [],
  },
};

// ─── Active commodity selection ───────────────────────────────────────
// Currently hardcoded to almond. When we add in-app switching (Phase 7+),
// this reads from user_profiles.preferred_commodity or an app config row.
// Keep this as the ONLY switch point so the rest of the code stays
// commodity-agnostic.

const ACTIVE_COMMODITY_ID = 'almond';

export const ACTIVE_COMMODITY = COMMODITIES[ACTIVE_COMMODITY_ID];

export function getCommodity(id) {
  return COMMODITIES[id] || ACTIVE_COMMODITY;
}

export function listLiveCommodities() {
  return Object.values(COMMODITIES).filter(c => c.live);
}

export function listAllCommodities() {
  return Object.values(COMMODITIES);
}

// Helper to format a crop-year from a calendar date + commodity.
// Almond crop year = Aug–Jul. Pistachio = Sep–Aug. Etc.
export function cropYearFor(date, commodityId = ACTIVE_COMMODITY_ID) {
  const c = getCommodity(commodityId);
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1–12
  if (m >= c.cropYearMonth) return `${y}/${y + 1}`;
  return `${y - 1}/${y}`;
}
