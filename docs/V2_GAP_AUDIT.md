# CropsIntel V2 — Gap Audit (2026-04-25)

**Source:** user-directed honest assessment after walkthrough of cropsintel.com.
**User's complaint, verbatim:**
> "data gaps and multiple problems and the app not arranged well with products,
> freight and crm contractual function display data is missing some reports
> and i dont know where to upload report"

**Purpose:** translate that into a per-page, per-gap inventory tagged
**V2-FIT** (fix in V2 polish), **V3-SCOPE** (Trade Hub lifecycle, Phase 7+),
or **IA** (information architecture / nav reorg). This is the navigation map
for the `/v3-preview` build (Option B).

**Companion docs:**
- [TRADE_HUB_SPEC_v1.md](TRADE_HUB_SPEC_v1.md) — full V3 blueprint (1405 lines)
- [TRADE_HUB_CROSSWALK_v1.md](TRADE_HUB_CROSSWALK_v1.md) — page-by-page V2→V3 deltas

---

## 1. Decoding the four complaints

| User said | Translates to | Bucket | Severity |
|---|---|---|---|
| *"app not arranged well with products"* | Sidebar over-nests; Supply → Buyers / CRM → Trading have no inline jumps; "products" (varieties/grades/sizes) live across 3+ pages with no canonical home | **IA** | 1 |
| *"freight ... data is missing"* | No freight/landed-cost widget anywhere. Trading offer builder has incoterm field but no rate, transit time, or port capacity reference | **V3-SCOPE** (Spec §8 Logistics, 6 modes) | 1 (in V3 scope) / 3 (in V2 scope) |
| *"crm contractual function display data is missing some reports"* | CRM page implies contracts (deal pipeline, stages) but has no contract documents, signature tracking, renewal alerts, or term enforcement. The visual promises a feature that doesn't exist | **V3-SCOPE** (Spec §2.7 Contracts + §5 numbering) | 1 (V3) / 2 (V2 honest-framing) |
| *"i dont know where to upload report"* | Upload UX is scattered: Autonomous (intel docs), CRM (contact CSV), Settings (users). No home for ABC PDF re-uploads, manual data corrections, contract docs, freight invoices, or supplier offer sheets | **V2-FIT** | 1 |

---

## 2. Page-by-page audit (16 pages, evidence-backed)

