// CropsIntelV2 — ProtectedRoute
// Wraps pages that require authentication and/or specific roles.
// Unauthenticated → redirect to /login
// Wrong role → "Access Restricted" message with upgrade CTA
//
// 2026-04-27 (W1): Pulled ADMIN_ROLES / TEAM_ROLES from roleConstants.js
// (single source of truth). Previously this file had stale local
// definitions (ADMIN=['admin'] only, TEAM = 4 values) which denied
// access to super_admin + 17 spec §12.1 roles. Now uses isAdminUser /
// isTeamMember (profile-aware, also accepts access_tier overrides).

import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isAdminUser, isTeamMember } from '../lib/roleConstants';

export default function ProtectedRoute({ children, requireAuth = true, requireRoles = null, requireAdmin = false, requireTeam = false }) {
  const { isAuthenticated, loading, profile } = useAuth();

  // Still loading auth state — show spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated → redirect to login
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check admin requirement (accepts role IN admin list OR access_tier === 'admin')
  if (requireAdmin && isAuthenticated && !isAdminUser(profile)) {
    return <AccessDenied reason="admin" />;
  }

  // Check team requirement (admin OR team role OR access_tier in team list)
  if (requireTeam && isAuthenticated && !isTeamMember(profile)) {
    return <AccessDenied reason="team" />;
  }

  // Check specific role-list requirement (legacy callers passing requireRoles=[...])
  if (requireRoles && isAuthenticated) {
    const userRole = profile?.role || 'buyer';
    if (!requireRoles.includes(userRole)) {
      return <AccessDenied reason="role" requiredRoles={requireRoles} userRole={userRole} />;
    }
  }

  return children;
}

// Convenience wrappers
export function AdminRoute({ children }) {
  return <ProtectedRoute requireAdmin>{children}</ProtectedRoute>;
}

export function TeamRoute({ children }) {
  // Use the requireTeam flag (profile-aware) instead of passing the role
  // list — this way access_tier='maxons_team'|'admin' grants access too.
  return <ProtectedRoute requireTeam>{children}</ProtectedRoute>;
}

export function AuthRoute({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

// Access Denied component
function AccessDenied({ reason, requiredRoles, userRole }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>

        {reason === 'admin' ? (
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            This section is available to administrators only.
            Contact your MAXONS team lead for access.
          </p>
        ) : reason === 'team' ? (
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            This section is for the MAXONS internal team.
            If you believe you should have access, contact your team lead
            and they can promote your account.
          </p>
        ) : (
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Your current role ({userRole}) doesn't have access to this section.
            {requiredRoles && (
              <span className="block mt-1 text-gray-500">
                Required: {requiredRoles.join(', ')}
              </span>
            )}
          </p>
        )}

        <div className="space-y-3">
          <Link
            to="/dashboard"
            className="block w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/settings"
            className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
          >
            View Your Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
