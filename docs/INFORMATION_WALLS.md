# Information Walls — Implementation

**Status:** Phase 7 scaffolding shipped 2026-04-24. DB RLS policies authored; full API middleware wiring is Phase 8.

---

## Why this matters

Per the vision handoff: **Information walls ARE the business model.** If the walls break, MAXONS' margin structure is exposed and the platform's revenue model collapses.

## The three non-negotiable rules

| Family | MUST NEVER see |
|---|---|
| **Customer** | supplier source, broker source, cost basis, MAXONS' margin |
| **Supplier** | customer identities, customer pricing, broker identities, MAXONS' margin |
| **Broker** | customer identities, customer pricing, supplier pricing, other brokers' data |

## Three enforcement layers

### Layer 1 — Database (Postgres RLS)

**File:** [`supabase/schema_info_walls.sql`](../supabase/schema_info_walls.sql)

RLS policies on `crm_contacts`, `crm_deals`, `user_profiles` + `audit_log`. A `user_family()` SQL function classifies the current session into one of: `internal`, `customer`, `supplier`, `broker`, `logistics`, `finance`, `guest`. Policies use that function to filter rows.

**Run order:**
1. Drop any existing permissive `public_read_*` policies on `crm_contacts` / `crm_deals`.
2. Apply `schema_info_walls.sql`.
3. Verify with `SELECT * FROM crm_contacts` from a non-internal role — must return only that family's own record.

### Layer 2 — API (JS middleware)

**File:** [`src/lib/permissions.js`](../src/lib/permissions.js)

Every response that crosses counterparty lines must pass through `projectForRole(row, profile)` or `projectArrayForRole(rows, profile)`. These strip fields per family (e.g., `supplier_id`, `margin_usd`, `cost_basis` are deleted before the customer sees a row).

**Usage pattern:**
```js
import { projectArrayForRole } from '../lib/permissions';

const { data } = await supabase.from('offers').select('*');
const safe = projectArrayForRole(data, profile);
setOffers(safe);
```

### Layer 3 — Frontend (portal-scoped routing)

**File:** [`src/lib/permissions.js`](../src/lib/permissions.js) — `canAccess(profile, resource)` helper + `RESOURCE_ACCESS` matrix.

Nav items / routes hide themselves when `canAccess()` returns false. Example:

```jsx
{canAccess(profile, 'brokers') && (
  <Link to="/brokers">Brokers</Link>
)}
```

## Audit log

**File:** [`src/lib/audit-log.js`](../src/lib/audit-log.js) + the `audit_log` table.

Every counterparty-data access writes one row: who acted, what they did, on which resource, with what scope, and the result. Feeds Scope Guardian (future) and makes compliance reviews tractable.

## Testing the walls

1. Create a test user with `role='buyer'` (customer family).
2. Sign in as that user.
3. Open DevTools → query `supabase.from('crm_contacts').select('*')`.
4. Expected: only their own contact row OR empty set.
5. NEVER: rows for other buyers, suppliers, or brokers.

## What's NOT covered yet (Phase 8)

- `abc_*` reports tables — still public-read; will gate on commodity when portal layer lands.
- `strata_prices` — customer should see margin-adjusted only; Phase 8 wraps this.
- `industry_news` — public OK; no sensitive fields.
- Real-time subscriptions (Supabase Realtime) — policies apply but need explicit subscription filtering.