| Page | Widgets present | Live vs modeled | Filter/compare | Upload affordance | Severity |
|---|---|---|---|---|---|
| **Welcome** | Hero, pillars, Zyra chat, stats, data sources, MAXONS section | Static config | n/a | n/a | 3 |
| **Dashboard** | KPI cards, MarketPulseBand, supply position, shipment trend, AI insights, live prices, news, intel alerts, pipeline | Live (`abc_position_reports`, `strata_prices`, `ai_analyses`, `industry_news`, `intel_reports`) — partial auto-seeding | MarketPulse only | None | 2 |
| **Analysis** | Monthly comparison, committed/shipped, draw-down, export %, 10y trend, crop year table | Live (`abc_position_reports`) | ✅ Multi-select + compare (reference pattern) | None | 2 |
| **Supply** | 6 metric cards, commitment rate, draw-down, utilization, velocity, coverage, supply timeline (lbs/cont/MT), health table, Variety + County sections | Live (`abc_position_reports`, `abc_crop_receipts`) | ✅ FilterBar | None | 2 |
| **Destinations** | Continent rollup, export/domestic pie, monthly split, top countries bar, monthly by continent, top 5 YoY, full export table, cross-year compare | **MODELED** — country splits hardcoded (Spain ~12%, India ~11%, etc.) on top of real total volume | ✅ Metric toggle + continent filter | None | **1** (data integrity) |
| **Pricing** | Price cards per variety, table/chart/compare, variety × grade cross-tab, history chart, CSV export | Live (`strata_prices`) | ✅ Variety + grade filter | None | 2 |
| **Forecasts** | Production bar, acreage trend, 4 metric cards, variety mix pie, county allocation, almanac | Partial — acreage hardcoded for 2025; ABC receipts live | ✅ Metric toggle | None | 3 |
| **News** | News cards, sentiment compare (source × category), weekly sentiment timeline | Seeded (auto-populates if empty) | ✅ Category + source | None | 3 |
| **Intelligence** | Analysis cards (signal/brief/anomaly/yoy), full-page Zyra chat, voice playback, feedback loop | Live (Claude API + `ai_analyses`) | Chat context | None | 1 (working well) |
| **Reports** | Full position table (16 cols), coverage grid (per-crop-year completeness), summary stats, compare-mode, CSV export | Live (`abc_position_reports`) | ✅ Crop / month / sort / compare | **No** — coverage holes are visible but no way to flag or upload corrections | **2** |
| **CRM** | 4 tabs: Pipeline (deals, stages, scores), Contacts (type + category), Users (tier + verify), Activities (icon timeline), bulk invite, add-user forms | Seeded (`crm_contacts`, `crm_deals`, `crm_activities`) | ✅ Stage + period | ✅ CSV bulk-invite, WhatsApp invite | **1** — missing contracts tab the user expects |
| **Brokers** | Market signals grid (focus/hold/avoid per country), region filter, KPI cards | Modeled (country YoY logic) | ✅ Region | None | 3 |
| **Suppliers** | Crop year selector, county selector with quick-actions, variety mix pie, county bar, variety×county heatmap | Modeled (county allocation = state receipts × approximate share) | ✅ Crop year + county multi-select | None | 3 |
| **Trading** | 4 portal tabs: Offer Builder, Recent Offers, Buyer Portal stub, Supplier Portal stub, WhatsApp send, status lifecycle | Live (`crm_deals`, `crm_contacts`, `strata_prices`) | None | None | **1** — no freight, no contract link, portals stubbed |
| **Settings** | API keys (4 AI), profile editor (15 fields), password change, admin user mgmt, team verify queue, broadcast (email + history) | Live | None | ✅ Add-user form | 2 |
| **Autonomous** | Intel upload (paste/file/PDF/URL), 11 source presets, ingest workflow, results, KB stats | Live (`intel_reports`) | None | ✅ Multi-format upload | 3 |

### Severity-1 cluster (the launch blockers per honest reading)
1. **Destinations modeled-not-live** — every trade decision rests on country splits that are guesses. Real ABC shipment PDF scraper exists in plan (Phase B2), not built yet.
2. **CRM contracts visually promised, not built** — UX implies contracts exist; users expect to manage them; nothing's there. Either build a stub (V2 honest-framing) or defer to V3 with clear copy.
3. **No data-ingestion home** — user said it directly. Every other gap compounds when there's no place to upload corrections.
4. **Trading without freight or contract linkage** — offer builder is a draft surface, not a deal surface.

---

## 3. The IA problem (sidebar + page arrangement)

### Today (`src/App.jsx:81-107`)
```
Main:           Dashboard, Analysis
Market Data:    Supply, Destinations, Pricing, Forecasts, News
AI & Intelligence: Intelligence, Reports
Relationships:  CRM, Brokers, Suppliers, Trading
Admin:          Settings#team-panel, Settings#broadcast-panel, Autonomous, Settings
```

### Why it's broken
- **No "Desk" / action surface.** A user reading Supply has no inline link to act on it (offer to a buyer, ping a broker, post to portal). Sidebar makes them navigate sideways.
- **Trading buried under "Relationships"** — but Trading IS the action surface. It should live alongside Dashboard.
- **Reports under "AI & Intelligence"** — Reports is raw position data, not AI output. Wrong neighborhood.
- **Settings is a kitchen sink** — User mgmt + Broadcasts + API keys + Profile + Locale. Need to split.
- **No "Data" section** — there's no place upload/quality/coverage lives.

### Proposed V3 IA (what `/v3-preview` will render)
```
WORK
  Dashboard         (your day)
  Trading Desk      (offers in flight, deals to act on)
  CRM               (contacts + deals + contracts)

MARKET
  Supply
  Destinations
  Pricing
  Forecasts
  Analysis

INTEL
  News
  Intelligence (Zyra)
  Reports

DATA
  Data Hub          ← NEW — uploads + coverage + corrections
  Sources           (scraper status, last-run, errors)

ADMIN  (team only)
  Team & Users
  Broadcasts
  Autonomous
  Settings
```

