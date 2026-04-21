import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isValidPhone } from '../lib/whatsapp';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════
// Login Page — 4 methods:
//   1. WhatsApp + Password (primary)
//   2. WhatsApp OTP (passwordless)
//   3. Email + Password
//   4. Email OTP (magic link)
// ═══════════════════════════════════════════════════════════════

export default function Login() {
  const { signIn, signInWithOTP, sendLoginOTP, resetPassword } = useAuth();
  const navigate = useNavigate();

  // Active login method — email+password default (V1 users)
  const [method, setMethod] = useState('email_password');

  // Shared fields
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP flow
  const [otpStep, setOtpStep] = useState('input'); // 'input' | 'verify'
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef([]);

  // Email magic link
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Forgot password
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // State
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Focus first OTP box
  useEffect(() => {
    if (otpStep === 'verify' && otpRefs.current[0]) otpRefs.current[0].focus();
  }, [otpStep]);

  // Reset sub-state when switching method
  useEffect(() => {
    setError('');
    setOtpStep('input');
    setOtp(['', '', '', '', '', '']);
    setMagicLinkSent(false);
    setForgotMode(false);
    setForgotSent(false);
  }, [method]);

  // ────────────────────────────────────────────────────────
  // 1. WhatsApp + Password
  // ────────────────────────────────────────────────────────
  async function handleWhatsAppPassword(e) {
    e.preventDefault();
    setError('');
    const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
    if (!isValidPhone(cleanPhone)) return setError('Enter a valid number with country code');
    if (!password) return setError('Password is required');

    setLoading(true);
    try {
      // Look up email by WhatsApp number, then sign in with email+password
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('whatsapp_number', cleanPhone);

      if (!profiles || profiles.length === 0) {
        setError('No account found with this WhatsApp number');
        setLoading(false);
        return;
      }

      await signIn(profiles[0].email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // 2. WhatsApp OTP (passwordless)
  // ────────────────────────────────────────────────────────
  async function handleSendWhatsAppOTP() {
    setError('');
    const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
    if (!isValidPhone(cleanPhone)) return setError('Enter a valid number with country code');

    setLoading(true);
    try {
      await sendLoginOTP(cleanPhone);
      setOtpStep('verify');
      setCountdown(60);
    } catch (err) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyWhatsAppOTP() {
    const code = otp.join('');
    if (code.length !== 6) return setError('Enter the complete 6-digit code');

    setError('');
    setLoading(true);
    const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const result = await signInWithOTP(cleanPhone, code);
      if (result.needs_password_login) {
        // Switch to whatsapp+password with the email pre-filled
        setEmail(result.email || '');
        setMethod('email_password');
        setError('OTP verified — please enter your password to complete sign in');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const msg = err.message || 'Verification failed';
      if (msg === 'no_account') {
        setError('No account found with this number. Please register first.');
      } else {
        setError(msg);
      }
      setOtp(['', '', '', '', '', '']);
      if (otpRefs.current[0]) otpRefs.current[0].focus();
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // 3. Email + Password
  // ────────────────────────────────────────────────────────
  async function handleEmailPassword(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');

    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // 4. Email OTP (magic link)
  // ────────────────────────────────────────────────────────
  async function handleSendMagicLink(e) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');

    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (otpErr) throw otpErr;
      setMagicLinkSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send login link');
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // 5. Forgot Password
  // ────────────────────────────────────────────────────────
  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    const targetEmail = forgotEmail.trim();
    if (!targetEmail) return setError('Enter your email address');

    setLoading(true);
    try {
      await resetPassword(targetEmail);
      setForgotSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // OTP digit handlers
  // ────────────────────────────────────────────────────────
  function onOTPChange(i, val) {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    setError('');
    if (val && i < 5 && otpRefs.current[i + 1]) otpRefs.current[i + 1].focus();
    if (val && i === 5 && next.join('').length === 6) setTimeout(handleVerifyWhatsAppOTP, 100);
  }

  function onOTPKeyDown(i, e) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  function onOTPPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
      setTimeout(handleVerifyWhatsAppOTP, 100);
    }
  }

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  const methods = [
    { id: 'email_password', icon: <EmailIcon />, label: 'Email + Password' },
    { id: 'whatsapp_password', icon: <WhatsAppIcon />, label: 'WhatsApp + Password' },
    { id: 'whatsapp_otp', icon: <WhatsAppIcon />, label: 'WhatsApp OTP' },
    { id: 'email_otp', icon: <EmailIcon />, label: 'Email Magic Link' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
            CI
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your CropsIntel account</p>
        </div>

        {/* Method selector — 2x2 grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {methods.map(m => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 border ${
                method === m.id
                  ? 'bg-green-600/15 text-green-400 border-green-500/30'
                  : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-700 hover:text-gray-300'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          {/* ─── WhatsApp + Password ────────────────── */}
          {method === 'whatsapp_password' && (
            <form onSubmit={handleWhatsAppPassword} className="space-y-4">
              <Field label="WhatsApp Number" type="tel" value={phone}
                onChange={v => { setPhone(v); setError(''); }}
                placeholder="+971 50 123 4567" hint="Include country code" autoFocus />
              <Field label="Password" type="password" value={password}
                onChange={v => { setPassword(v); setError(''); }}
                placeholder="Your password" />
              <SubmitBtn loading={loading} text="Sign In" />
              <div className="text-center">
                <button type="button" onClick={() => { setMethod('email_password'); setForgotMode(true); setError(''); }}
                  className="text-xs text-gray-500 hover:text-green-400 transition-colors">
                  Forgot your password?
                </button>
              </div>
            </form>
          )}

          {/* ─── WhatsApp OTP ───────────────────────── */}
          {method === 'whatsapp_otp' && otpStep === 'input' && (
            <div className="space-y-4">
              <div className="text-center mb-1">
                <p className="text-gray-400 text-sm">We'll send a code to your WhatsApp</p>
              </div>
              <Field label="WhatsApp Number" type="tel" value={phone}
                onChange={v => { setPhone(v); setError(''); }}
                placeholder="+971 50 123 4567" hint="Include country code" autoFocus
                onEnter={handleSendWhatsAppOTP} />
              <ActionBtn loading={loading} text="Send Verification Code" onClick={handleSendWhatsAppOTP}
                disabled={!phone.trim()} />
            </div>
          )}

          {method === 'whatsapp_otp' && otpStep === 'verify' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-white text-sm font-medium">Check your WhatsApp</p>
                <p className="text-gray-500 text-xs mt-1">6-digit code sent to {phone}</p>
              </div>
              <OTPInput otp={otp} refs={otpRefs} onChange={onOTPChange}
                onKeyDown={onOTPKeyDown} onPaste={onOTPPaste} disabled={loading} />
              <ActionBtn loading={loading} text="Verify & Sign In" onClick={handleVerifyWhatsAppOTP}
                disabled={otp.join('').length !== 6} />
              <div className="flex justify-between">
                <button onClick={handleSendWhatsAppOTP} disabled={countdown > 0 || loading}
                  className="text-xs text-green-400 hover:text-green-300 disabled:text-gray-600">
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                </button>
                <button onClick={() => { setOtpStep('input'); setOtp(['','','','','','']); setError(''); }}
                  className="text-xs text-gray-500 hover:text-gray-400">Change Number</button>
              </div>
            </div>
          )}

          {/* ─── Email + Password ───────────────────── */}
          {method === 'email_password' && !forgotMode && (
            <form onSubmit={handleEmailPassword} className="space-y-4">
              <Field label="Email" type="email" value={email}
                onChange={v => { setEmail(v); setError(''); }}
                placeholder="you@company.com" autoFocus />
              <Field label="Password" type="password" value={password}
                onChange={v => { setPassword(v); setError(''); }}
                placeholder="Your password" />
              <SubmitBtn loading={loading} text="Sign In" />
              <div className="text-center">
                <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); setError(''); }}
                  className="text-xs text-gray-500 hover:text-green-400 transition-colors">
                  Forgot your password?
                </button>
              </div>
            </form>
          )}

          {/* ─── Forgot Password ───────────────────── */}
          {method === 'email_password' && forgotMode && !forgotSent && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-1">
                <p className="text-white text-sm font-medium">Reset Your Password</p>
                <p className="text-gray-500 text-xs mt-1">We'll send a reset link to your email</p>
              </div>
              <Field label="Email" type="email" value={forgotEmail}
                onChange={v => { setForgotEmail(v); setError(''); }}
                placeholder="you@company.com" autoFocus />
              <SubmitBtn loading={loading} text="Send Reset Link" />
              <div className="text-center">
                <button type="button" onClick={() => { setForgotMode(false); setError(''); }}
                  className="text-xs text-gray-500 hover:text-green-400 transition-colors">
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {method === 'email_password' && forgotMode && forgotSent && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium">Check your email</p>
              <p className="text-gray-500 text-xs">
                We sent a password reset link to <span className="text-gray-300">{forgotEmail}</span>
              </p>
              <p className="text-gray-600 text-xs">
                Click the link in the email to set a new password.
              </p>
              <button onClick={() => { setForgotMode(false); setForgotSent(false); setError(''); }}
                className="text-xs text-green-400 hover:text-green-300">Back to sign in</button>
            </div>
          )}

          {/* ─── Email Magic Link ───────────────────── */}
          {method === 'email_otp' && !magicLinkSent && (
            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <div className="text-center mb-1">
                <p className="text-gray-400 text-sm">We'll email you a sign-in link</p>
              </div>
              <Field label="Email" type="email" value={email}
                onChange={v => { setEmail(v); setError(''); }}
                placeholder="you@company.com" autoFocus />
              <SubmitBtn loading={loading} text="Send Magic Link" />
            </form>
          )}

          {method === 'email_otp' && magicLinkSent && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium">Check your email</p>
              <p className="text-gray-500 text-xs">
                We sent a sign-in link to <span className="text-gray-300">{email}</span>
              </p>
              <button onClick={() => setMagicLinkSent(false)}
                className="text-xs text-green-400 hover:text-green-300">Try a different email</button>
            </div>
          )}

          {/* Register link */}
          <p className="text-center text-sm text-gray-500 mt-5">
            Don't have an account?{' '}
            <Link to="/register" className="text-green-400 hover:text-green-300 transition-colors">
              Create one free
            </Link>
          </p>
        </div>

        {/* Guest access */}
        <div className="text-center mt-5">
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-400 transition-colors">
            Continue as guest (5-minute preview)
          </Link>
        </div>
      </div>
    </div>
  );
}

// ═══════ Reusable Components ═══════════════════════════════

function Field({ label, type = 'text', value, onChange, placeholder, hint, autoFocus, onEnter }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onEnter ? e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

function SubmitBtn({ loading, text }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
      {loading ? <Spinner text={text === 'Sign In' ? 'Signing in...' : 'Sending...'} /> : text}
    </button>
  );
}

function ActionBtn({ loading, text, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
      {loading ? <Spinner text="Please wait..." /> : text}
    </button>
  );
}

function OTPInput({ otp, refs, onChange, onKeyDown, onPaste, disabled }) {
  return (
    <div className="flex justify-center gap-2" onPaste={onPaste}>
      {otp.map((digit, i) => (
        <input key={i} ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1} value={digit}
          onChange={e => onChange(i, e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          className="w-11 h-13 text-center text-lg font-bold bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/30 focus:outline-none transition-colors"
          disabled={disabled} />
      ))}
    </div>
  );
}

function Spinner({ text }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      {text}
    </span>
  );
}

function WhatsAppIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-green-400 flex-shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 flex-shrink-0">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
