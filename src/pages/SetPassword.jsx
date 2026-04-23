import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════
// Welcome to CropsIntel V2 — onboarding landing for new + V1 users
//
// Shown after WhatsApp OTP login for:
//   - V1 migrated users (auth account just auto-created, no password)
//   - V2 first-time signups who chose OTP-first
//   - Any user who hits /set-password via sidebar/settings
//
// Collects in priority order:
//   1. Password (required, so they can log in via email+password later)
//   2. Email (optional, deferrable; verify-link sent if provided)
//   3. Nudge to complete rich profile in Settings
//
// User directive (2026-04-24): "a welcome to V2 of Cropsintel and ask
// for setup new password and update record where including email which
// will have verify button or cerified tag... profile should be rich..."
// ═══════════════════════════════════════════════════════════════

export default function SetPassword() {
  const navigate = useNavigate();
  const { updatePassword, isAuthenticated, profile, user } = useAuth();

  // Step 1 — password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordDone, setPasswordDone] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Step 2 — email
  const [email, setEmail] = useState('');
  const [emailDone, setEmailDone] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');

  const [error, setError] = useState('');

  // Prefill email if the profile already has one (V1 migrated users often do)
  useEffect(() => {
    const existing = profile?.email || user?.email || '';
    if (existing && !email) setEmail(existing);
    // If the auth account already has a confirmed email, mark that step done.
    if (user?.email_confirmed_at) setEmailDone(true);
  }, [profile, user]);

  const isV1Migrated = profile?.migrated_from_v1 || profile?.source === 'v1_migration';
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'there';

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    if (!password) return setError('Password is required');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');

    setPasswordSaving(true);
    try {
      await updatePassword(password);
      setPasswordDone(true);
    } catch (err) {
      setError(err.message || 'Failed to set password');
    } finally {
      setPasswordSaving(false);
    }
  }

  // Send a verification link to the provided email. Supabase sends a magic
  // link that, when clicked, flips email_confirmed_at. We also stash the
  // email on the user_profiles row so Settings can show it immediately.
  async function handleVerifyEmail(e) {
    e.preventDefault();
    setEmailMsg('');
    if (!email || !email.includes('@')) {
      setEmailMsg('Error: Please enter a valid email address');
      return;
    }
    setEmailSending(true);
    try {
      // Update auth email — this triggers a confirmation email.
      const { error: authErr } = await supabase.auth.updateUser({ email });
      if (authErr && !authErr.message?.includes('same')) throw authErr;

      // Mirror email on the profile row so other parts of the app see it.
      if (user?.id) {
        await supabase
          .from('user_profiles')
          .update({ email, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }

      setEmailMsg('Verification link sent — check your inbox. You can continue while it arrives.');
      // We don't flip emailDone yet; we flip it only when email_confirmed_at
      // comes back from Supabase (user has to click the link). But record
      // that the link was sent so the UI reflects "pending verification".
      setEmailDone('pending');
    } catch (err) {
      setEmailMsg('Error: ' + (err.message || 'Could not send verification email'));
    } finally {
      setEmailSending(false);
    }
  }

  function handleSkipEmail() {
    setEmailDone('skipped');
  }

  async function handleFinish() {
    // Stamp v2_welcome_completed_at so the user isn't re-routed here on
    // subsequent logins. If the column doesn't exist yet (migration not
    // applied), the update is a soft-fail — we still navigate. This ships
    // before the migration is applied; the migration lands it as a proper
    // timestamptz col with default NULL.
    try {
      if (user?.id) {
        await supabase
          .from('user_profiles')
          .update({ v2_welcome_completed_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    } catch (_err) {
      // Non-fatal — the user completed the welcome; failing to stamp it
      // just means they might see the screen once more.
    }
    navigate('/dashboard');
  }

  // Not authenticated → gentle gate
  if (!isAuthenticated) {
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
            Please log in with your WhatsApp OTP first, then you'll land back here to finish setting up your V2 account.
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

  const emailState = emailDone === true ? 'verified' : emailDone === 'pending' ? 'pending' : emailDone === 'skipped' ? 'skipped' : 'unset';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-[10px] font-semibold text-green-400 mb-3 tracking-wide">
            {isV1Migrated ? 'V1 USER — UPGRADED' : 'V2 AUTONOMOUS INTELLIGENCE'}
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 shadow-lg shadow-green-500/20">
            CI
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome to CropsIntel V2</h1>
          <p className="text-sm text-gray-400 mt-2">
            {isV1Migrated
              ? `Hi ${displayName} — your V1 account carried over. Let's finish setup (takes 30 seconds).`
              : `Hi ${displayName} — your WhatsApp is verified. Let's finish setup.`}
          </p>
        </div>

        {/* Progress strip */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <StepDot done label="WhatsApp" />
          <StepLine done={passwordDone} />
          <StepDot done={passwordDone} active={!passwordDone} label="Password" />
          <StepLine done={emailDone === true || emailDone === 'pending' || emailDone === 'skipped'} />
          <StepDot done={emailDone === true || emailDone === 'pending' || emailDone === 'skipped'} active={passwordDone && !emailDone} label="Email" />
          <StepLine />
          <StepDot active={passwordDone && (emailDone === true || emailDone === 'pending' || emailDone === 'skipped')} label="Profile" />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {/* ── Step 1: Password ── */}
          <section className={`rounded-xl border p-4 transition-colors ${
            passwordDone
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-gray-800 bg-gray-950/50'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  passwordDone ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {passwordDone ? '✓' : '1'}
                </span>
                <h3 className="text-sm font-semibold text-white">Set a password</h3>
              </div>
              {passwordDone && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  Done
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-8">
              So you can log in with email + password too (WhatsApp OTP always works as a backup).
            </p>

            {!passwordDone ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-3 ml-8">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                  placeholder="New password (min 6 characters)"
                  autoFocus
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                  placeholder="Confirm password"
                />
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {passwordSaving ? 'Setting password…' : 'Save Password'}
                </button>
              </form>
            ) : (
              <p className="text-xs text-green-400 ml-8">Password saved. You can now log in via email + password too.</p>
            )}
          </section>

          {/* ── Step 2: Email (optional with verify) ── */}
          <section className={`rounded-xl border p-4 transition-colors ${
            !passwordDone
              ? 'border-gray-800 bg-gray-950/30 opacity-50'
              : emailState === 'verified'
              ? 'border-green-500/30 bg-green-500/5'
              : emailState === 'pending'
              ? 'border-amber-500/30 bg-amber-500/5'
              : emailState === 'skipped'
              ? 'border-gray-700 bg-gray-900/50'
              : 'border-blue-500/30 bg-blue-500/5'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  emailState === 'verified' ? 'bg-green-500 text-white'
                  : emailState === 'pending' ? 'bg-amber-500 text-white'
                  : emailState === 'skipped' ? 'bg-gray-700 text-gray-400'
                  : passwordDone ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {emailState === 'verified' ? '✓' : emailState === 'skipped' ? '−' : '2'}
                </span>
                <h3 className="text-sm font-semibold text-white">Add an email <span className="text-[10px] font-normal text-gray-500">(optional)</span></h3>
              </div>
              {emailState === 'verified' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified
                </span>
              )}
              {emailState === 'pending' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Check inbox
                </span>
              )}
              {emailState === 'skipped' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-500 border border-gray-600/30">
                  Skipped
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-8">
              Get price alerts, shipment updates, and offer notifications by email. You'll earn a verified tag.
            </p>

            {passwordDone && emailState !== 'verified' && emailState !== 'skipped' && (
              <form onSubmit={handleVerifyEmail} className="space-y-3 ml-8">
                {emailMsg && (
                  <div className={`text-xs rounded-lg px-3 py-2 ${
                    emailMsg.startsWith('Error')
                      ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                      : 'bg-green-500/10 border border-green-500/20 text-green-400'
                  }`}>
                    {emailMsg}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailMsg(''); }}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="you@company.com"
                  />
                  <button
                    type="submit"
                    disabled={emailSending || !email}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {emailSending ? 'Sending…' : 'Verify Email'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSkipEmail}
                  className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Skip for now — you can add it anytime in Settings
                </button>
              </form>
            )}
            {emailState === 'skipped' && (
              <p className="text-xs text-gray-500 ml-8">
                No problem — you can add an email anytime from <Link to="/settings" className="text-blue-400 hover:text-blue-300 underline">Settings</Link>.
              </p>
            )}
            {emailState === 'pending' && (
              <p className="text-xs text-amber-300/80 ml-8">
                We sent a confirmation link to <span className="font-mono text-white">{email}</span>. Click it to earn your verified tag.
              </p>
            )}
            {emailState === 'verified' && (
              <p className="text-xs text-green-400 ml-8">
                <span className="font-mono text-white">{email}</span> is verified. You'll receive alerts + digests here.
              </p>
            )}
          </section>

          {/* ── Step 3: Profile nudge ── */}
          <section className={`rounded-xl border p-4 transition-colors ${
            passwordDone && emailDone
              ? 'border-purple-500/30 bg-purple-500/5'
              : 'border-gray-800 bg-gray-950/30 opacity-50'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  passwordDone && emailDone ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  3
                </span>
                <h3 className="text-sm font-semibold text-white">Rich profile <span className="text-[10px] font-normal text-gray-500">(unlocks personalization)</span></h3>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-8">
              Share your trade profile — volumes, varieties, ports, grades, sizes, references — so Zyra and your dashboards tune to what you actually trade. You can always update later.
            </p>
            <div className="ml-8 flex flex-wrap gap-1.5 mb-3">
              {['Volumes', 'Varieties', 'Ports', 'Grades', 'Sizes', 'Products', 'References'].map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          {/* Finish */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleFinish}
              disabled={!passwordDone}
              className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordDone ? 'Enter CropsIntel V2 →' : 'Set password first'}
            </button>
            <button
              onClick={() => navigate('/settings')}
              disabled={!passwordDone}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              Complete profile
            </button>
          </div>
        </div>

        <div className="text-center mt-5">
          <p className="text-[10px] text-gray-600">
            Your data stays private. Team/admin approval unlocks pricing access — we'll notify you when you're verified.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Progress strip helpers ───────────────────────────────────
function StepDot({ done, active, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-2.5 h-2.5 rounded-full ${
        done ? 'bg-green-500' : active ? 'bg-blue-500 ring-4 ring-blue-500/20' : 'bg-gray-700'
      }`} />
      <span className={`text-[9px] tracking-wide ${done ? 'text-green-400' : active ? 'text-blue-400' : 'text-gray-600'}`}>
        {label}
      </span>
    </div>
  );
}

function StepLine({ done }) {
  return <div className={`flex-1 h-px max-w-[40px] ${done ? 'bg-green-500/50' : 'bg-gray-800'}`} />;
}
