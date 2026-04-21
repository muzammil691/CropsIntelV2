// CropsIntelV2 — Profile Completion Banner
// Shows after login if user has missing email or WhatsApp number
// Prompts them to complete their profile for a better experience

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { Link } from 'react-router-dom';

export default function ProfileCompletionBanner() {
  const { user, profile, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Don't show for guests or dismissed
  if (!isAuthenticated || !profile || dismissed) return null;

  // Check what's missing
  const missingEmail = !profile.email || profile.email === '';
  const missingWhatsApp = !profile.whatsapp_number || profile.whatsapp_number === '';
  const unverifiedWhatsApp = profile.whatsapp_number && !profile.whatsapp_verified;
  const missingCompany = !profile.company || profile.company === '';
  const missingCountry = !profile.country || profile.country === '';

  const issues = [];
  if (missingEmail) issues.push('email address');
  if (missingWhatsApp) issues.push('WhatsApp number');
  if (unverifiedWhatsApp) issues.push('WhatsApp verification');
  if (missingCompany) issues.push('company name');
  if (missingCountry) issues.push('country');

  // Nothing missing — don't show
  if (issues.length === 0) return null;

  // Check if user has dismissed in this session
  const dismissKey = `profile_banner_dismissed_${user?.id}`;
  if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey)) return null;

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(dismissKey, 'true');
    }
  }

  const isHighPriority = missingEmail || missingWhatsApp;

  return (
    <div className={`mx-4 mt-3 mb-1 rounded-xl border p-3 flex items-center gap-3 ${
      isHighPriority
        ? 'bg-amber-500/10 border-amber-500/20'
        : 'bg-blue-500/10 border-blue-500/20'
    }`}>
      <div className="flex-shrink-0 text-lg">
        {isHighPriority ? '⚠️' : '💡'}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isHighPriority ? 'text-amber-400' : 'text-blue-400'}`}>
          Complete your profile
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Add your {issues.slice(0, 2).join(' and ')}{issues.length > 2 ? ` (+${issues.length - 2} more)` : ''} to unlock personalized trade alerts and intelligence.
        </p>
      </div>
      <Link
        to="/settings"
        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isHighPriority
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
            : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
        }`}
      >
        Update
      </Link>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors"
        title="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
