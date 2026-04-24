<!--
Source: User-authored spec delivered in-session 2026-04-24.
Preserved verbatim as the canonical CropsIntel Trade Hub blueprint.

User intent statement (verbatim):
> "the idea is to bring people to our app with best thing visually available
>  to see at glance what is exactly happening.. and check each current
>  function to modify enhance or add tab, functions or information requirement
>  where ever needed carefully.. you have to thorough and not skip anything
>  in memory and the concept in memory so you have the vision and act accordingly."

Status: CANONICAL — do not mutate without an explicit new spec version.
Related: docs/TRADE_HUB_CROSSWALK_v1.md (page-by-page mapping vs current V2).
Related: public/progress.json → phases[6] "Trade Hub Vision (Phase 7)".

V2 launch-readiness note: this spec's 6-phase roadmap is an 11-month build.
V2 is currently at 95% launch readiness. Per the launch-first rule, the spec
is Phase 7+ scope. Only cheap data-model prep (nullable columns, stub tables,
role expansion) is applied pre-launch; everything else is queued.
-->

# CROPSINTEL TRADE HUB — COMPREHENSIVE WORKFLOW SPECIFICATION

**Version:** 1.0
**Date:** 24 April 2026
**Owner:** Muzammil / Maxons Group
**Platform:** www.cropsintel.com — Trade Hub Module
**Primary Entity:** Maxons General Trading LLC (UAE Mainland) + Maxons Impex DWC LLC (UAE Free Zone)
**Scope:** End-to-end almond (and extensible nut/commodity) trading platform, AI-driven, multi-portal, built for a future huge-sized trader.

---

## 0. EXECUTIVE SUMMARY

CropsIntel Trade Hub is a **four-portal, multi-entity, AI-driven commodity trading platform** that operates as a full ERP backbone for Maxons' almond (and future nut/commodity) trading business.

It manages the entire trade lifecycle: offer origination → broadcast → negotiation → contract → verification → documentation → logistics → payment → closure — with information-wall isolation between parties, multi-user authority control, full audit trail, and embedded AI at every decision point.

The system is also the strongest possible CRM for Maxons, capturing every buyer/supplier/broker interaction, deal economics, and operational signal for continuous intelligence.

---

## 1. PLATFORM ARCHITECTURE

### 1.1 Four-Portal Model

| Portal | Users | Primary Purpose |
|---|---|---|
| **Maxons Internal Portal** | Maxons staff (14 role types) | Run the business: manage offers, deals, margins, contracts, docs, logistics, payments, analytics |
| **Buyer Portal** (Web + Mobile App + WhatsApp) | Final buyers + resellers (acting as buyers) | Browse approved offers, negotiate, accept, track orders, pay |
| **Supplier Portal** (Web + Mobile App + WhatsApp) | Packers with brands | Post offers, manage deals with Maxons, upload docs, track payments from Maxons |
| **Broker Portal** (Web + Mobile App + WhatsApp) | Origin brokers + secondary market brokers | Post offers sourced from origin/market, track commissions, manage deals brokered |

### 1.2 Information-Wall Isolation (Non-Negotiable)

The four portals are **hermetically separated**. The system enforces:

- **Buyers** see: only approved offers matching their profile, margin-inclusive prices, their own deal flow, their own docs
- **Buyers never see:** supplier identity, supplier price, Maxons margin, broker involvement, internal team notes, AI reasoning
- **Suppliers/Packers** see: their own offers, their deals with Maxons (using their contracted price), payment status from Maxons, buyer destination region only (e.g., "South Asia" not "Qureshi Impex")
- **Suppliers never see:** buyer identity, final buyer price, Maxons margin, broker commissions, other suppliers' offers
- **Brokers** see: their own posted offers, commissions earned/pending, deals they brokered at their negotiated price, destination region only
- **Brokers never see:** buyer identity, final sale price, Maxons margin, other brokers' commissions
- **Maxons internal roles** see: scoped views per role (see §12 Authority Matrix); only Super Admin sees everything

### 1.3 Entity & Ledger Structure (Option A — Separate Ledgers)

Each legal entity operates an independent ledger:
- **Maxons General Trading LLC** (Dubai mainland) — Emirates Islamic Bank — Pakistan/India/Nepal/UAE local trade
- **Maxons Impex DWC LLC** (DWC free zone) — National Bank of Fujairah — Algeria/Georgia/Italy/Turkey/export flows
- **Future entities** (e.g., California entity, Singapore entity) — onboarded via entity provisioning wizard

Consolidation layer on top provides group-level P&L with automatic **inter-company elimination**. When one Maxons entity sells stock to another (intra-group), system auto-posts both sides (intercompany payable/receivable) and eliminates on consolidation.

Tax treatment, bank reconciliation, and statutory reporting are per-entity (UAE Corporate Tax compliant — mainland LLC and free-zone DWC treated correctly).

### 1.4 Core Tech Principles

- **Mobile-first** for Super Admin / sales / buyers / suppliers / brokers
- **Desktop-primary** for documentation / finance / logistics officers (heavy data entry)
- **Full feature parity** across mobile and desktop for core workflows
- **Offline mode** for critical views (shipment tracking, active deals), auto-syncs on reconnect
- **Multi-language**: English, Arabic, Hindi/Urdu, Turkish, Russian (extensible)
- **Multi-currency**: AED, USD, EUR (primary); architecture supports adding any currency
- **Multi-unit**: LBS, KG, MT, FCL, cartons, bags, vacuum bags — user-configurable display, 4-decimal precision storage

---

## 2. MASTER DATA SCHEMAS

### 2.1 Product Master (editable catalog — Product Tab)

Product is defined by the following dimensions. All are referenceable and editable:

| Field | Type | Notes |
|---|---|---|
| `product_id` | PK | System-generated |
| `category` | enum | almond, pine_nut, walnut, pistachio, cashew (extensible) |
| `form` | enum | kernel, inshell |
| `variety` | enum | NPX, Independence, Monterey, Carmel, Nonpareil, Butte, Padre, Aldrich, Fritz, etc. (editable list) |
| `grade` | enum | Extra, Supreme, SSR, Fancy, J-Spec, K-Spec, Select Sheller Run (editable) |
| `size` | string | Inshell-only when sized (e.g., 20/22, 23/25, 25/27, 27/30, 30/32, 32/34, 34/36, 36/40) |
| `sliding_scale_pct` | number | For inshell: 60, 70, 80 (editable list) |
| `net_edible` | boolean | Flag for "net edible" basis |
| `crop_year` | string | e.g., "2025/26 new crop", "2024/25 old crop" |
| `packing` | object | `{ unit_size, unit_type, count_per_carton, carton_weight, pallet_config }` (e.g., 50 LB carton, 22.68 KG bag, 10 KG vacuum bag in carton) |
| `origin` | ref → Country Master | USA, Pakistan, Spain, Australia, Iran, Afghanistan, etc. |
| `brand` | ref → Brand Master | Cal Coast, Sierra Valley, Delmar, Supreme, etc. (editable; also "non-branded") |
| `hs_code` | string | Destination-specific HS code override possible |
| `status` | enum | active, inactive, draft |

**Product code auto-generation:** `ALM-SHL-NPX-25/27-DEL-50LBC-US` (Almond / Shelled / NPX / Size / Delmar / 50 LB Carton / US origin).

### 2.2 Counterparty Master (Buyers, Suppliers, Brokers — shared schema with type flag)

```
counterparty_id (PK)
type: [buyer, supplier, broker, reseller_both] — resellers flagged to trade both directions
company_name
legal_entity_name
tax_id / vat_id / nif / mersis_no (jurisdiction-specific)
trade_license_number + expiry_date + document_upload
registered_address
operating_addresses[] (multiple)
country (ref → Country Master)
region (auto-derived from country; e.g., South Asia, MENA, CIS, EU)
phone[], email[], whatsapp_numbers[]
website
primary_currency (ref → Currency Master)
payment_terms_default (ref → Payment Terms Master)
payment_methods_accepted[] (bank_transfer, cash, third_party_payment, LC, CAD, CACD)
credit_limit (value + currency)
kyc_status (pending, approved, rejected, expired) + kyc_expiry_date
sanctions_screening_status + last_screened_date
master_agreement_on_file (bool) + agreement_document_ref
incoterm_preference[] (FOB, CFR, CIF, CNF, DDP, Ex-Warehouse)
preferred_discharge_ports[] (ref → Port Master)
required_documents[] (ref → Document Types Master; destination-specific)
special_contract_clauses[] (governing law, arbitration seat, etc.)
product_preferences[] (variety, form, grade, size, packer brands whitelist/blacklist)
historical_performance {
  total_deals, total_volume, total_value,
  avg_deal_size, avg_margin (suppliers/brokers),
  payment_performance_score (for buyers),
  dispute_claim_count,
  on_time_shipment_rate (suppliers),
  discrepancy_frequency (suppliers)
}
risk_flags[]
assigned_account_manager (ref → Internal User) — for buyers
assigned_procurement_officer (ref → Internal User) — for suppliers/brokers
authority_tier_override (optional: override of value-based approval thresholds for this counterparty)
internal_users[] (company's own sub-users — see §12.2)
status (active, on_hold, blacklisted, prospect)
created_at, updated_at, created_by
```

### 2.3 Reference Masters (all editable by Super Admin / Compliance Officer)

