// CropsIntel V2 — Role taxonomy: SINGLE SOURCE OF TRUTH
// 2026-04-27 · Launch-Worthiness Sprint W1
//
// Why this file exists:
//   Before this file, ADMIN_ROLES / TEAM_ROLES were defined in THREE places —
//     - src/components/ProtectedRoute.jsx  (incomplete: ADMIN=['admin'], TEAM=4 values)
//     - src/App.jsx                         (correct: full list)
//     - src/lib/permissions.js              (TEAM_ROLE_VALUES, partial)
//   …and they had drifted. `super_admin` users were denied <AdminRoute>; spec §12
//   internal roles were denied <TeamRoute>. This file is the ONE PLACE these
//   lists live. Every caller must import from here.
//
// Spec references:
//   docs/TRADE_HUB_SPEC_v1.md §12 (role taxonomy)
//   docs/TRADE_HUB_CROSSWALK_v1.md §3 (legacy ↔ spec mapping)

// ═══════════════════════════════════════════════════════════════════
// (1) Role lists
// ═══════════════════════════════════════════════════════════════════

// Admin-level roles — full power across the app.
// `admin` is the legacy alias for the spec's `super_admin` (§12.1).
export const ADMIN_ROLES = ['admin', 'super_admin'];

// Internal-team roles — see team-only pages (CRM, Brokers, Suppliers,
// Trading, Team & Users, Data Hub). Includes ALL 14 spec §12.1 internal
// roles PLUS legacy V2 values so existing team members keep access.
export const TEAM_ROLES = [
  // Legacy V2 values (kept for back-compat with existing user_profiles rows)
  'admin', 'analyst', 'broker', 'seller', 'trader', 'sales', 'maxons_team',
  // Spec §12.1 — 14 Maxons internal roles
  'super_admin',
  'procurement_head', 'procurement_officer',
  'sales_lead', 'sales_handler',
  'documentation_lead', 'documentation_officer',
  'logistics_head', 'logistics_officer', 'warehouse_manager',
  'finance_head', 'finance_officer',
  'compliance_officer',
];

// Spec §12.2 — 6 external company roles (counterparty staff at customer
// orgs, suppliers, brokers). They see their own portal, never the
// internal team pages.
export const EXTERNAL_ROLES = [
  'company_admin', 'finance_user', 'ops_user',
  'procurement_trading_user', 'sales_user', 'view_only_user',
  // Bonus: existing app role
  'reseller_both',
];

// Every role string the app recognises (helpful for forms / validation).
export const ALL_ROLES = Array.from(new Set([
  ...ADMIN_ROLES,
  ...TEAM_ROLES,
  ...EXTERNAL_ROLES,
  // Legacy / external counterparty roles handled in permissions.js ROLE_FAMILIES
  'buyer', 'guest', 'registered',
  'supplier', 'handler', 'grower', 'processor', 'importer',
  'logistics', 'freight', 'finance', 'support',
  'operations', 'purchase', 'accounts',
]));

// ═══════════════════════════════════════════════════════════════════
// (2) Pure-role helpers — when you only have a string, not a profile
// ═══════════════════════════════════════════════════════════════════

export function isAdminRole(role) {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isTeamRole(role) {
  return !!role && TEAM_ROLES.includes(role);
}

export function isExternalRole(role) {
  return !!role && EXTERNAL_ROLES.includes(role);
}

// ═══════════════════════════════════════════════════════════════════
// (3) Profile-aware helpers — accept a profile {role, access_tier}
// ═══════════════════════════════════════════════════════════════════
// access_tier can grant admin/team status even if role is 'buyer' (e.g.
// MAXONS staff onboarded via /accept-invite where tier=='maxons_team' but
// role hasn't been refined yet). Always check BOTH role and tier.
//
// Legacy V2 profiles have `tier` (no `access_`); newer profiles have
// `access_tier`. We accept either to avoid stranding existing rows.
//
// permissions.js re-exports these so existing
//   `import { isAdminUser } from './permissions'`
// call sites keep working without churn.

function tierOf(profile) {
  return profile?.access_tier || profile?.tier;
}

export function isAdminUser(profile) {
  if (!profile) return false;
  return isAdminRole(profile.role) || tierOf(profile) === 'admin';
}

export function isTeamMember(profile) {
  if (!profile) return false;
  const tier = tierOf(profile);
  return isAdminUser(profile)
    || isTeamRole(profile.role)
    || tier === 'maxons_team';
}

// Same cohort as isTeamMember — distinct name makes call sites read
// intentionally ("this button verifies users" vs "this panel is team-only").
export function canVerifyUsers(profile) {
  return isTeamMember(profile);
}