**Why this works:**
- "WORK" is what you do → Dashboard / Trading / CRM at the top, never buried.
- "MARKET" is the read-only fact base → Supply through Analysis, all in one neighborhood.
- "INTEL" is interpretation → News, Zyra, position reports.
- "DATA" is the new surface — Data Hub + Sources answer "where do I upload?" and "is the scraper healthy?"
- "ADMIN" is unchanged but explicitly team-gated.

---

## 4. The Data Hub (V2-fit, builds first under `/v3-preview`)

### Single page, three modules

**4.1. Upload**
- Drag-drop zone, or click-to-pick
- Source picker dropdown:
  - ABC Position Report (PDF) → routes to `parsePositionReport` → `abc_position_reports`
  - ABC Shipment Report (PDF) → routes to `parseShipmentReport` → `abc_shipment_reports`
  - ABC Crop Receipts (PDF) → routes to `parseCropReceipts` → `abc_crop_receipts`
  - ABC Subjective/Objective Forecast (PDF) → `abc_forecasts`
  - Manual data correction (CSV, JSON) → routes to a generic admin patcher
  - Supplier offer sheet (PDF) → routes to OCR → `offers_raw` (Trading review)
  - Freight rate sheet (CSV) — V3 stub, accepts but parks for now
  - Contract document (PDF) — V3 stub, parks in storage bucket
- Per-upload: shows parser progress, success/error, row count, table written to
- All uploads logged to `data_uploads` table (NEW, simple audit trail)

**4.2. Coverage**
- Reuses Reports page coverage grid (`coverageStats.perYear`)
- Shows per-source-type-per-year completeness: ABC Position 11/11, Shipment 0/11 (modeled), Forecast 2/11, etc.
- Click a hole → shows what's missing → "Upload" button next to it

**4.3. Sources**
- Scraper health list:
  - `abc-scraper.js` last run, success/fail, rows added
  - `shipment-parser.js` (currently dormant)
  - `receipts-parser.js`
  - `news-scraper.js`
  - `strata-prices.js`
- Manual "Trigger now" button (gated to admin)

### Why this is V2-fit, not V3
- Doesn't require Trade Hub schema migrations
- Doesn't require new edge functions (existing parsers are reused)
- Solves the user's most direct pain ("don't know where to upload")
- Single page, ~600 lines of JSX, ships in one push

---

## 5. CRM Contracts gap (the user's third complaint)

The user said the CRM "contractual function display data is missing some reports." Two paths:

### Path A — V2 honest framing (cheap, ships immediately)
Add a 5th tab to CRM: **Contracts** with explicit "Coming in V3 Trade Hub" copy + a feature-preview card showing the spec's contract numbering (`MGT-SAL-PAK-2026-0421`) + a "Notify me when ready" subscribe button. This stops the visual promise of contracts where none exist.

### Path B — V2 stub (medium effort, semi-real)
Add a 5th tab: **Contracts** with:
- Upload a contract PDF (drag-drop, stores in Supabase Storage `contracts/` bucket)
- Per-deal "Attach contract" link from Pipeline tab
- Renewal-date + expiry-date fields, renewal alert at T-30
- No signature tracking, no template library, no payment-term enforcement (those are V3)

**Recommendation:** Path B for V2. It's not the full Spec §2.7, but it gives the user a real place to put contract PDFs and tracks renewals. The full lifecycle (numbering, smart-templating, originals release, payment scheduling) lands in V3 / Phase 7.2.

---

## 6. Freight gap (the user's second complaint)

Freight is **canonically V3-scope** (Spec §8 — 6 logistics modes, port capacity, transit times, vessel tracking, MarineTraffic integration). Building it in V2 would be a few weeks and would bake assumptions that V3 might invalidate.

