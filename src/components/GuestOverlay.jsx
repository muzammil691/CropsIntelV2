import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function GuestOverlay() {
  const { guestExpired, isAuthenticated, resetGuestTimer } = useAuth();

  // Don't show for logged-in users or if timer hasn't expired
  if (isAuthenticated || !guestExpired) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative max-w-md w-full mx-4 bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center shadow-2xl shadow-green-500/5">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">
          Guest Preview Expired
        </h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          Your 5-minute preview has ended. Create a free account to unlock
          full access to 10+ years of almond market intelligence, live pricing,
          crop forecasts, and AI-powered trade insights.
        </p>

        {/* CTAs */}
        <div className="space-y-3">
          <Link
            to="/register"
            className="block w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all"
          >
            Create Free Account
          </Link>
          <Link
            to="/login"
            className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700"
          >
            Sign In
          </Link>
        </div>

        {/* Extend preview */}
        <button
          onClick={resetGuestTimer}
          className="mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Extend preview 5 more minutes
        </button>

        {/* What you get */}
        <div className="mt-6 pt-5 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Free account includes</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="text-green-500">&#10003;</span> Full data access
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-500">&#10003;</span> Live pricing
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-500">&#10003;</span> Export reports
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-500">&#10003;</span> AI insights
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
