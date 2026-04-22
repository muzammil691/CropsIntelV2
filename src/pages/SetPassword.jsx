import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// ═══════════════════════════════════════════════════════════════
// Set Password Page — for V1 migrated users
// After WhatsApp OTP login, V1 users land here to set their
// permanent password. They already have an active session.
// ═══════════════════════════════════════════════════════════════

export default function SetPassword() {
  const navigate = useNavigate();
  const { updatePassword, isAuthenticated, profile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!password) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated && !loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Session Required</h2>
          <p className="text-sm text-gray-400 mb-5">
            Please log in with your WhatsApp OTP first, then you'll be redirected here to set your password.
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
            CI
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome Back!</h1>
          <p className="text-sm text-gray-500 mt-1">
            {profile?.full_name ? `Hi ${profile.full_name}, ` : ''}Set a password for your upgraded account
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {/* Info banner */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 mb-5">
            <p className="text-blue-400 text-xs font-medium mb-1">Account Upgraded to V2</p>
            <p className="text-gray-400 text-xs">
              Your WhatsApp has been verified. Please set a password so you can also log in with email + password in the future.
            </p>
          </div>

          {!success ? (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                    placeholder="At least 6 characters"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                    placeholder="Re-enter your password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Setting password...
                    </span>
                  ) : 'Set Password & Continue'}
                </button>
              </form>

              <button
                onClick={() => navigate('/dashboard')}
                className="w-full mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors text-center"
              >
                Skip for now — set password later in Settings
              </button>
            </>
          ) : (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium">Password set successfully!</p>
              <p className="text-gray-500 text-xs">Redirecting you to the dashboard...</p>
            </div>
          )}
        </div>

        <div className="text-center mt-5">
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-400 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
