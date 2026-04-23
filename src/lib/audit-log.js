// CropsIntelV2 — Audit Log writer
//
// Every counterparty-data access should log to the audit_log table so we
// can verify information walls, debug access issues, and feed Scope
// Guardian (Phase 10, Atlas scope).
//
// Usage:
//   import { auditAccess } from '../lib/audit-log';
//   auditAccess({ action: 'read', resource: 'crm_contacts', target_id: row.id });

import { supabase } from './supabase';

export async function auditAccess({
  action,          // 'read' | 'write' | 'delete' | 'export' | 'invite'
  resource,        // 'crm_contacts', 'user_profiles', 'crm_deals', ...
  target_id = null,
  scope = {},      // e.g. { tier_filter: 'verified', variety: 'Nonpareil' }
  status = 'success',
}) {
  try {
    const { data: sessData } = await supabase.auth.getSession();
    const actor = sessData?.session?.user;
    await supabase.from('audit_log').insert({
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      action,
      resource,
      target_id: target_id ? String(target_id) : null,
      scope,
      status,
      // user_agent + ip are captured server-side via RLS/trigger if needed
    });
  } catch (err) {
    // Audit failures should never block user flow.
    console.warn('audit_log write failed:', err?.message || err);
  }
}
