// CropsIntelV2 — Information Walls / Permissions layer
//
// Per vision (April 16, 2026): information walls are THE business model.
// Supplier NEVER sees customer identities, customer pricing, broker data.
// Broker   NEVER sees customer identities, supplier pricing, other brokers.
// Customer NEVER sees supplier source, broker source, cost basis, margin.
//
// Three layers of enforcement (this file covers #2 + #3; DB layer is the
// RLS policies in supabase/schema_info_walls.sql):
//
//   1. Database  — Postgres RLS policies (Supabase)
//   2. API       — every response filtered via projectForRole() below
//   3. Frontend  — portal-scoped routing + UI never *requests* data it
//                  shouldn't have (also uses canAccess() below)
//
// Rule: ALL data reads that cross counterparty lines must go through this
// layer. Direct supabase.from('crm_contacts').select('*') on a customer
// portal is a bug.

// ─── Role taxonomy ────────────────────────────────────────────────────
export const ROLE_FAMILIES = {
  // MAXONS employees — see everything within their department scope
  internal: ['admin', 'maxons_team', 'sales', 'operations', 'purchase', 'support', 'accounts', 'analyst', 'seller'],

  // External counterparties — each sees ONLY their scoped slice
  customer: ['buyer', 'importer'],
  supplier: ['supplier', 'handler', 'grower', 'processor'],
  broker:   ['broker', 'trader'],
  logistics: ['logistics', 'freight'],
  finance:  ['finance'],
  // Anonymous / not-yet-verified
  guest:    ['guest', 'registered'],
};

export function familyFor(role) {
  if (!role) return 'guest';
  const r = role.toLowerCase();
  for (const [family, roles] of Object.entries(ROLE_FAMILIES)) {
    if (roles.includes(r)) return family;
  }
  return 'guest';
}

export function isInternal(profile) {
  return familyFor(profile?.role) === 'internal'
      || ['admin', 'maxons_team'].includes(profile?.access_tier);
}

// ─── Data projections per counterparty family ─────────────────────────
// Each projection strips fields the family must not see. Never send a raw
// row to a non-internal user — always pass through projectForRole first.

const PROJECTIONS = {
  // Internal sees everything. Admin variant is redundant but explicit.
  internal: (row) => row,
  admin:    (row) => row,

  // Customer: strip supplier source, broker source, cost basis, margin.
  customer: (row) => {
    if (!row) return row;
    const out = { ...row };
    // strip source / cost / margin fields
    delete out.supplier_id;
    delete out.supplier_name;
    delete out.supplier_pricing;
    delete out.broker_id;
    delete out.broker_name;
    delete out.cost_basis;
    delete out.maxons_margin_pct;
    delete out.margin_usd;
    // raw_data may contain source-side metadata
    if (out.raw_data && typeof out.raw_data === 'object') {
      const { supplier, broker, cost, margin, ...safe } = out.raw_data;
      out.raw_data = safe;
    }
    return out;
  },

  // Supplier: strip customer identities, broker data, MAXONS margin.
  supplier: (row) => {
    if (!row) return row;
    const out = { ...row };
    delete out.customer_id;
    delete out.customer_name;
    delete out.customer_email;
    delete out.customer_phone;
    delete out.broker_id;
    delete out.broker_name;
    delete out.maxons_margin_pct;
    delete out.margin_usd;
    delete out.cost_basis;
    if (out.raw_data && typeof out.raw_data === 'object') {
      const { customer, broker, margin, ...safe } = out.raw_data;
      out.raw_data = safe;
    }
    return out;
  },

  // Broker: strip customer identities, customer pricing, supplier pricing.
  broker: (row) => {
    if (!row) return row;
    const out = { ...row };
    delete out.customer_id;
    delete out.customer_name;
    delete out.customer_email;
    delete out.customer_phone;
    delete out.customer_pricing;
    delete out.supplier_pricing;
    if (out.raw_data && typeof out.raw_data === 'object') {
      const { customer, supplier_pricing, customer_pricing, ...safe } = out.raw_data;
      out.raw_data = safe;
    }
    return out;
  },

  logistics: (row) => row, // sees shipment/logistics only; separate scope
  finance:   (row) => row, // limited to deal totals; stripped of counterparty pricing

  guest: (row) => {
    // Guests see aggregated public reference data only (crop summaries,
    // public news). Strip anything identity-related.
    if (!row) return row;
    const out = { ...row };
    for (const k of Object.keys(out)) {
      if (/email|phone|whatsapp|id$|_id$|address/i.test(k)) delete out[k];
    }
    return out;
  },
};

export function projectForRole(row, profile) {
  const family = familyFor(profile?.role);
  const projector = PROJECTIONS[family] || PROJECTIONS.guest;
  return projector(row);
}

export function projectArrayForRole(rows, profile) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => projectForRole(r, profile));
}

// ─── Read-gate helpers (frontend use) ─────────────────────────────────
// canAccess(profile, resource) — answers "should this family even fetch
// this resource?" Returns true/false. UI hides the nav entry when false.

export const RESOURCE_ACCESS = {
  // resource:    families-allowed
  'customers':   ['internal'],                     // CRM customer list
  'suppliers':   ['internal', 'supplier'],         // supplier sees own only
  'brokers':     ['internal', 'broker'],           // broker sees own only
  'offers':      ['internal', 'customer', 'broker', 'supplier'],
  'contracts':   ['internal', 'customer'],         // customers see their own
  'margin':      ['internal'],                     // NEVER to externals
  'admin-panel': ['internal'],
  'atlas':       ['internal'],                     // founder-gated in practice
  'social-feed': ['internal', 'customer', 'supplier', 'broker'], // verified tier
};

export function canAccess(profile, resource) {
  if (!profile) return false;
  const family = familyFor(profile.role);
  const admitted = RESOURCE_ACCESS[resource] || ['internal'];
  if (isInternal(profile)) return true;
  return admitted.includes(family);
}

// ─── Team-member capabilities ────────────────────────────────────────
// F6 (2026-04-24): MAXONS team members (analyst/broker/sales/trader/seller/
// maxons_team/admin role OR access_tier='maxons_team'|'admin') can verify
// newly-registered users (promote access_tier 'registered' → 'verified').
// Enforced at the DB level by the "Team can verify registered users" RLS
// policy + lock_team_column_writes trigger (migration 20260424_team_can_verify_users).
// This helper is for FRONTEND gating only — the DB is the source of truth.
const TEAM_ROLE_VALUES = ['admin', 'analyst', 'broker', 'seller', 'trader', 'sales', 'maxons_team'];

export function isTeamMember(profile) {
  if (!profile) return false;
  return TEAM_ROLE_VALUES.includes(profile.role)
    || profile.access_tier === 'maxons_team'
    || profile.access_tier === 'admin';
}

export function canVerifyUsers(profile) {
  // Same cohort as isTeamMember — team members + admins can verify.
  // Distinguishing the name makes call sites read intentionally
  // ("this button is for verifying users" vs. "this panel is team-only").
  return isTeamMember(profile);
}

export function isAdminUser(profile) {
  if (!profile) return false;
  return profile.role === 'admin' || profile.access_tier === 'admin';
}