- **Country Master** — all countries, ISO codes, region mapping
- **Port Master** — all ports, country, type (sea/air/land), loading/discharge flags
- **Currency Master** — currency code, symbol, decimal precision, active flag
- **Incoterm Master** — FOB, CFR, CIF, CNF, DDP, Ex-Warehouse, etc., with definition and obligations
- **Payment Terms Master** — structured templates (e.g., "20% advance + 80% CACD", "100% CACD", "10% advance + balance CACD", "3-stage: advance + bank docs + copy docs", "Net Due") each with stages, triggers, defaults
- **Document Types Master** — Commercial Invoice, Packing List, B/L, Phyto, COO, Fumigation Cert, Weight Slip, SGS/Inspection, Halal Cert, Insurance, Health Cert, Beneficiary Cert, Draft B/L, Telex Release Confirmation, Non-GMO, Sliding Scale Test Report, USDA/ABC Inspection, EUR1, Form A GSP (extensible)
- **Brand Master** — per packer, with brand assets (logos, pack photos) for display
- **Compliance Rules Master** — per-destination rules library (fumigation required? ISPM-15? Halal cert? Pre-shipment inspection mandatory? Origin-specific docs?)
- **Unit Conversion Master** — LBS↔KG↔MT, carton sizes, pallet configs

### 2.4 Offer (5 Source Types — each separately tracked and back-linked)

```
offer_id (PK)
source_type: enum [
  1_MAXONS_OWNED_WAREHOUSE,
  2_AFLOAT_CARGO,
  3_PRE_COVERED_SUPPLIER,
  4_OPEN_SUPPLIER_BROKER_OFFER,
  5_RESELLER_SOURCED
]
source_counterparty_id (ref → Counterparty) — NULL for source types 1 & 2 (Maxons-owned)
source_broker_id (ref → Counterparty, nullable) — if routed via broker
warehouse_location (for source type 1: UAE/India/Mersin/Singapore/other)
afloat_vessel_ref (for source type 2: vessel name, booking, current position, ETA)
product_id (ref → Product Master)
available_quantity + unit
source_price + source_currency + source_price_basis (FOB origin, CFR, CIF, ex-warehouse)
validity_from, validity_to
shipment_window (e.g., "April 2026 first-half", "May 2026")
loading_port (ref → Port Master)
eligible_discharge_regions[] (regions this offer can serve)
subject_to_reconfirmation (bool — TRUE for source types 3,4,5)
reconfirmation_sla (hours — supplier must reconfirm within X hours of bid)
rich_media: {
  photos[], inspection_report, lot_docs, brand_assets
  — GATED: only released to buyer upon "serious interest" trigger
}
gated_content_release_triggers[] (firm_bid, reserve_request, advance_intent, sales_manual_unlock)
internal_notes (Maxons-only)
status: enum [draft, submitted_for_approval, approved, live, paused, withdrawn, exhausted, expired]
approval_chain: {
  submitted_by, submitted_at,
  procurement_review: {user, action, timestamp, notes},
  admin_review: {user, action, timestamp, notes},
  finance_review: {user, action, timestamp, notes}
}
maxons_margin_config: {
  type: [fixed_per_supplier, fixed_per_offer, dynamic],
  margin_value_or_formula,
  set_by_user, set_at_timestamp
}
```

### 2.5 Broadcast Offer (buyer-facing representation of an approved Offer)

```
broadcast_id (PK)
offer_id (ref → Offer)
broadcast_scope: {
  by_region[], by_buyer_tier[], by_product_match[], hand_picked_buyer_ids[],
  combined_logic: [AND, OR, custom]
}
pricing_mode: enum [uniform, tier_based, per_buyer_custom, floor_with_bidding]
displayed_price_per_buyer_tier or per_buyer_id
lifecycle: {
  expiry_time, max_quantity_available, auto_close_on_supplier_withdrawal
}
action_options_enabled[] (accept, counter_bid, request_info, reserve_hold, decline)
delivery_channels[] (whatsapp, app, email, pdf_sheet, voice_note)
delivery_format: [plain_text, rich_card, catalog, carousel, pdf, voice]
language_variants[] (en, ar, hi, ur, tr, ru)
buyer_interactions[] (log of views, clicks, bids, accepts, declines per buyer)
status: [scheduled, live, paused, closed, auto_closed]
```

### 2.6 Deal (the transactional entity)

```
deal_id (PK)
deal_number (smart-coded — see §5.1: e.g., MGT-SAL-PAK-2026-0421 / MIX-SAL-ALG-2026-0409)
selling_entity (Maxons General Trading LLC / Maxons Impex DWC LLC / other)
buyer_id (ref → Counterparty)
source_offer_id (ref → Offer) — backward-links to which of the 5 source types
source_counterparty_id (ref — supplier/broker if applicable)
broker_id (ref — if broker involved on sell-side)
product_id (ref)
quantity + unit
contract_price + currency + price_basis (Incoterm)
payment_terms_id (ref) + custom_overrides
payment_schedule[] (stages with %, trigger, method, due_date)
loading_port, discharge_port
shipment_window
shipment_mode: enum [
  direct_ex_origin,
  ex_maxons_warehouse,
  afloat_rerouting,
  transit_via_third_country,
  cross_trade_triangular,
  split_shipment
]
documents_required[] (ref → Document Types; per contract; destination-specific)
document_approval_routing[] (per doc type: internal/buyer/supplier/dual)
originals_release_conditions[] (payment triggers, approval checklist)
originals_routing (direct_to_buyer, to_buyer_bank, held_at_maxons_bank, held_by_supplier, held_by_maxons)
acceptance_type: [soft_accept, hard_accept] — derived from source type hybrid rule
sales_handler_id (ref)
verification_gate_status (pending, passed, failed, escalated, overridden)
dual_control_required (bool — derived from deal value)
status: enum [
  draft, offer_broadcast, bid_received, negotiating, buyer_accepted, sales_verified,
  supplier_reconfirmed, contract_generated, contract_signed,
  in_documentation, docs_drafted, docs_approved, originals_released,
  in_logistics, loaded, in_transit, arrived, delivered,
  payment_pending, part_paid, fully_paid, closed, cancelled, disputed
]
margin_snapshot {contract_margin, realized_margin, variance_reasons[]}
created_at, updated_at, full_state_history[]
```

### 2.7 Contract Document

```
contract_id (PK)
deal_id (ref)
contract_type: enum [buyer_sale, supplier_purchase, broker_confirmation, back_to_back_linked_pair]
contract_number (smart-coded — see §5.1)
template_used_id
entity_issuing (Maxons General Trading LLC / Maxons Impex DWC LLC)
counterparty_id
version + version_history[]
content_fields (structured data filling the template)
special_clauses[]
generated_at
signing_workflow_id (ref)
signed_pdf_url + signed_hash + signing_audit_trail
```

### 2.8 Shipment

```
shipment_id (PK)
deal_ids[] (1+ deals can be consolidated in one shipment; or 1 deal split into multiple shipments)
shipment_mode (per §2.6)
loading_port, discharge_port, transit_ports[]
vessel_name, voyage_number, shipping_line, booking_ref
container_numbers[], container_type (20', 40', 40HC, reefer)
ETD, ETA, actual_departure, actual_arrival
current_position (lat, long, last_updated — from vessel tracking integration)
pre_shipment_compliance_checklist (per destination rules)
loading_instructions_id (ref)
warehouse_release_id (ref — if ex-warehouse)
cost_ledger {
  freight_ocean, freight_inland,
  insurance, fumigation, inspection, documentation_charges,
  port_charges_origin, port_charges_destination,
  demurrage_accrued, bank_charges,
  broker_commission, financing_cost_per_day,
  hedging_cost, fx_gain_loss
}
status (planned, booked, loading, loaded, in_transit, arrived, discharged, delivered, delayed, at_risk)
ai_alerts[] (delay_prediction, port_congestion, weather, geopolitical)
```

### 2.9 Payment

```
payment_id (PK)
deal_id (ref)
direction: enum [incoming_from_buyer, outgoing_to_supplier, outgoing_to_broker_commission, outgoing_third_party]
payer_counterparty_id / payee_counterparty_id
amount + currency
payment_method (bank_transfer, cash, third_party, LC, CAD, CACD settlement)
bank_account_used (ref → Bank Account Master per entity)
scheduled_due_date
actual_received_date
reconciliation_source (manual, bank_api, buyer_upload_swift, ai_reconciled)
swift_reference, tt_reference, cash_receipt_ref, third_party_details
fx_rate_at_payment + fx_gain_loss
status (scheduled, reminder_sent, overdue, received, reconciled, disputed, forfeited)
audit_trail[]
```

### 2.10 User

```
user_id (PK)
company_id (ref → Counterparty for external; NULL / Maxons-tagged for internal)
portal: enum [maxons_internal, buyer, supplier, broker]
role (ref → Role Master)
authority_tier (1, 2, 3, 4)
email, phone, whatsapp, preferred_language, preferred_currency, preferred_units
auth {
  password_hash, 2fa_enabled, biometric_enabled,
  last_login, active_sessions[], ip_whitelist[]
}
assigned_accounts[] (for Maxons sales handler: which buyers; for procurement officer: which suppliers)
permissions_override[] (granular overrides on top of role defaults)
invited_by (ref — for external company sub-users)
status (active, suspended, offboarded, pending_invitation)
```

---

## 3. THE FIVE OFFER SOURCE TYPES (core taxonomy)

Each offer originates from exactly one of five separately categorized sources, all backward-linked:

| # | Source Type | Description | Ownership | Reconfirmation? |
|---|---|---|---|---|
| 1 | **Maxons-Owned Warehouse** | Physically in Maxons' possession at UAE / India / Mersin / Singapore / other location | Maxons | Not required |
| 2 | **Afloat Cargo** | Maxons-owned, on the water, destination flexible or fixed | Maxons | Not required |
| 3 | **Pre-Covered from Supplier** | Locked price/qty with packer or broker, not yet shipped (back-to-back style) | Supplier (paper-locked to Maxons) | Not required on source; reconfirm shipment readiness only |
| 4 | **Open Supplier/Broker Offer** | Offer exists but subject to availability + reconfirmation | Supplier/Broker | Required — reconfirmation SLA enforced |
| 5 | **Reseller-Sourced** | Another trader (reseller acting as supplier to Maxons) | Reseller | Required |

**Acceptance logic (Hybrid — from Q2/Q3):**
- Source types 1 & 2 → **Hard Accept** (buyer's "Accept" instantly reserves stock; sales approval is final internal compliance check, typically routine)
- Source types 3, 4, 5 → **Soft Accept** (buyer's "Accept" = intent to buy; requires supplier/broker reconfirmation before binding contract is generated)

**Broadcast capability:** All five source types can be broadcast by the sales team. Each offer is independently viewable in the Maxons sales team's offer panel, with region-mapping and per-region filtering. Broadcasts are governed by approval flow (§4).

**Back-link integrity:** Every deal carries forward the source_offer_id → source_counterparty_id chain so that at any point in the workflow, the system knows exactly which supplier/broker the goods came from, for payment routing, reconciliation, discrepancy attribution, and commission calculation.

---

## 4. OFFER ORIGINATION & APPROVAL FLOW

### 4.1 Offer Ingestion (multi-channel)

Offers enter the system via three channels:

**(a) Supplier/Broker Portal — direct entry.** Suppliers and brokers log into their portal and post offers via a structured form (product, qty, price, validity, shipment window, destination eligibility). Rich media (photos, inspection reports) can be attached but remain gated until buyer serious-interest trigger.

**(b) WhatsApp/Email ingestion — AI-parsed.** Suppliers often send offers via WhatsApp/email ("Cal Coast NPX 25/27 new crop $3.15 CFR Karachi May shipment"). AI parses unstructured text and auto-creates a structured draft offer. Procurement officer reviews and either submits for approval or asks for clarification.

**(c) Maxons Internal — owned/afloat stock.** Procurement/warehouse manager posts owned-stock or afloat-cargo offers directly (source types 1 and 2), bypassing external origination.

### 4.2 Approval Chain

Every offer, before becoming broadcastable to buyers, passes through:

1. **Procurement Officer** — reviews offer details, negotiates with supplier/broker if needed, sets proposed margin (or applies fixed margin per supplier relationship), submits for approval.
2. **Procurement Head / Admin** — reviews margin, source reliability, credit/commercial fit; approves, rejects, or sends back for revision.
3. **Finance Review (for large offers above Tier 2)** — validates FX exposure, payment term viability, supplier payable impact.
4. **Admin / Super Admin (for Tier 3 and 4 offers)** — final sign-off.

Margin can be **fixed per supplier relationship** (stored on the counterparty profile, auto-applied to all their offers) or **set per-offer** at approval time. Either way, margin is never shown to buyers.

### 4.3 Offer Status Transitions

```
draft → submitted_for_approval → [procurement_approved | procurement_rejected]
      → admin_approved → [finance_approved if required] → live
live → paused | withdrawn | exhausted | expired
```

Every transition is logged with user, timestamp, and reason.

---

## 5. CONTRACT GENERATION & SMART NUMBERING

### 5.1 Smart Contract Numbering

Format: `{ENTITY_CODE}-{TRADE_TYPE}-{DESTINATION_CODE}-{YEAR}-{SEQUENCE}`

| Segment | Values |
|---|---|
| `ENTITY_CODE` | MGT (Maxons General Trading LLC), MIX (Maxons Impex DWC LLC), future entities |
| `TRADE_TYPE` | SAL (sales / buyer contract), PUR (purchase / supplier contract), BRK (broker confirmation), B2B (back-to-back linked pair) |
| `DESTINATION_CODE` | 3-letter country or port code (PAK, IND, NEP, ALG, GEO, ITA, TUR, UAE, etc.) |
| `YEAR` | 4-digit |
| `SEQUENCE` | 4-digit zero-padded per entity + year |

Examples:
- `MGT-SAL-PAK-2026-0421` (Maxons General Trading → Qureshi Impex sale to Pakistan)
- `MIX-SAL-ALG-2026-0409` (Maxons Impex → EURL Badii sale to Algeria)
- `MGT-PUR-USA-2026-0085` (Maxons General Trading → US supplier purchase)
- `MGT-B2B-PAK/USA-2026-0421` (back-to-back paired contract)

This enables instant analytics by entity / trade-type / destination.

### 5.2 Contract Templates

- **Dynamic master template** with conditional clauses. System picks template variant based on: entity, trade-type, Incoterm, payment-term structure, destination compliance rules.
- **User-provided reference templates** (from Muzammil's attached PDFs) are stored as the baseline; system preserves Maxons' standard terms, bank details per entity, and jurisdictional clauses (Dubai courts / SCTC arbitration).
- **Buyer-specific clause library** — any buyer profile can carry custom clauses (e.g., governing law override, force majeure variant) that auto-inject on contract generation.
- **Back-to-back linked pair**: When Maxons sells to a buyer on pre-covered/open-supplier basis (source types 3, 4, 5), system auto-generates **both** the buyer sale contract AND the matched supplier purchase contract, cross-referenced internally but never cross-visible.

### 5.3 Digital Signing (Hybrid)

- Primary: DocuSign / Adobe Sign / Dropbox Sign integration (commercial, audit-trail compliant)
- For UAE counterparties: UAE Pass integration
- In-app signing with OTP via WhatsApp/email
- Fallback: manual upload of signed scan (for counterparties insisting on wet-ink)
- Per-counterparty configurable default signing method (stored on profile)

### 5.4 Signing Sequence (Configurable per Deal)

Default options: Maxons-first, counterparty-first, parallel. Configurable per deal/counterparty.

**Back-to-back enforcement (recommended):** For deals on source types 3, 4, 5, the **supplier contract must be signed BEFORE the buyer contract is released for buyer signing** — prevents Maxons from being contractually bound to deliver without its upstream supply being locked. Override possible only by Super Admin with logged reason.

### 5.5 Post-Signing Distribution

Auto-email signed PDF to: buyer (customized view — no supplier refs), supplier (customized view — no buyer refs), broker (commission view only), internal sales handler, documentation team, finance team. Auto-file in deal folder. Auto-push to buyer WhatsApp with confirmation receipt. Auto-trigger next workflow stage (handoff to documentation/logistics).

---

## 6. SALES HANDLER VERIFICATION GATE

### 6.1 Assignment (Hybrid Rule)

Sales handler auto-assigned based on (in priority order):
1. Primary account manager mapped on buyer profile (stable relationship)
2. Region specialist fallback (e.g., Pakistan deals → Pakistan specialist)
3. Source-based fallback (e.g., Mersin warehouse deals → Mersin handler)
4. Manual override by Sales Lead

Backup handler auto-named for leave coverage.

### 6.2 Verification Checklist (auto-run by system; handler confirms)

The gate runs automated checks and displays PASS/FAIL per item to the sales handler:

- ✅ Contract terms match buyer profile (payment, Incoterm, currency, specs: variety/form/grade/size)
- ✅ Supplier/broker side matches back-to-back (price spread positive, terms aligned, delivery windows compatible) — for source types 3, 4, 5
- ✅ Buyer credit limit not exceeded with this deal added to exposure
- ✅ KYC / trade license / sanctions status current and valid
- ✅ All required documents per buyer profile are listed in the contract
- ✅ Packer brand matches buyer's whitelist (if specified) and not on blacklist
- ✅ Discharge port / destination feasible with chosen Incoterm
- ✅ Quantity matches available source (warehouse stock / afloat / covered / confirmed supplier)
- ✅ Margin threshold met (above Maxons' margin floor for this buyer/product/region)
- ✅ Special clauses for this buyer present (governing law, arbitration, force majeure)
- ✅ Destination-specific compliance requirements embedded (per Compliance Rules Master)

### 6.3 Fail Handling (Escalate to Sales Lead)

Per Q5 answer: **failed checks escalate to Sales Lead.** Sales Lead reviews and:
- Returns to originator with specific fail reasons (checklist-style)
- Approves with override (requires logged reason, audit trail entry)
- Routes to Finance Head for credit/margin issues
- Notifies buyer if buyer-facing reconfirmation needed

### 6.4 Autonomous Alerts & Reminders (Per Q5 D)

System works autonomously for alerts with SLA timelines set by Sales Lead:
- Gate pending > X hours → auto-reminder to sales handler
- Gate pending > 2X hours → auto-escalate to Sales Lead
- Gate pending > 3X hours → auto-escalate to Admin
- Buyer-awaiting-reconfirmation > Y hours → auto-reminder to buyer via WhatsApp + email
- Supplier reconfirmation pending > Z hours → auto-reminder to supplier

All timelines configurable per deal type by Sales Lead.

### 6.5 Dual-Control for High-Value Deals

Tier 3 deals ($250K–$1M) and Tier 4 deals (>$1M) require **two different team members** to approve the gate (sales handler + Sales Lead, or sales handler + Finance Head) — prevents fraud/error on large exposures.

---

## 7. DOCUMENTATION MODULE

### 7.1 Document Types (Per-Contract Selection)

Each contract, at creation, selects which document types apply (from the Document Types Master). Selection can inherit from buyer profile defaults and destination compliance rules. Example sets from the Maxons sample contracts:

- **Standard baseline (all deals):** Commercial Invoice, Packing List, Bill of Lading, Phyto, Certificate of Origin
- **Pakistan add-ons:** Fumigation Certificate (mandatory per Qureshi contract)
- **Algeria/EU add-ons:** Potentially Halal Cert, Health Cert, EUR1
- **Contract-specific:** SGS/Inspection, Non-GMO, Sliding Scale Test Report, Weight Slip, Beneficiary Certificate, Draft B/L, Telex Release, USDA/ABC Inspection

New document types can be added to the master at any time.

### 7.2 Draft Document Generation (Hybrid)

- **AI auto-draft** for Maxons-internal docs (Invoice, Packing List, Weight Slip) pulling from contract + loading data + weight slip
- **Human upload** for supplier-generated docs (B/L, Phyto, COO, Fumigation) — uploaded to the deal folder and AI-scanned for consistency with contract
- **OCR + data extraction** on uploaded PDFs to populate structured fields automatically

### 7.3 Approval Routing (Per-Contract Checkmark)

At contract creation, sales handler ticks **per document type** who approves:
- Internal Maxons documentation lead only
- Buyer approval required
- Supplier approval required
- Dual (Maxons internal + buyer)

Routing rules can inherit from buyer profile defaults and destination rules, then be customized per deal.

### 7.4 Discrepancy Handling

When any reviewer rejects a draft:
- System records discrepancy with structured reason (checklist: wrong consignee, wrong HS code, wrong weight, missing stamp, wrong port, spec mismatch, etc.)
- Auto-routes to responsible party (supplier/broker/internal) with SLA timer
- Tracks time-to-resolve; demurrage liability auto-assigned per delay attribution
- Auto-generates debit note draft against responsible party if demurrage accrues
- Blocks progression to originals release until discrepancy closed

### 7.5 International Trade Security Gate (Originals Release)

Originals are **never** released from Maxons' control until ALL of the following are TRUE (per Q6 E — "should secure us internationally"):

1. ✅ Signed contract on file (both parties)
2. ✅ Payment condition per contract's payment schedule stage met (advance received for 20/80 deals; full payment for 100% CACD; bank submission for LC stage)
3. ✅ All required drafts approved per routing rules
4. ✅ Sales handler final approval
5. ✅ No open discrepancies
6. ✅ Supplier-side documents complete (for back-to-back deals)
7. ✅ Finance Head approval (for Tier 3+ deals)

If any condition fails, release is blocked with a clear reason. Super Admin can override with full audit trail entry.

### 7.6 Originals Routing (Per Contract Configuration)

All five options supported, configured per deal based on payment terms and counterparty preferences:
- Couriered directly to buyer
- Couriered to buyer's bank
- Held at Maxons' bank for CAD/CACD collection
- Held by supplier until Maxons pays (back-to-back)
- Held by Maxons until buyer pays (most common — matches Maxons' standard T&Cs: "property of Maxons until full payment")

Chain-of-custody log records every physical/digital movement of original documents.

---

## 8. LOGISTICS MODULE

### 8.1 Six Shipment Modes Supported

| # | Mode | Example |
|---|---|---|
| 1 | **Direct ex-origin** | Packer loads at origin port → ships to buyer's port (Oakland → Karachi, Qureshi deal) |
| 2 | **Ex-Maxons warehouse** | UAE / India / Mersin / Singapore warehouse → buyer's port |
| 3 | **Afloat re-routing** | Cargo already on water, destination reassigned mid-voyage based on new sale |
| 4 | **Transit via third country** | Oakland → Kolkata port → road to Nepal via Birgunj customs (MA Laxmi deal) |
| 5 | **Cross-trade / triangular** | Supplier ships directly to buyer; Maxons never takes physical possession (pure paper trade) |
| 6 | **Split shipment** | One contract, multiple vessels (EURL Badii: 1 FCL per vessel with 10-day gap) |

### 8.2 AI-Driven Vessel / Freight Selection

- AI recommends optimal vessel/route per deal based on: cost + transit time + carrier reliability score + buyer's required arrival window + port congestion data
- Freight quote aggregation from multiple forwarders; rate comparison dashboard
- Carrier API integrations: Maersk, MSC, CMA-CGM, Hapag-Lloyd (extensible)
- Real-time vessel tracking: MarineTraffic / Vizion / Project44 integration
- Proactive delay alerts (weather, port congestion, geopolitical — e.g., Red Sea routing issues)
- Dynamic ETA recalculation based on live data
- Timely follow-ups auto-triggered at ETD, loading, departure, mid-voyage, ETA-72h, ETA, arrival, discharge, delivery

### 8.3 Loading Instructions Workflow

- Sales handler triggers LI generation
- System auto-pulls from contract: product spec, quantity, packing, brand, fumigation requirement, loading port, destination, special instructions (e.g., "cargo in transit to Nepal via Birgunj customs on consignee risk")
- LI routed to: supplier (direct origin loads) / warehouse manager (Maxons stock) / broker (brokered deals)
- Confirmation loop: receiving party confirms LI acceptance → triggers booking/loading stage
- Change requests routed through sales handler with full history

### 8.4 Pre-Shipment Compliance (Internal + External)

Compliance Rules Master maintains per-destination requirements:
- Fumigation requirement (yes for Pakistan per Qureshi contract; etc.)
- ISPM-15 pallets
- Halal certification (Muslim-majority markets)
- Phyto from origin country department
- Pre-shipment inspection (SGS / Intertek / buyer nominated / none)
- Origin-specific documents (USDA for US, EUR1 for EU, Form A for GSP)
- Destination-specific customs requirements

System auto-populates LI and document checklist from destination rules. AI flags missing items before shipment.

### 8.5 Warehouse Management

Per location (UAE / India / Mersin / Singapore / future):
- **Stock-in-hand tracker** — by lot, with variety/form/grade/size/packer/crop year traceability
- **Reserved vs available** — auto-reserve on deal confirmation (hard accept for source types 1, 2)
- **Aging report** — inventory financing cost per lot
- **Quality/moisture test results** per lot
- **Repacking tracker** — if Maxons repacks one brand/size to another for specific buyers, full chain recorded
- **Multi-location transfer** — moving stock between Maxons warehouses with inter-company posting if different entities

### 8.6 Cost Tracking Per Shipment (True Margin Visibility)

Every shipment accumulates actual costs:
- Freight (ocean + inland)
- Insurance
- Fumigation / inspection fees
- Documentation charges
- Port charges (origin + destination)
- Demurrage accrued
- Bank charges
- Broker commission (if applicable)
- Financing cost (inventory days × rate)
- FX gain/loss
- Hedging cost (if hedged)

**Landed cost per unit** auto-calculated → **Real Net Margin vs Contract Margin** visible on every deal, with variance analysis.

---

## 9. PAYMENT, BANKING & FINANCIAL CORE (Full ERP)

### 9.1 Payment Terms Library (Structured, Not Free Text)

Based on Maxons sample contracts, standard templates:
- **100% CACD** — 100% against copy of documents
- **20% advance + 80% CACD** — most common Maxons term
- **10% advance + balance CACD** — Shezer Gida pattern
- **3-stage: 20% advance + part via bank documents + balance on copy docs** — Qureshi pattern
- **100% CAD via bank** — Ciavolino Roma pattern
- **Net Due** — Raj Wali special case

Each template is a structured payment schedule (stages with %, trigger, method, due date). New templates addable by Finance Head.

### 9.2 Buyer Payment Reconciliation (Hybrid)

- **Primary:** Bank API integration with Emirates Islamic Bank (MGT) and NBF (MIX), auto-reconcile incoming SWIFT/TT to deal
- **Fallback:** Manual entry by accounts team with SWIFT reference
- **Buyer-triggered:** Buyer uploads SWIFT/TT copy via app/WhatsApp → accounts verifies
- **AI-assisted matching:** Fuzzy match on amount + buyer name + deal reference to auto-suggest reconciliation

### 9.3 Payment Schedule Enforcement

- Auto-generate schedule from contract payment terms
- Auto-reminders at intervals before each milestone (configurable: 7 days, 3 days, 1 day, due date, overdue)
- Auto-escalation on overdue: sales handler → Sales Lead → Admin → Super Admin
- **Progression blockers:** shipment loading blocked until advance received (for 20/80 deals); originals release blocked per International Trade Security Gate
- Auto-trigger **forfeiture clause** if buyer cancels after advance (per standard T&C clause 7)
- All-of-the-above combined enforcement

### 9.4 Supplier / Broker Payment Flow (Parallel to Buyer-Side)

- System tracks Maxons' payable to supplier alongside receivable from buyer
- Configurable trigger rules per supplier:
  - After buyer advance received
  - After buyer full payment received
  - After B/L in hand
  - Fixed date regardless
  - Custom per supplier contract
- Payment block if discrepancy logged against supplier
- FX tracking per deal (supplier USD payable vs buyer EUR receivable → FX exposure)
- Broker commission tracking — separate line item, triggered per broker's agreed terms (per kg / flat / % of value)

### 9.5 Payment Methods (Multi-Method, Multi-Party)

System supports, selectable per deal or fixed per counterparty:
- **Bank transfer** — standard SWIFT/TT
- **Cash payment** — recorded with official receipt reference; receipt anti-fraud checks
- **Third-party payment** — payment routed via a third party (e.g., a group company or nominated payer); system records payer identity, relationship to counterparty, and auto-links to the correct receivable/payable
- **Letter of Credit (LC)** — at sight / usance 30/60/90; LC document management (opening, advising, confirming, discrepancy, negotiation, acceptance, payment)
- **CAD / CACD** — document-linked settlement (most common Maxons pattern)

Each counterparty profile carries accepted payment methods. Each deal can override with justification.

### 9.6 Multi-Currency & FX Handling

- **Base reporting currency per entity** (AED for local books; USD for international book; consolidated in USD or AED at group level — configurable)
- **Real-time FX rates** — OANDA / ECB / Reuters feed, updated hourly
- **FX lock at contract** (book rate) vs **FX at receipt** (realized rate) → FX gain/loss per deal auto-calculated
- **Hedging record** — if Maxons hedges a deal via FX forward, system tracks hedge vs exposure, mark-to-market
- **AED conversion note** — auto-inserted on UAE-payable deals (per MA Laxmi pattern: "In case of payment in UAE, conversion rate is 1 USD = AED 3.675")

### 9.7 Banking Relationships

Per-entity bank master:
- **Maxons General Trading LLC** → Emirates Islamic Bank (primary) + Bank of New York Mellon (intermediary USD)
- **Maxons Impex DWC LLC** → National Bank of Fujairah
- **Extensible** — add new banks, add accounts per entity, configure which currency/account for which deal type

Document routing to correct bank auto-based on selling entity + deal. Bank details auto-populate on contract/invoice per entity.

### 9.8 Full ERP Capabilities (Almond-Trade Specific)

Per Q8-F answer ("should have complete ERP related to almonds trade"), the system IS the ERP:

- **AR/AP ledgers** per entity
- **General ledger** per entity + consolidated
- **Chart of accounts** almond-trade-specific (COGS by source type, freight, insurance, demurrage, financing cost, FX gain/loss, broker commission, marketing, office, salary, etc.)
- **Invoicing** — commercial invoices auto-generated from deals
- **Credit/Debit notes** — for quantity/quality adjustments
- **Cash flow management** — rolling 90-day forecast
- **Budget vs actual** — per entity, per region, per product, per team member
- **Expense management** — non-deal expenses captured (travel, office, marketing, ESR/audit fees)
- **Fixed assets** — warehouse equipment, vehicles, IT
- **Inventory valuation** — FIFO/weighted-average per lot with automated COGS posting
- **Statutory reports** — UAE VAT, UAE Corporate Tax (9% on taxable mainland LLC; 0% on qualifying free zone income), Economic Substance, ESR, audit-ready financials per entity
- **Bank reconciliation** — per entity, per account, auto + manual

Integration: Optional sync with external accounting (Zoho Books / QuickBooks / Tally / Odoo / Xero) via API; or CropsIntel serves as the accounting system of record.

### 9.9 Deal-Level & Aggregate P&L / Analytics

**Per deal:**
Sale price − COGS (source price × quantity) − freight − insurance − documentation − port charges − demurrage − broker commission − FX gain/loss − financing cost − bank charges − other direct costs = **Real Net Margin**

**Per buyer:** Lifetime revenue, lifetime margin, avg deal size, payment performance, dispute history, last activity
**Per supplier:** Lifetime spend, margin contribution, reliability score, discrepancy rate, avg on-time %
**Per broker:** Total deals routed, total volume, commission paid, margin contribution
**Per region:** Revenue, margin, deal count, avg margin, growth trend
**Per product:** Volume, revenue, margin, velocity
**Per entity:** Full P&L, balance sheet, cash flow
**Consolidated:** Group P&L with inter-company eliminated
**Per team member:** Deals closed, margin delivered, negotiation win rate, avg time-to-close, buyer portfolio health

---

## 10. AI LAYER (Embedded Across Every Stage)

### 10.1 AI at Offer Origination (Procurement-Facing)

- **Offer ingestion parsing** — AI reads unstructured supplier/broker WhatsApp/email and auto-creates structured offer draft
- **Offer deduplication** — clusters the same product from multiple brokers so procurement sees the best source
- **Price anomaly detection** — flags offers significantly above/below market using CropsIntel + USDA/ABC data
- **Supplier reliability scoring** — tracks historical fulfillment, discrepancy frequency, on-time rate; flags risk

### 10.2 AI at Buyer Matching (Sales-Facing)

- **Smart offer-buyer matching** — suggests which buyers to broadcast each offer to based on profile, acceptance history, predicted buying cycle
- **Buyer intent detection** — reads WhatsApp conversation signals ("next month looking for inshell") → auto-flags latent demand
- **Churn risk scoring** — flags buyers going quiet vs their usual cycle for re-engagement
- **Lookalike prospecting** — identifies new prospects matching top-buyer profiles for outreach

### 10.3 AI at Negotiation

- **AI-suggested counter-prices** based on buyer history, market, inventory pressure, margin floor
- **Conversation sentiment analysis** — detects if buyer is walking, bluffing, or price-sensitive
- **Auto-reply drafting** — drafts replies for sales handler review
- **Escalation triggers** — flags deals needing senior intervention

### 10.4 AI at Contract / Documentation

- **Contract auto-generation** — composes contract text from deal parameters, picks right template, inserts buyer-specific clauses
- **Contract discrepancy scanner** — pre-send check against buyer profile, margin floor, credit limit, compliance
- **Document auto-drafting** — invoice, packing list, COO auto-drafted from contract + loading data
- **Document verification** — AI checks uploaded supplier docs against contract for consistency (consignee, spec, weights) and flags mismatches
- **OCR + extraction** — reads uploaded PDFs, extracts structured data automatically

### 10.5 AI at Logistics

- **Optimal vessel/route recommendation** — cost + speed + reliability + arrival window
- **Shipment risk alerts** — predicts delays (congestion, weather, geopolitical); proactive warnings to sales + buyer
- **Dynamic ETA recalculation** — live tracking + port conditions
- **Compliance auto-check** per destination against Compliance Rules Master

### 10.6 AI at Finance

- **Payment prediction** — per-buyer delay probability, cash flow risk flagging
- **FX hedging recommendations** — suggests hedge timing/amount based on open-deal exposure
- **Dynamic credit limit adjustment** — recommends increases/decreases based on payment performance
- **Margin optimization** — analyzes completed deals and recommends pricing adjustments per buyer/product/region

### 10.7 AI at Analytics / Command Center (Muzammil-Facing)

- **Natural language querying** — "Top 10 buyers by margin this quarter, India only" → instant dashboard
- **Auto-generated daily/weekly briefings** — morning summary of deals, actions, risks, market moves, team performance
- **Market intelligence synthesis** — USDA/Almond Board/news + Maxons' own flow → directional recommendations
- **Strategic scenario modeling** — "What if California crop drops 15%?" → simulates across open positions
- **Team performance insights** — surfaces top/bottom performers and bottlenecks

### 10.8 AI at Buyer-Facing Layer

- **AI concierge** in buyer app/WhatsApp — answers buyer questions 24/7 (market, ETA, similar products, reorder) without tying up sales
- **Predictive reorder suggestions** — based on buyer's order cycle
- **Multi-language live translation** — sales writes English; buyer reads Arabic/Hindi/Urdu/Turkish/Russian seamlessly (with human-review gate for contract-grade content)

### 10.9 AI Safety / Governance (Per Q10-I)

- **Confidentiality wall**: AI **never** discloses to external parties (buyers/suppliers/brokers) Maxons' internal contacts, internal logic, margins, margin floors, reasoning chains, team bottleneck data, or cross-portal information. Outputs are scrubbed before cross-portal delivery.
- **Human-in-the-loop on anything binding** — AI drafts, humans confirm (contracts, payments, broadcasts, external messages)
- **Audit log for every AI decision** — what AI recommended, what human chose, for learning + accountability
- **Confidence thresholds** — AI auto-executes only below confidence floor; above that, recommends + waits for human click
- **Authority-based override** — certain AI actions (large broadcasts, pricing changes, new supplier onboarding) always require human per §12 Authority Matrix
- **Continuous learning** — AI improves from outcomes (deal success rate, margin delivered, prediction accuracy), with learning loop governed by Super Admin
- **AI is both invisible (background automation) and visible (chat-style copilot)** — users can summon AI at any screen for questions; AI also runs silently on tasks they don't see

---

## 11. BUYER-FACING EXPERIENCE (WhatsApp + App)

### 11.1 Offer Delivery Formats (All Supported, Selectable Per Broadcast)

- Plain text message (WhatsApp)
- Rich card with image + buttons (WhatsApp Business interactive template)
- Catalog push (WhatsApp Commerce catalog)
- Carousel for side-by-side comparison
- PDF offer sheet (branded, per-buyer customized)
- AI-generated voice note (common preference in South Asia / MENA)
- Email with rich HTML

### 11.2 Gated Rich Content (Per Final Q12 Addition)

Product photos, brand imagery, lot-level inspection photos, origin docs, quality data are **locked** by default on offers. Buyer must trigger **serious interest** to unlock:
- Firm bid placed (bid is committal within window)
- Reserve/hold request
- Advance-payment intent signaled
- Sales handler manual unlock (per-buyer whitelisting)

This protects Maxons' supplier relationships and prevents commercial-intelligence extraction by tire-kickers.

### 11.3 In-App Buyer Marketplace

- **Offer grid** — all active offers matching buyer's region + profile + allowed source types
- **Filters** — variety, form, grade, size, packer brand, destination, price range, shipment window
- **Watchlist + price alerts** — bookmark offers; notify on price drops or similar new offers
- **Historical price chart** per product — CropsIntel-integrated (USDA / ABC data + Maxons' own deal history for benchmark)
- **AI recommendations** — "Buyers like you are buying NPX 25/27 Cal Coast at $X this week"
- **One-tap reorder** — repeat last accepted offer with same terms
- **Real-time chat thread** per offer with sales handler (WhatsApp + in-app synced — single thread)

### 11.4 Negotiation Mechanics (All Modes)

- **Counter-bid** → goes to sales handler queue; handler accepts / counters / rejects
- **Multi-round negotiation history** preserved, timestamped
- **Firm bid mode** — buyer locks bid for X hours; Maxons must respond in window or buyer walks
- **Blind-bid mode** — other buyers' bids invisible
- **Auction mode** — for high-demand offers (new crop allocation), top N buyers invited, highest bid wins in window
- **AI-suggested counter** — sales handler sees AI recommendation before clicking ("Accept at $3.15; floor is $3.10; buyer's historical avg is $3.12")

### 11.5 Offer Personalization

- **Per-buyer view** — profile-filtered offers, tier-based or per-buyer custom pricing, buyer-currency auto-conversion with timestamped FX rate, multi-language
- **Categorized offers** — e.g., "New Crop NPX for India," "Inshell for Turkey" — buyers can subscribe to categories
- **General offers with filters** — open-to-all offers where buyer applies own filters
- **Mix and match** — sales can broadcast some offers personalized, some categorized, some general

### 11.6 Omnichannel Conversation

- Every WhatsApp message to/from buyer auto-logs in buyer profile (full history searchable)
- Sales team can reply from CropsIntel dashboard OR from WhatsApp — both sync
- AI drafts replies, suggests offers based on conversation context, flags important signals to procurement
- Outside 24-hour WhatsApp window, system uses approved message templates (library of approved templates per use case, per language)
- Missed messages auto-escalate if no response within SLA (e.g., 2 hours during working hours)

### 11.7 Buyer Company Multi-User Model

- **Company Admin** (primary owner/decision-maker) invites and manages their own sub-users
- Sub-user roles within buyer company: Finance (payment screens), Ops (shipments + docs), Procurement/Trading (bids + acceptance), View-Only (read dashboards)
- Per-user authority limits (e.g., junior can accept up to $50K; admin required above)
- Company Admin fully controls team composition — Maxons never provisions buyer's sub-users

---

## 12. MULTI-USER AUTHORITY MATRIX & ROLE-BASED ACCESS CONTROL

### 12.1 Maxons Internal — 14 Roles

| # | Role | Can See | Can Create/Edit | Can Approve |
|---|---|---|---|---|
| 1 | **Super Admin** | Everything across all entities | Everything | Everything (Tier 4) |
| 2 | **Procurement Head** | All source data, margins, supplier/broker performance | Supplier/broker profiles, offer margins | Offer approvals up to Tier 3 |
| 3 | **Procurement Officer** | Assigned suppliers/brokers, offers they handle | Offer drafts, negotiations | Tier 1 only |
| 4 | **Sales Lead** | All sales team activity, all buyer book | Team assignments, escalation overrides | Deal approvals up to Tier 3 |
| 5 | **Sales Handler** | Assigned buyers only | Broadcasts, negotiations, deal creation (own book) | Tier 1 only |
| 6 | **Documentation Lead** | All deals in documentation stage, discrepancy log | Doc approval routing, discrepancy resolution | Originals release (per Security Gate) |
| 7 | **Documentation Officer** | Assigned deals | Draft uploads, OCR intake, routing | Draft-level only |
| 8 | **Logistics Head** | All shipments, all warehouses, cost ledger | Vessel bookings, warehouse transfers | Shipment-level Tier 2 |
| 9 | **Logistics Officer** | Assigned shipments | LI creation, tracking updates | Execution-level only |
| 10 | **Warehouse Manager (per location)** | Own location inventory | Stock movements, repacking records | Local operations |
| 11 | **Finance Head** | All financial data, consolidated P&L, bank relations | Payment approvals, FX hedging | Tier 3 financial actions |
| 12 | **Finance Officer / Accounts** | AR/AP, reconciliations, invoices | Invoice generation, reconciliation entries | Tier 1 financial |
| 13 | **Compliance Officer** | KYC, sanctions, trade licenses, audit trail | Compliance records, screening results | Counterparty onboarding |
| 14 | **Analyst / Read-only** | Dashboards + reports (scoped) | Nothing | Nothing |

### 12.2 External Company (Buyer / Supplier / Broker) — 6 Roles

| # | Role | Permissions |
|---|---|---|
| 1 | **Company Admin** | Full authority for their company, invites + manages team, sets internal authority limits |
| 2 | **Finance User** | Views invoices, uploads payment proofs, financial screens only |
| 3 | **Ops User** | Views shipments, approves doc drafts, tracks cargo |
| 4 | **Procurement/Trading User (buyers)** | Places bids, accepts offers up to own authority limit |
| 5 | **Sales User (suppliers/brokers)** | Posts offers, negotiates with Maxons procurement |
| 6 | **View-Only User** | Read-only dashboard (e.g., senior leadership monitoring) |

### 12.3 Value-Based Authority Tiers (USD-equivalent)

| Tier | Range | Approver Required |
|---|---|---|
| 1 | up to $50K | Sales Handler / Procurement Officer |
| 2 | $50K – $250K | Sales Lead / Procurement Head |
| 3 | $250K – $1M | Finance Head co-approval required |
| 4 | above $1M | Super Admin approval |

**Applies to:** deal acceptance, margin override, credit limit override, new counterparty onboarding, supplier payment release, contract deviation from standard terms, shipment cost overrides.

### 12.4 Audit Trail

- **Every action logged**: user, timestamp, IP, device, state-before, state-after
- **Immutable log** — no one (including Super Admin) can edit history
- **Accessible** to Super Admin + Compliance Officer
- **Exportable** for UAE ESR / VAT / Corporate Tax audits
- **AI decisions** logged separately with human confirmation trail

### 12.5 Access Delegation & Time-Bound Access

- Role delegation (e.g., Sales Lead on leave → delegates to alternate for 2 weeks)
- Time-bound guest access (external auditor: read-only for 1 month)
- Auto-revoke on offboarding (HR flow integration)

### 12.6 Data Visibility Isolation Rules (Enforcing §1.2 Info-Wall)

- Sales Handler A cannot see Sales Handler B's buyer book (unless Sales Lead enables)
- Procurement cannot see Sales' real-time buyer negotiations (unless needed on a specific deal)
- Buyer portal never exposes supplier identity, supplier price, or Maxons margin
- Supplier/broker portal never exposes buyer identity or final sale price — only "offer accepted for [destination region]"
- Broker portal shows commission earned, never full deal margin
- Warehouse Manager at Mersin cannot see UAE warehouse data unless Logistics Head enables

### 12.7 Authentication Security

- Email + password + OTP (SMS / WhatsApp) on every login
- Optional biometric on mobile (Face ID / Touch ID)
- Session timeout for sensitive roles (Finance, Admin) — re-auth every X hours
- IP whitelist option for Super Admin
- Mandatory 2FA for any Tier 2+ action

---

## 13. DASHBOARDS, NOTIFICATIONS & DAILY OPERATING RHYTHM

### 13.1 Super Admin (Muzammil) Command Center

- **Live deal pipeline** — offer → broadcast → negotiating → confirmed → signed → logistics → delivered → paid (funnel with $ value + count per stage; filter by entity/region/product)
- **Today's cash picture** — incoming payments expected today/week, outgoing supplier payments due, open FX exposure, bank balances per entity
- **Risk alerts panel** — overdue payments, open discrepancies, delayed shipments, compliance expiries, credit-limit breaches, margin-floor breaches
- **Market snapshot** — CropsIntel-integrated USDA / ABC data, price trends for active varieties, industry news filter
- **Team performance** — sales handler leaderboard, deals closed this week/month, avg negotiation time, win rate, margin delivered
- **AI briefing card** — auto-generated morning summary: deals needing attention, offers awaiting margin approval, at-risk deals, market moves
- **Natural language query bar** — ask anything; AI answers with charts/data
- **P&L snapshot per entity** — MGT, MIX, consolidated; MTD, QTD, YTD

### 13.2 Role-Specific Default Dashboards

| Role | Default Dashboard |
|---|---|
| Procurement Head | Incoming offers awaiting margin approval, supplier scorecards, 5-source-type inventory levels, origin market intelligence |
| Sales Handler | My buyers, active negotiations, my broadcasts + status, my pipeline $, my commission, AI next-actions per buyer |
| Documentation Officer | Drafts awaiting approval (mine/buyer/supplier), discrepancies open, originals ready for release, compliance expiries per active shipment |
| Logistics Officer | Active shipments on map, vessel tracking, pending LIs, warehouse stock per location, this week's ETAs |
| Finance Officer | Today's reconciliations, AR aging, AP due, FX positions, payment approval queue |
| Buyer (Company Admin) | Active matching offers, open orders across stages, price watchlist, payment schedule, shipment tracking |
| Supplier (Company Admin) | Submitted offers + approval status, active deals with Maxons, payment-received schedule, doc requirements per shipment |
| Broker (Company Admin) | Posted offers, brokered deals, commission earned/pending, destination-region aggregate feedback (no identity) |

### 13.3 Notification Channels (All Enabled, User-Configurable)

- **In-app** (always)
- **WhatsApp push** (critical items — approvals, payments, shipment updates to buyer)
- **Email** (formal items — contract copies, doc packages, weekly reports)
- **SMS** (fallback for critical only — login OTP, payment crisis)
- **Voice call** (AI-generated, for severe time-sensitive escalations only)

Each user configures channel preference per event type.

### 13.4 Notification Priority & Escalation

| Priority | Definition | Behavior |
|---|---|---|
| P1 Critical | Payment overdue past tolerance, shipment critical delay, compliance breach, high-value deal awaiting approval past SLA | Immediate; escalates up authority chain if not actioned within minutes/hours |
| P2 High | New offer awaiting approval, buyer bid requiring response, draft doc awaiting approval | Same-day |
| P3 Normal | Routine updates, non-urgent approvals | Within 24 hrs |
| P4 FYI | Informational, no action | No escalation |

Every event in the system has pre-assigned priority.

### 13.5 Automated Reports (AI-Generated)

- **Morning Brief** — every working day, 7 AM Dubai time — to Super Admin + role-specific briefs to each head
- **Weekly Business Review** — Sunday evening — week recap with charts, top deals, risks, team performance
- **Monthly P&L & Deal Analysis** — per entity + consolidated, YoY and trend analysis
- **Quarterly Strategic Review** — market positioning, buyer/supplier concentration risk, margin trends, recommendations
- **Custom scheduled reports** — any user can schedule personal custom reports

### 13.6 Onboarding & Adoption

- In-app guided tours per role on first login
- Video training library per role
- AI copilot for "how do I…" questions in-app
- Sandbox mode for new team members to practice without touching live data
- Super Admin sees adoption metrics (who uses what; who needs training)

---

## 14. APIs & INTEGRATIONS

### 14.1 Core Integrations (Phase 1)

- **WhatsApp Business Platform** (Twilio or Meta direct) — messaging, interactive templates, catalog, voice notes
- **Bank APIs** — Emirates Islamic Bank, National Bank of Fujairah (for auto-reconciliation)
- **FX Rate Provider** — OANDA or ECB or Reuters (hourly feed)
- **DocuSign / Adobe Sign / Dropbox Sign** — digital signing
- **UAE Pass** — UAE counterparty identity / signing
- **Vessel Tracking** — MarineTraffic / Vizion / Project44
- **Carrier APIs** — Maersk, MSC, CMA-CGM, Hapag-Lloyd (freight rates + booking + tracking)
- **USDA / Almond Board of California** — market data feed (pre-existing CropsIntel integration)
- **Email (SMTP / SendGrid / Postmark)** — transactional + marketing
- **SMS Gateway** — Twilio or regional provider for OTP / P1 fallback
- **OCR + AI** — Anthropic Claude API (primary), with document-layout specialized models for invoice/B/L parsing

### 14.2 Phase 2 Integrations

- External accounting (Zoho Books / QuickBooks / Tally / Odoo / Xero) — if Maxons keeps external books in parallel
- Sanctions screening (World-Check / Dow Jones / LexisNexis)
- Customs broker APIs per destination (India ICEGATE, UAE customs, etc.)
- Insurance underwriter APIs (cargo insurance)
- LC management platform integration (Contour / Marco Polo / Bolero)

---

## 15. DATA FLOW DIAGRAMS (Narrative Form)

### 15.1 End-to-End Deal Flow

```
[Offer Origination]
  Supplier/Broker posts offer via portal OR WhatsApp/email (AI-parsed)
  OR Maxons posts owned-stock / afloat-cargo offer
    ↓
[Offer Approval Chain]
  Procurement Officer → Procurement Head → (Finance) → (Admin) → LIVE
  Margin set (fixed per supplier OR per-offer); never visible to buyers
    ↓
[Broadcast]
  Sales team targets offer to region / buyer tier / product-match / hand-pick
  Delivered via WhatsApp / app / email / PDF / voice — in buyer's language + currency
  Gated rich content withheld until serious interest
    ↓
[Buyer Action]
  Accept / Counter-bid / Request info / Reserve / Decline
  All actions route through Sales Handler
    ↓
[Negotiation (if counter)]
  Multi-round, AI-suggested counters, sales handler decides
    ↓
[Acceptance (Hybrid Rule)]
  Source 1,2 (Maxons-owned) → Hard Accept, stock reserves instantly
  Source 3,4,5 (third-party) → Soft Accept, supplier/broker reconfirms
    ↓
[Sales Verification Gate]
  14-point auto-checklist; fails escalate to Sales Lead; dual-control for Tier 3+
    ↓
[Contract Generation]
  Smart-numbered (MGT-SAL-PAK-2026-####); AI-drafted; buyer + supplier contracts for back-to-back
  Digital signing (DocuSign / UAE Pass / OTP / manual fallback)
  Supplier contract signed first for back-to-back before buyer contract released
    ↓
[Documentation Module]
  Drafts auto-generated (AI) or uploaded (supplier)
  Per-contract approval routing (internal / buyer / supplier / dual)
  Discrepancies logged, SLA-timed, debit notes auto-drafted
  International Trade Security Gate — all 7 conditions must pass for originals release
    ↓
[Logistics Module]
  Shipment mode selected (1 of 6)
  AI-recommended vessel; loading instructions issued
  Pre-shipment compliance checked per destination rules
  Real-time tracking; proactive delay alerts
  Cost ledger accumulates actual costs
    ↓
[Payment Module]
  Payment schedule enforced per contract terms
  Auto-reminders, auto-escalation on overdue
  Multi-method (bank, cash, third-party, LC, CAD, CACD)
  Multi-currency with FX lock + realized rate tracking
  Parallel supplier payment flow on back-to-back
  Broker commission triggered per agreed terms
    ↓
[Originals Release]
  Per contract routing (direct buyer / buyer bank / Maxons bank / supplier hold / Maxons hold)
  Chain-of-custody logged
    ↓
[Delivery Confirmed]
  Buyer acknowledges receipt
  Any dispute/claim logged per buyer T&C
    ↓
[Closure & P&L Realization]
  Real Net Margin vs Contract Margin variance analyzed
  FX gain/loss realized
  Demurrage, discrepancy costs attributed
  Entity ledger posted; consolidated roll-up updated
  Analytics refreshed (buyer/supplier/broker scorecards, team performance)
    ↓
[Continuous Feedback Loop]
  AI learns from deal outcome for future recommendations
```

### 15.2 Portal Data Isolation (Cross-Cutting)

```
Maxons Internal ←→ ALL data (scoped by role)

Buyer Portal ←→ Maxons Internal (filtered):
  In:  Offer details (margin-inclusive, no supplier ref), deals they own, their docs, their payments
  Out: Bids, acceptances, payment proofs, doc approvals, messages

Supplier Portal ←→ Maxons Internal (filtered):
  In:  Their offers, deals at their contracted price, payments from Maxons, their doc requirements
  Out: Offer submissions, reconfirmations, doc uploads, messages
  Blocked: Buyer identity, final sale price, Maxons margin

Broker Portal ←→ Maxons Internal (filtered):
  In:  Their posted offers, deals they brokered at agreed commission, commission status
  Out: Offer submissions, messages
  Blocked: Buyer identity, final sale price, Maxons margin, other brokers' commissions

AI Layer ←→ Internal Maxons only for reasoning; scrubbed outputs to external portals
```

---

## 16. IMPLEMENTATION SEQUENCING (Phased Roadmap)

### Phase 1 — Foundation (Months 1–3)
1. Multi-tenant architecture, 4-portal auth, role-based access (14 internal + 6 external roles)
2. Entity structure + separate ledgers + chart of accounts (Maxons General Trading LLC, Maxons Impex DWC LLC)
3. Master data modules: Product, Counterparty, Country/Port/Currency/Incoterm/Payment Terms/Document Types/Compliance Rules
4. Counterparty onboarding (KYC, trade license, sanctions screening)
5. Core deal CRUD with manual workflow
6. Basic dashboards per role
7. Audit trail infrastructure

### Phase 2 — Offer & Contract Engine (Months 3–5)
1. Five source-type offer management + back-linking
2. Offer approval chain + margin management
3. Broadcast engine (region/tier/product/hand-pick targeting, multi-format, multi-language)
4. Negotiation module (counter-bid, firm bid, blind bid, auction)
5. Smart contract numbering + AI-drafted contract generation
6. Digital signing integration (DocuSign + UAE Pass + OTP + manual)
7. Sales Verification Gate with 14-point checklist + escalation

### Phase 3 — Documentation & Logistics (Months 5–7)
1. Document Types library, per-contract doc selection
2. Draft generation (AI + upload) + OCR
3. Approval routing + discrepancy handling + debit note automation
4. International Trade Security Gate for originals release
5. 6 shipment modes + LI workflow
6. Vessel tracking integration + AI vessel recommendation
7. Warehouse management (multi-location, lot traceability, reserved/available)
8. Pre-shipment compliance library per destination

### Phase 4 — Finance ERP (Months 7–9)
1. Multi-currency engine + FX rate feed + FX gain/loss per deal
2. Payment schedule enforcement + auto-reminders + escalation
3. Buyer payment reconciliation (bank API + manual + buyer upload + AI-matched)
4. Supplier payment flow + broker commission tracking
5. Multi-method payments (bank / cash / third-party / LC / CAD / CACD)
6. Full ERP: AR/AP, GL, chart of accounts, invoicing, credit/debit notes, cash flow, budget vs actual
7. Inventory valuation + COGS automation
8. Statutory reports (UAE VAT, Corporate Tax, ESR, audit pack)
9. Deal-level + aggregate P&L analytics

### Phase 5 — AI Layer + Buyer Experience (Months 9–11)
1. AI ingestion for supplier/broker WhatsApp/email offers
2. AI buyer matching + broadcast targeting
3. AI negotiation assistant (counter-price suggestions, sentiment analysis)
4. AI document verification + contract discrepancy scanner
5. AI logistics risk alerts + dynamic ETA
6. AI finance (payment prediction, FX hedging, credit limit)
7. AI Command Center (natural language, morning briefs, scenario modeling)
8. AI concierge for buyers 24/7 (multi-language)
9. WhatsApp full integration — interactive cards, catalog, carousel, voice, gated content
10. Buyer app marketplace with watchlist, price alerts, AI recommendations, one-tap reorder

### Phase 6 — Advanced & Scale (Months 11+)
1. Consolidated P&L with inter-company elimination
2. Advanced analytics + scenario modeling
3. Strategic Dashboard for Muzammil (weekly/quarterly auto-reports)
4. Expansion to other commodities (walnut, pine nut, pistachio, cashew)
5. Multi-seller marketplace mode (open platform to other traders)
6. Deep carrier + customs broker integrations
7. LC platform integration (Contour / Marco Polo / Bolero)
8. Expansion to new entities (California entity, Singapore entity, etc.)

---

## 17. NON-FUNCTIONAL REQUIREMENTS

### 17.1 Performance
- Offer broadcast to 1,000+ buyers within 60 seconds
- Dashboard load under 2 seconds on mobile
- Natural language AI query response under 5 seconds

### 17.2 Scalability
- Horizontally scalable architecture
- Multi-region deployment (primary: UAE; DR: secondary region)
- Support for 10,000+ active deals concurrently
- Support for 100,000+ counterparties

### 17.3 Reliability
- 99.9% uptime SLA
- RPO (Recovery Point Objective): 1 hour
- RTO (Recovery Time Objective): 4 hours
- Daily encrypted backups with 90-day retention; monthly archived backups with 7-year retention (regulatory)

### 17.4 Security
- Data at rest encrypted (AES-256)
- Data in transit encrypted (TLS 1.3)
- Zero-trust network architecture
- SOC 2 Type II roadmap
- UAE data residency for UAE-registered counterparty data
- GDPR / UAE PDPL compliance for personal data
- Penetration testing quarterly
- Vulnerability scanning continuous
- Role-based encryption of sensitive fields (margins, supplier prices) — even admins need explicit reason to decrypt

### 17.5 Compliance
- UAE Corporate Tax (mainland LLC 9% vs free zone qualifying income 0%)
- UAE VAT (5%) invoicing + reporting
- UAE Economic Substance Regulations
- UAE Anti-Money Laundering (AML) + Counter-Terrorism Financing (CTF)
- Sanctions compliance (OFAC, EU, UN, UK)
- Destination-country compliance per Compliance Rules Master

---

## 18. OPEN ITEMS / FUTURE CLARIFICATIONS

The following items were flagged during elicitation as "may add later" or "to be finalized":

1. **Additional buyer profile fields** (Muzammil may add more beyond commercial terms, product specs, logistics, compliance, behavioral currently captured)
2. **Maxons-branded vs CropsIntel-branded marketplace decision** (architected for both; final branding decision to be made before Phase 5)
3. **External accounting integration choice** (Zoho/QuickBooks/Tally/Odoo/Xero) — or CropsIntel as sole accounting system
4. **Additional currencies** beyond AED/USD/EUR as business expands
5. **Additional commodities** beyond almond (walnut, pine nut already referenced in sample contracts — spec already supports extensibility)
6. **Additional Maxons entities** (California, Singapore) to be onboarded via entity provisioning wizard when formed
7. **Additional document types** — Compliance Officer can add as regulatory needs emerge
8. **Additional roles** — Super Admin can define custom roles beyond the 14 baseline
9. **Advanced AI capabilities** (G — "keep enhancing later by learning") — continuous improvement loop, governed by Super Admin

---

## 19. APPENDIX A — Sample Contract Pattern Analysis

Based on 12 sample contracts provided, the following patterns are encoded as defaults:

### A.1 Contract Structure
- Header: Maxons entity letterhead (logo, address, phone, email)
- Parties block: Buyer and Seller with full legal addresses + tax/VAT/NIF/MERSIS IDs
- Transaction table: Quantity | Unit | Description | Unit price | Amount
- Payment terms section
- Shipping terms section
- Bank details (entity-specific)
- Port of destination + Port of loading
- Document list to be sent after 100% payment and vessel shipped
- Terms & Conditions (standard 12-clause template)
- Signature blocks (Seller + Buyer)

### A.2 Product Description Pattern (always structured identically)
`{FORM}-{VARIETY}-{OPTIONAL_SIZE}-{OPTIONAL_SLIDING_SCALE}-{OPTIONAL_NET_EDIBLE}-{CROP}-{PACKING}-{ORIGIN}-{BRAND}`

Examples:
- `SHELLED ALMONDS-INDEPENDENCE-20/22 NEW CROP - 50 LB CARTONS-US ORIGIN-CAL COAST BRAND`
- `ALMOND INSHELL-INDEPENDENCE BASED ON 70% SLIDING SCALES-50 LB BAGS-US ORIGIN-SIZE 23/25`
- `INSHELL ALMONDS-INDEPENDENCE INSHELL – BASED ON 70% SLIDING SCALE NET EDIBLE` (Georgia — Nutsfood Kutaisi)
- `PINE NUTS KERNELS-EXTRA FANCY QUALITY` (Ciavolino Roma)

### A.3 Standard Terms & Conditions (12-clause template — encode as default, override per deal)
1. Goods once sold cannot be returned (1 working day exchange window for original packaging)
2. Buyer must check goods on receipt; no claims after receipt (shipping weight + quality final at loading per Maxons weight slip)
3. No altering of quantity/rate by buyer; Credit/Debit Note via Accounts only
4. Cash payment requires official receipt
5. Cheques in Maxons name only, non-negotiable A/C payee, 500 AED return penalty
6. Advance payment due within 3 working days of contract
7. Advance forfeited on buyer cancellation
8. Goods remain Maxons property until full payment
9. Acceptance by signing within 3 working days or order cancelled
10. No other conditions valid unless in writing signed by Maxons
11. Dubai law, non-exclusive Dubai court jurisdiction
12. Unforeseen ocean carrier charges on consignee

Pakistan-specific additional clauses (Qureshi):
- SCTC (Specialty Trade Council) rules and arbitration
- Fumigation mandatory before shipment
- Draft docs shared, originals after approval
- Scan of originals via email
- Document delay demurrage on supplier account

Nepal-specific clauses (MA Laxmi):
- USD → AED conversion rate 3.675 if paying in UAE
- Transit via Kolkata to Nepal via Birgunj customs on consignee risk
- Haulage charges on consignee

These jurisdictional clause sets are encoded as **per-destination clause libraries** that auto-inject on contract generation.

### A.4 Bank Details per Entity (auto-populated)

**Maxons General Trading LLC:**
- Bank: Emirates Islamic Bank, P.O. Box 6564 Dubai UAE
- IBAN: AE900340003708204002402
- Account: 3708204002402
- SWIFT: MEBLAEAD
- Intermediary: Bank of New York Mellon, NY 10286 — SWIFT: IRVTUS3NXXX

**Maxons Impex DWC LLC:**
- Bank: National Bank of Fujairah
- Account: 023000155427
- IBAN: AE970380000023000155427
- SWIFT: NBFUAEAFDXB
- Currency: USD

---

## 20. APPENDIX B — Glossary

| Term | Definition |
|---|---|
| CACD | Cash Against Copy of Documents — payment on receipt of document copies by email |
| CAD | Cash Against Documents — payment on receipt of physical/original documents |
| LC | Letter of Credit |
| FCL | Full Container Load |
| CFR / CNF | Cost and Freight (synonyms) |
| CIF | Cost, Insurance and Freight |
| FOB | Free On Board |
| DDP | Delivered Duty Paid |
| NPX | Nonpareil extra — specific almond variety grade |
| SSR | Select Sheller Run |
| Sliding Scale | Inshell almond pricing basis — % refers to kernel yield (e.g., 70% sliding scale = price assumes 70% kernel recovery) |
| Net Edible | Pricing basis referring to edible kernel weight after processing |
| Back-to-back | Trade where buyer sale and supplier purchase are linked with matched terms |
| Demurrage | Penalty for exceeding free time at port |
| Phyto | Phytosanitary certificate — plant health document |
| COO | Certificate of Origin |
| ISPM-15 | International Standards for Phytosanitary Measures — wood packaging treatment standard |
| ESR | UAE Economic Substance Regulations |
| PDPL | UAE Personal Data Protection Law |
| HS Code | Harmonized System Code — customs product classification |
| DWC | Dubai World Central (free zone) |
| KYC | Know Your Customer |
| MERSIS | Turkish Central Trade Registry System number |
| NIF | Algerian tax identification number |
| VAT | Value Added Tax |

---

**END OF SPECIFICATION**

This document is designed to be **directly code-ingestible**: structured sections, explicit schemas, enum values, state transitions, business rules, and phased sequencing. A development team or AI coding agent can use this as the single source of truth to build CropsIntel Trade Hub autonomously, with Muzammil's review at milestone boundaries.

**Next steps:**
1. Muzammil reviews spec section by section; flags any gaps or corrections
2. Spec is converted into detailed technical design documents per module
3. UI/UX wireframes are created for the 4 portals
4. Sprint plan is built around the 6-phase implementation roadmap
5. Build begins Phase 1