**V2-fit minimum:**
- Trading offer builder gets a free-text "Freight estimate" field next to incoterm
- Dashboard gets a one-line "Freight rates: see Trading" placeholder
- Honest copy: "Freight calculator coming in V3 Trade Hub" rather than nothing

**V3-scope build (deferred):**
- 6-mode logistics calculator (FCL, LCL, breakbulk, RO-RO, air, multimodal)
- Port capacity + congestion via MarineTraffic
- Transit time matrix (origin × destination × mode)
- Container availability gauge
- FOB → CIF → DDP cost stack visualizer

---

## 7. Prioritized punch list for `/v3-preview` build

Each row = one push under `/v3-preview/<slug>`. User reviews. If approved, replaces current page.

| # | Slug | Page / surface | Effort | V2-fit? |
|---|---|---|---|---|
| 1 | `data-hub` | Unified Upload + Coverage + Sources | M (1 session) | ✅ V2 |
| 2 | `layout` | New sidebar IA + top-bar refresh (WORK / MARKET / INTEL / DATA / ADMIN) | M | ✅ V2 |
| 3 | `dashboard` | Reordered widgets (action-first), inline links Supply→CRM, freight placeholder | M | ✅ V2 |
| 4 | `crm` | Add Contracts tab (Path B — upload + renewal alerts) | M-L | ✅ V2 (V3 polish later) |
| 5 | `trading` | Honest copy on portal stubs, freight free-text, offer→deal link | S | ✅ V2 |
| 6 | `destinations` | Modeled-data banner + "When real data lands" date promise | S | ✅ V2 |
| 7 | `reports` | "Flag this row" / "Upload correction" inline buttons → routes to Data Hub | S | ✅ V2 |
| 8 | `sources` | Scraper health page (sub-page of Data Hub) | S | ✅ V2 |

**Estimated total:** 8 sessions for the full `/v3-preview` build. After per-page user approval, each preview replaces the current production page in a follow-up commit.

---

## 8. What this audit does NOT propose

Explicitly out of V2 scope per user's 2026-04-25 directive ("V2 = Welcome→CRM polished. Full Trade Hub lifecycle = V3 / Phase 7+"):

- **4 isolated portals** (Maxons / Buyer / Supplier / Broker) — V3 Phase 7.5
- **Full deal state machine** (25 states, Spec §2.6) — V3 Phase 7.1
- **Contract templating + smart numbering** — V3 Phase 7.2
- **6-mode logistics calculator** — V3 Phase 7.3
- **Per-entity ledgers (MGT + MIX) + ERP** — V3 Phase 7.4
- **WhatsApp catalogue + bidding** — V3 Phase 7.6
- **2FA, biometric, audit logs** — V3 Phase 7.7
- **Multi-currency / FX** — V3 Phase 7.4
- **Multilingual app rollout** — held until user-approved render review (currently locked to English + LTR per `LocaleContext.ENFORCED_LOCALE`)

---

## 9. Verification plan per `/v3-preview/<slug>` push

Each preview ships with a bottom-of-page banner:
> **"You're previewing V3 — give feedback in chat. Approve = this replaces the current page in the next push."**

User walkthrough cadence:
1. Push lands, deploy completes, curl-verify HTTP 200
2. User clicks "View V3 preview ↗" toggle in current top bar (team-gated)
3. User walks through the preview page
4. Feedback in chat → revisions if needed
5. Approval → I move the preview component into the production page slot, archive the old, push final
6. Mark as "merged" in `progress.json.markedForLater.v3-preview-progress`

---

## 10. Memory anchors

- Hard constraint: **no parallel codebase**. Everything is `/v3-preview/*` inside V2.
- Hard constraint: **team-gated**. Buyers don't see the preview toggle.
- Hard constraint: **honest framing**. If a feature is V3-scope, the preview says so explicitly, not pretends.
- Hard constraint: **no destructive replacements** without user approval per page.

**Authored:** 2026-04-25 evening, after the app-locale-lock revert landed.
**Next action:** build `/v3-preview` shell + Data Hub preview as the first user-facing checkpoint.
