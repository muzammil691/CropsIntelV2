// CropsIntelV2 — Invite Reconciliation
//
// When a user registers (or logs in for the first time on V2), this
// function checks whether a crm_contacts row was previously created for
// their whatsapp or email via the Bulk Invite flow (Phase C5b) with
// metadata.invite_status='sent'. If yes, flip it to 'joined' + stamp
// joined_at so the team can see conversion from invite → registered.
//
// Called from:
//   - useAuth onRegister / onSignIn
//   - V1ReturningUserModal final step (on successful onboarding)
//   - Can also be run periodically as a batch job
//
// Rule: never fails a user flow. If the reconcile errors, swallow it.

import { supabase } from './supabase';

const normalizePhone = (p) => {
  if (!p) return '';
  const d = p.replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.length === 10) return '+1' + d;
  return '+' + d;
};

/**
 * Reconcile a newly-active user against the bulk-invite queue.
 * Returns { reconciledCount, matchedRows[] } — non-zero on match.
 */
export async function reconcileInviteForUser({
  user_id = null,
  whatsapp = null,
  email = null,
} = {}) {
  const phone = normalizePhone(whatsapp);
  const emailLc = email ? email.toLowerCase().trim() : null;

  if (!phone && !emailLc) {
    return { reconciledCount: 0, matchedRows: [] };
  }

  try {
    // Find any crm_contacts with invite_status='sent' matching either leg
    const filters = [];
    if (phone) filters.push(`phone.eq.${phone}`);
    if (emailLc) filters.push(`email.eq.${emailLc}`);
    const { data: matches, error: readErr } = await supabase
      .from('crm_contacts')
      .select('*')
      .or(filters.join(','));

    if (readErr) {
      console.warn('reconcile read failed:', readErr.message);
      return { reconciledCount: 0, matchedRows: [] };
    }

    const invited = (matches || []).filter(row => {
      const m = row.metadata || {};
      return m.invite_status === 'sent' || (row.tags || []).includes('invited');
    });

    if (invited.length === 0) {
      return { reconciledCount: 0, matchedRows: [] };
    }

    // Update each matching row
    const now = new Date().toISOString();
    const updates = invited.map(async row => {
      const m = row.metadata || {};
      const nextTags = Array.from(new Set([...(row.tags || []), 'joined']))
        .filter(t => t !== 'invited');
      const { error: writeErr } = await supabase
        .from('crm_contacts')
        .update({
          tags: nextTags,
          metadata: {
            ...m,
            invite_status: 'joined',
            joined_at: now,
            joined_user_id: user_id || m.joined_user_id || null,
          },
          relationship_score: Math.max(row.relationship_score || 0, 60),
          last_interaction_at: now,
        })
        .eq('id', row.id);
      if (writeErr) console.warn('reconcile write failed:', writeErr.message);
      return row;
    });

    await Promise.allSettled(updates);
    return { reconciledCount: invited.length, matchedRows: invited };
  } catch (err) {
    console.warn('reconcileInviteForUser error:', err?.message || err);
    return { reconciledCount: 0, matchedRows: [] };
  }
}
