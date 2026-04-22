// V1 Returning-User Popup (Phase F1a)
//
// Shown globally to authenticated users whose user_profiles.metadata flags
// them as migrated from V1 AND who haven't completed V2 onboarding
// (metadata.v1_onboarded_at is unset).
//
// Three steps:
//   1) Confirm the migrated WhatsApp number → send OTP
//   2) Enter OTP to verify
//   3) Set a new V2 password
// On success, stamps metadata.v1_onboarded_at + whatsapp_verified=true,
// and closes. Converts a V1 migrated user to a full V2 user.

import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { sendWhatsAppOTP, verifyWhatsAppOTP } from '../lib/whatsapp';

function shouldShowFor(profile) {
  if (!profile) return false;
  const m = profile.metadata || {};
  const migrated = m.migrated_from_v1 === true || !!m.v1_user_id;
  const done = !!m.v1_onboarded_at;
  return migrated && !done;
}

export default function V1ReturningUserModal() {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(1); // 1: confirm-phone, 2: otp, 3: password, 4: done
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Initialize phone from profile when modal first renders
  const initialPhone = useMemo(() => profile?.whatsapp_number || profile?.phone || '', [profile?.whatsapp_number, profile?.phone]);
  React.useEffect(() => {
    if (initialPhone && !phone) setPhone(initialPhone);
  }, [initialPhone, phone]);

  if (dismissed) return null;
  if (!shouldShowFor(profile)) return null;

  async function sendOtp() {
    setErr(''); setBusy(true);
    try {
      await sendWhatsAppOTP(phone);
      setStep(2);
    } catch (e) {
      setErr(e?.message || 'Failed to send OTP. Please check the WhatsApp number.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    setErr(''); setBusy(true);
    try {
      await verifyWhatsAppOTP(phone, otp, user?.id);
      // mark whatsapp_verified + persist phone
      await supabase.from('user_profiles').update({
        whatsapp_number: phone,
        whatsapp_verified: true,
      }).eq('id', user?.id);
      setStep(3);
    } catch (e) {
      setErr(e?.message || 'OTP verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword() {
    setErr('');
    if (!password || password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;
      const meta = profile?.metadata || {};
      await supabase.from('user_profiles').update({
        metadata: { ...meta, v1_onboarded_at: new Date().toISOString() },
      }).eq('id', user?.id);
      if (refreshProfile) await refreshProfile();
      setStep(4);
    } catch (e) {
      setErr(e?.message || 'Could not set password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setDismissed(true)} />
      <div className="relative w-full max-w-md bg-gray-950 border border-green-500/30 rounded-2xl p-6 shadow-2xl shadow-green-500/10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-green-400 font-semibold">V1 → V2 upgrade</p>
            <h3 className="text-lg font-bold text-white mt-1">Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}</h3>
          </div>
          <button onClick={() => setDismissed(true)} className="text-gray-500 hover:text-white text-lg leading-none" title="Remind me later">×</button>
        </div>

        {/* Progress pills */}
        <div className="flex items-center gap-2 mb-5 text-[10px] text-gray-500">
          {[
            { n: 1, label: 'WhatsApp' },
            { n: 2, label: 'Verify' },
            { n: 3, label: 'Password' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              <span className={`px-2 py-0.5 rounded-full ${step >= s.n ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-600'}`}>
                {step > s.n ? '✓' : s.n}. {s.label}
              </span>
              {i < 2 && <span className="text-gray-700">—</span>}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <>
            <p className="text-sm text-gray-300 leading-relaxed">
              You were migrated from CropsIntel V1. Two quick steps to finish upgrading your account:
            </p>
            <ol className="text-xs text-gray-400 leading-relaxed mt-2 mb-4 pl-4 list-decimal space-y-1">
              <li>Verify your WhatsApp number with a one-time code.</li>
              <li>Set a new password for cropsintel.com.</li>
            </ol>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">WhatsApp number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+971501234567"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
            <p className="text-[10px] text-gray-600 mt-1">We'll send a 6-digit code via WhatsApp.</p>
            {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
            <button
              onClick={sendOtp}
              disabled={busy || !phone || phone.replace(/\D/g, '').length < 8}
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Send OTP via WhatsApp'}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-gray-300">Code sent to <span className="text-white font-mono">{phone}</span></p>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1 mt-3">6-digit code</label>
            <input
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-lg text-white font-mono text-center tracking-[0.3em]"
            />
            {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => { setStep(1); setOtp(''); setErr(''); }} className="text-xs text-gray-500 hover:text-white">← Back</button>
              <button
                onClick={confirmOtp}
                disabled={busy || otp.length !== 6}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-gray-300">WhatsApp verified ✓. Now pick a password for your V2 account.</p>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1 mt-3">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="at least 8 characters"
            />
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1 mt-3">Confirm password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
            {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
            <button
              onClick={setNewPassword}
              disabled={busy}
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Set password & finish upgrade'}
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">✓</span>
              </div>
              <h4 className="text-base font-semibold text-white">You're all set!</h4>
              <p className="text-xs text-gray-400 mt-2">
                Your V1 account has been upgraded. You can now sign in with WhatsApp OTP or your new password.
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
            >
              Continue to CropsIntel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
