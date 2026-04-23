# Commodity-Agnostic Architecture — V2

**Status:** Phase 7 foundation laid (2026-04-24). Migration to `commodity_id` on `abc_*` tables is Phase 8.

---

## Why

The vision handoff (April 16, 2026) makes this a non-negotiable architectural rule:

> Adding the next commodity should be a configuration change (new data source, new product catalog entries, new report templates), NOT a code rewrite. Every schema, every API, every UI component should assume multi-commodity even though only almonds are live today.

## The one rule

**Never hardcode the string `almond` or `almonds` outside [`src/lib/commodity.js`](../src/lib/commodity.js).**

Use the abstraction:

```js
import { ACTIVE_COMMODITY, COMMODITIES, getCommodity } from '../lib/commodity';

// labels
<h1>{ACTIVE_COMMODITY.pluralLabel} Market Intelligence</h1>

// varieties
{ACTIVE_COMMODITY.varieties.map(v => <option value={v}>{v}</option>)}

// crop year
const cy = cropYearFor(new Date(), 'almond');
```

## The three pieces

### 1. `src/lib/commodity.js` — runtime abstraction

Single registry of known commodities, each with `id`, `label`, `varieties`, `sizes`, `forms`, `cropYearMonth`, `scraperModule`. `ACTIVE_COMMODITY` is what the app is operating on right now (hardcoded to `almond` today; will read from user preference / app config in Phase 7 UI).

### 2. `supabase/schema_commodity.sql` — DB extension

Two new tables:
- `commodities` — registry mirroring the JS constants.
- `products` — flattened variety × size × form × origin catalog per commodity.

Run AFTER `schema.sql`. Additive; non-destructive. Existing `abc_*` tables keep their schema.

### 3. Migration plan for existing tables (Phase 8)

In Phase 8, add `commodity_id TEXT REFERENCES commodities(id) DEFAULT 'almond'` to:
- `abc_position_reports`
- `abc_shipment_reports`
- `abc_crop_receipts`
- `abc_forecasts`
- `abc_acreage_reports`
- `abc_almanac`
- `strata_prices`
- `industry_news`
- `crm_contacts` (optional — if a contact is commodity-specific)
- `crm_deals` (via join to products, not direct)

Rename tables from `abc_*` → `position_reports` / `shipment_reports` with commodity_id filter is optional but preferred. ABC-specific metadata stays in `raw_data` JSONB.

## Adding a new commodity (future example)

```js
// 1. Add to COMMODITIES in src/lib/commodity.js
pistachio: {
  id: 'pistachio',
  label: 'Pistachio',
  live: true,   // flip to true when data lands
  varieties: [...],
  scraperModule: 'apg-scraper',
  scraperTables: ['pistachio_position_reports', ...],
}

// 2. Insert into commodities table
UPDATE commodities SET live = TRUE, activated_at = NOW() WHERE id = 'pistachio';

// 3. Create the scraper module (mirrors abc-scraper.js)
src/scrapers/apg-scraper.js

// 4. Add pistachio-specific tables (or use commodity_id-filtered shared tables)
```

**No UI rewrite needed.** Every widget that reads from `ACTIVE_COMMODITY.varieties` auto-updates. Every filter chip reads from the variety list. Every CRM dropdown pulls from `products` scoped to the commodity.

## What's still "almond" in the codebase (to migrate)

Grep-audited 2026-04-24:

- Page copy: "Market Dashboard", "Supply & Demand" — OK, generic. No change needed.
- `src/lib/commodity.js` — **correct place** to have "Almond" / "almond".
- `scripts/seed-data.js` — seeds `abc_position_reports` with commodity='almond' implicit. Phase 8: add commodity_id column.
- `src/scrapers/*.js` — abc-scraper uses `almonds.org` URL which is correct. No UI copy changes needed here.
- `src/pages/*.jsx` — several pages say "almond market" in copy. Phase 7b: replace with `{ACTIVE_COMMODITY.pluralLabel.toLowerCase()} market`.

## Testing the abstraction

```sh
# After schema_commodity.sql is run on Supabase:
psql $DATABASE_URL -c "SELECT id, label, live FROM commodities ORDER BY id;"
# almond | Almond | t
# pineapple | Pineapple | f
# pistachio | Pistachio | f

psql $DATABASE_URL -c "SELECT commodity_id, COUNT(*) FROM products GROUP BY commodity_id;"
# almond | 13
```
