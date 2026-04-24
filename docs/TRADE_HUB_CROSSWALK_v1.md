# CropsIntel V2 ⟷ Trade Hub Spec v1 — Cross-Walk & Gap Analysis

**Source spec:** [docs/TRADE_HUB_SPEC_v1.md](TRADE_HUB_SPEC_v1.md)
**Live app:** https://cropsintel.com (V2, 95% launch-ready)
**Purpose:** identify every gap between what's shipping today and what the
canonical Trade Hub blueprint demands. Buckets are sized so we can apply them
one-by-one (user directive 2026-04-24: *"make gap analysis and make clear route
where we want changes and start applying one by one"*).

**Launch-first rule:** V2 must ship. Anything in the **LATER** bucket does not
gate launch. Anything in the **NOW** bucket is small, safe, and makes the
eventual Trade Hub migration painless (data-model nulls, role aliases, UI
strings, breadcrumbs).

---

## 0. Executive summary

| Area | Current V2 state | Spec target | Bucket |
|---|---|---|---|
| Portals | Single-app with role-based nav | 4 isolated portals (Maxons internal, Buyer, Supplier, Broker) | **LATER** — Phase 7 rebuild |
| Entities | Implicit single-tenant | 2 legal entities (MGT + MIX) with consolidation | **NOW** — add `entities` stub; **LATER** — per-entity ledgers |
| User profile | 15ish fields | Spec §2.2 Counterparty has ~40 fields | **NOW** — add nullable columns; **LATER** — UI + workflow |
| Roles | 11 flat | 14 internal + 6 external + 4 auth tiers | **NOW** — expand ALL_ROLES with back-compat aliases |
| Offers | `offers_raw` / `OfferBuilder.jsx` lightweight | Spec §2.4 Offer + §3 5-source-type taxonomy + §2.5 Broadcast | **NOW** — add `offers` stub with enum; **LATER** — full lifecycle |
| Deals | Not modeled | Spec §2.6 Deal (full state machine) | **LATER** — Phase 7 |
| Contracts | Not modeled | Spec §2.7 Contract + §5 smart-numbering | **LATER** |
| Shipments | Not modeled | Spec §2.8 + §8 6-mode logistics | **LATER** |
| Payments | Not modeled | Spec §2.9 + §9 full ERP | **LATER** |
| AI | Zyra chat (4 AI stack) | Spec §10 embedded at every stage | **PARTIAL** — Zyra shell exists; deeper hooks LATER |
| WhatsApp buyer UX | OTP login only | Spec §11 full catalogue + bidding over WA | **LATER** |
| CRM / BRM / SRM | Pages exist, schema light | Counterparty master (§2.2) is superset | **NOW** — unify with profile model; **LATER** — full relationship surfaces |
| Dashboards | Role-priority sorting | Spec §13 role-specific command centers | **MEDIUM** — iterate per role |

---

## 1. Portal cross-walk (§1.1)

Spec demands hermetic isolation between 4 portals. V2 ships one app, one nav, role-gated sections.

| Spec portal | V2 today | Gap | Bucket |
|---|---|---|---|
| **Maxons Internal** | Whole app when `role ∈ TEAM_ROLES` or `access_tier ∈ {maxons_team, admin}` | No isolation from buyer-visible surfaces; shared views | LATER — Phase 7 will split builds |
| **Buyer Portal** | Same app; buyers see only non-team pages | Buyer sees internal widgets like `/supply`, `/destinations` which expose source volumes — spec §1.2 says buyers never see supplier identity/Maxons margin. Currently we don't surface supplier identity, but info-wall is loose. | **MEDIUM** — audit each page for supplier/margin leaks; gate with RLS where possible |
| **Supplier Portal** | Nothing specific; suppliers share buyer UX | No offer-posting surface, no deal tracking | LATER — needs `/supplier` sub-app |
| **Broker Portal** | `/brokers` exists but is a directory/CRM view, not a portal | No broker-side offer posting, commission tracking | LATER |

**NOW (cheap):** add a `portal` hint column to `user_profiles` (`maxons_internal | buyer | supplier | broker`) so future code paths can gate without migration cost. Default derived from role.

---

## 2. Counterparty / user profile cross-walk (§2.2 + §2.10)

### Currently on `user_profiles`
```
id, email, full_name, company, whatsapp_number, country, city, business_type,
annual_volume, company_website, role, access_tier, verification_state, is_approved,
preferred_grades, preferred_sizes, references, v2_welcome_completed_at,
migrated_from_v1, job_title, job_description, expertise, languages, invited_via,
onboarded_at, created_at, updated_at, source
```

### Spec §2.2 Counterparty Master — missing from V2
| Spec field | Why it matters | Bucket |
|---|---|---|
| `legal_entity_name` | KYC + contracts need real legal name distinct from brand | **NOW** nullable |
| `tax_id / vat_id / nif / mersis_no` | Compliance, VAT invoicing (jurisdiction-specific) | **NOW** nullable |
| `trade_license_number + expiry + document_url` | UAE compliance gate | **NOW** nullable |
| `registered_address + operating_addresses[]` | Contract doc template | **NOW** nullable |
| `region` (derived from country) | Offer broadcast scope | **NOW** auto-fill trigger |
| `primary_currency` | Multi-currency deals | **NOW** nullable |
| `payment_terms_default` | Default on new deals | **NOW** nullable |
| `payment_methods_accepted[]` | Checkout / settlement matching | **NOW** nullable |
| `credit_limit + credit_limit_currency` | Authority tier gate | **NOW** nullable |
| `kyc_status + kyc_expiry_date` | Compliance dashboard | **NOW** nullable, default 'pending' |
| `sanctions_screening_status + last_screened_date` | Compliance audit trail | **NOW** nullable |
| `master_agreement_on_file + agreement_document_ref` | Contract fast-path | LATER (doc vault needed first) |
| `incoterm_preference[]` | Offer matching | **NOW** nullable |
| `preferred_discharge_ports[]` | Offer matching | **NOW** nullable |
| `required_documents[]` | Docs module | **NOW** nullable |
| `special_contract_clauses[]` | Contract template fill | **NOW** nullable (JSONB) |
| `product_preferences[]` | Broadcast targeting | **PARTIAL** — preferred_grades/preferred_sizes exist; extend |
| `historical_performance` JSONB | CRM dashboards | **NOW** nullable (JSONB) |
| `risk_flags[]` | Compliance dashboard | **NOW** nullable |
| `assigned_account_manager` (FK → user_profiles) | Sales handler assignment | **NOW** nullable FK |
| `assigned_procurement_officer` (FK → user_profiles) | Procurement assignment | **NOW** nullable FK |
| `authority_tier_override` | Value-based approvals | **NOW** nullable |
| `counterparty_type` (buyer/supplier/broker/reseller_both) | Type flag distinct from role | **NOW** nullable |

### Spec §2.10 User fields missing
| Field | Bucket |
|---|---|
| `portal` enum | **NOW** |
| `authority_tier` (1–4) | **NOW** |
| `preferred_language`, `preferred_currency`, `preferred_units` | **NOW** (single prefs vs `languages[]` multi) |
| `2fa_enabled`, `biometric_enabled` | LATER |
| `last_login`, `active_sessions[]`, `ip_whitelist[]` | LATER |
| `assigned_accounts[]` | LATER (needs counterparty model) |
| `permissions_override[]` | LATER |

---

## 3. Role cross-walk (§12)

### Currently
- `ADMIN_ROLES = ['admin']`
- `TEAM_ROLES = ['admin', 'analyst', 'broker', 'seller', 'trader', 'sales', 'maxons_team']`
- `ALL_ROLES` in Settings.jsx: 11 values (buyer, seller, trader, broker, grower, supplier, processor, analyst, sales, maxons_team, admin)

### Spec §12.1 internal (14) — missing from V2
| # | Spec role | Legacy alias (V2) | Bucket |
|---|---|---|---|
| 1 | super_admin | admin | **NOW** add as alias |
| 2 | procurement_head | — | **NOW** add |
| 3 | procurement_officer | — | **NOW** add |
| 4 | sales_lead | — | **NOW** add |
| 5 | sales_handler | sales | **NOW** promote `sales` → `sales_handler` label |
| 6 | documentation_lead | — | **NOW** add |
| 7 | documentation_officer | — | **NOW** add |
| 8 | logistics_head | — | **NOW** add |
| 9 | logistics_officer | — | **NOW** add |
| 10 | warehouse_manager | — | **NOW** add |
| 11 | finance_head | — | **NOW** add |
| 12 | finance_officer | — | **NOW** add |
| 13 | compliance_officer | — | **NOW** add |
| 14 | analyst | analyst | ✓ exists |

### Spec §12.2 external (6)
| # | Spec role | Legacy alias | Bucket |
|---|---|---|---|
| 1 | company_admin | — | **NOW** add |
| 2 | finance_user | — | **NOW** add |
| 3 | ops_user | — | **NOW** add |
| 4 | procurement_trading_user | buyer (closest) | **NOW** add as distinct from generic buyer |
| 5 | sales_user | seller / supplier | **NOW** add |
| 6 | view_only_user | — | **NOW** add |

**Back-compat rule:** existing `role` values (buyer, seller, trader, broker, grower, supplier, processor, analyst, sales, maxons_team, admin) continue to work. A `ROLE_ALIAS` map in `src/lib/permissions.js` translates spec roles → legacy team/admin predicates so ProtectedRoute + sidebar keep working.

### Spec §12.3 authority tiers — NEW
| Tier | Range | Approver |
|---|---|---|
| 1 | up to $50K | Sales Handler / Procurement Officer |
| 2 | $50K–$250K | Sales Lead / Procurement Head |
| 3 | $250K–$1M | Finance Head co-approval |
| 4 | >$1M | Super Admin |

**Bucket:** **NOW** add `authority_tier` INT column on user_profiles (default 1, nullable); **LATER** wire into deal-approval logic (Phase 7).

---

## 4. Offers / deals / contracts cross-walk (§2.4–§2.7, §3, §5)

### V2 today
- `src/components/OfferBuilder.jsx` + `OfferLineItem.jsx` — admin/team can compose an offer draft
- `offers_raw` table (seen in Supabase, lightweight) — stores drafts
- No 5-source taxonomy, no broadcast surface, no buyer-side accept flow, no deal record

### Spec
- §2.4 Offer — 5 source types (1_MAXONS_OWNED_WAREHOUSE, 2_AFLOAT_CARGO, 3_PRE_COVERED_SUPPLIER, 4_OPEN_SUPPLIER_BROKER_OFFER, 5_RESELLER_SOURCED), approval chain, gated rich media, margin config
- §2.5 Broadcast Offer — buyer-facing representation with pricing_mode + delivery_channels[]
- §2.6 Deal — full 25-state machine
- §2.7 Contract — smart-numbered: `MGT-SAL-PAK-2026-0421`
- §5 — contract numbering scheme (entity-type-destination-year-serial)

**NOW (cheap foundation):**
1. `offers` stub table with `source_type` enum (5 values), FK to `entities` + `user_profiles`, minimal columns — does NOT replace `offers_raw`, coexists
2. `entities` table with 2 seed rows: Maxons General Trading LLC, Maxons Impex DWC LLC
3. `contract_numbers` helper (Postgres function) that mints spec-shaped numbers — not called yet but ready

**LATER:** deals, broadcasts, contracts — Phase 7 (11-month roadmap).

---

## 5. Page-by-page enhancement cross-walk

### Pages inventoried (22)
Welcome, Login, Register, SetPassword, ResetPassword, AcceptInvite,
Dashboard, Analysis, Supply, Destinations, Pricing, Forecasts, News,
Intelligence, Reports, CRM, Brokers, Suppliers, Trading, Settings,
ProjectMap, Autonomous

### Per-page vision-alignment buckets

| Page | NOW (cheap) | MEDIUM (this sprint) | LATER (Phase 7) |
|---|---|---|---|
| **Welcome** | Add "Maxons Group" + entity names in footer | Portal selector tiles (I'm a buyer / supplier / broker) | Full portal routing |
| **Login** | — | Autofocus whatsapp; confirm `password_setup_required` flag handling | 2FA / biometric per §12.7 |
| **Register** | Expand "business_type" to include 14 spec roles + 6 external | Collect counterparty fields (tax_id, trade_license_*, primary_currency, incoterm_preference[], preferred_discharge_ports[]) gated by role | Per-portal registration flows |
| **AcceptInvite** | **Fix team-first-login bug** (explicit profile refresh before nav + welcome banner state) | Show role-specific welcome ("You're a Procurement Officer — here's what you can do") | Portal-aware onboarding |
| **SetPassword** | — | — | — |
| **Dashboard** | Read `navigate state.welcomeMessage` → show banner once | Role-specific command centers per §13 (Super Admin, Sales Lead, Procurement Head, etc.) | Real deal pipeline funnel |
| **Analysis** | Already rich (reference pattern for widget interactivity) | — | Per-persona filters |
| **Supply** | VarietySection + CountySection retrofitted ✓ (from plan F3) | Ensure FilterBar present, last-5 default | Supplier-side view (for supplier portal) |
| **Destinations** | Country search + slice caps removed ✓ (plan F2) | Region (spec §2.2 derived) filter | Spec §2.5 broadcast targeting |
| **Pricing** | — | Variety + grade compare | Tied to deals (contract price vs market) |
| **Forecasts** | Subjective/Objective/Actual overlay (B4) | Variety pie (B3 landed) | — |
| **News** | — | — | — |
| **Intelligence** | Zyra gets role context (use `role` + `job_description` in system prompt) | Role-specific Zyra prompts per §13 | Full AI at every decision point (§10) |
| **Reports** | — | — | Spec §13 exportable audit trails |
| **CRM** | Ensure counterparty_type visible for each record | Add tax_id / credit_limit / kyc_status fields to record form | Full counterparty master (§2.2) |
| **Brokers** | Add source_type filter (when offers table lands) | Commission tracking stub | Broker portal |
| **Suppliers** | Add source_type filter | Supplier offer-post link stub | Supplier portal |
| **Trading** | Show 5-source-type taxonomy in offer compose | Margin config panel | Full offer + broadcast + deal lifecycle |
| **Settings** | Expand ALL_ROLES dropdown (14 + 6 spec roles) | Counterparty fields (tax_id, trade_license_*) in profile editor | Authority tier + assigned_account_manager pickers |
| **ProjectMap** | Add Phase 7 Trade Hub node + sub-anchors | — | — |
| **Autonomous** | — | Wire into spec §10 AI layer | — |

---

## 6. "Team members didn't see team functions at first login" — root cause

Reproduced from code inspection (not live test):

1. `/accept-invite?t=<token>` → AcceptInvite.jsx submits → `supabase.auth.signUp()` creates the auth user
2. Immediately upserts `user_profiles` with `role + access_tier` from invitation
3. If Supabase project has "confirm email" on, `signUp` returns session=null → AcceptInvite calls `signInWithPassword()` to force a session
4. `signInWithPassword` triggers `auth.onAuthStateChange` in AuthContext → `loadProfile` starts
5. In parallel AcceptInvite calls `navigate('/dashboard')` — Dashboard mounts **before** loadProfile resolves
6. During that race window, `const userRole = profile?.role || 'buyer'` in App.jsx defaults the sidebar to **buyer**
7. Buyer role fails `requireTeam` checks → CRM / Brokers / Suppliers / Trading / Team & Users all hidden
8. Even once profile loads, there's **no welcome banner** telling them "you're on the team — here are your tools". So they assume they were granted buyer access.

### Fix plan (applied NOW):

**a. Profile pre-seed before navigate** (AcceptInvite.jsx)
  After the upsert + signIn, explicitly `SELECT * FROM user_profiles WHERE id = newUserId` to force the row into Supabase pool before navigating. This closes the race.

**b. Navigate with team-context state**
  `navigate('/dashboard', { state: { welcomeMessage: ..., justOnboardedAs: invitation.role, isTeamInvite: isTeamRole(invitation.role) || invitation.access_tier === 'maxons_team' } })`

**c. Dashboard reads state → renders team-welcome banner**
  Prominent "Welcome to the team, {name} — you're a {role_label}. Your team tools are in the left sidebar under CRM, Brokers, Suppliers, Trading, and Team & Users." Banner auto-dismisses after 30s or on click.

**d. App.jsx sidebar loading guard**
  When `isAuthenticated && profile === null`, don't apply the 'buyer' fallback — show a one-line skeleton in each nav section. This prevents the buyer-flash.

**e. Onboarded-as breadcrumb**
  Settings profile row includes `onboarded_as_role` column (NEW, nullable). Lets admin trace who was invited with which role originally even after role changes.

---

## 7. Recommended execution order (one-by-one, per user directive)

1. **Commit 1** (this sprint): cross-walk doc + foundation migration (nullable columns + entities stub + offers stub) + ALL_ROLES expansion + role alias map
2. **Commit 2**: team-first-login fix (AcceptInvite refresh + Dashboard banner + App.jsx guard)
3. **Commit 3**: progress.json Phase 7 anchor + MEMORY.md update
4. **Commit 4** (optional, if time): CRM / Brokers / Suppliers / Settings surface the new counterparty fields in read-only mode (so data can be filled, even if not yet enforced)
5. **Soft launch UI audit**: walk each page as each role, record findings in `docs/SOFT_LAUNCH_UI_AUDIT_YYYY-MM-DD.md`

Phase 7 (LATER) proceeds per spec §16 roadmap:
- Phase 7.1 (3 mo): Core (master data + counterparties + offers + basic broadcast + deal creation + manual contracts)
- Phase 7.2 (2 mo): Contracts + docs + originals release + payment scheduling
- Phase 7.3 (1.5 mo): Logistics + integrations (vessel tracking, port APIs)
- Phase 7.4 (1 mo): Financial ERP (bank recon, FX, cost ledger, P&L)
- Phase 7.5 (1 mo): Multi-portal split (Buyer/Supplier/Broker dedicated apps)
- Phase 7.6 (1.5 mo): AI layer activation + analytics + mobile apps
- Phase 7.7 (1 mo): Hardening, compliance audit, pen-test, UAT
**Total:** 11 months post-launch.

---

## 8. Open items for user (questions to resolve later, per spec §18)

- Exact brand names, variety lists, grade/size enums — extend editable masters
- Bank account details per entity (MGT → Emirates Islamic; MIX → NBF) — need account numbers + SWIFT
- KYC document requirements per jurisdiction — needs compliance officer input
- Inter-entity pricing policy (cost vs market for intra-group sales) — needs Muzammil decision
- Broker commission formulas (flat %, tiered, per-deal)
- Integration provider choices: vessel tracking (MarineTraffic / Vizion?), bank statement ingestion (Plaid / Yodlee / direct swift?), FX rate provider (OANDA / XE?)

These do not block NOW work.

---

**Authored:** 2026-04-25 during Honesty + Completion Sprint. Rev up as we learn.
