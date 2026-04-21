// CropsIntelV2 — WhatsApp OTP Verification Component
// Used in Registration flow and Settings page
// Sends OTP via Twilio WhatsApp, verifies code, updates profile

import React, { useState, useRef, useEffect } from 'react';
import { sendWhatsAppOTP, verifyWhatsAppOTP, isValidPhone } from '../lib/whatsapp';

export default function WhatsAppVerify({ phoneNumber, userId, onVerified, onSkip, compact = false }) {
  const [step, setStep] = useState('input'); // 'input' | 'sent' | 'verified'
  const [phone, setPhone] = useState(phoneNumber || '');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Auto-focus first OTP input when code is sent
  useEffect(() => {
    if (step === 'sent' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  async function handleSendOTP() {
    setError('');
    const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;

    if (!isValidPhone(cleanPhone)) {
      setError('Please enter a valid phone number with country code (e.g., +971501234567)');
      return;
    }

    setLoading(true);
    try {
      await sendWhatsAppOTP(cleanPhone);
      setStep('sent');
      setCountdown(60);
    } catch (err) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setError('');
    setLoading(true);
    const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      await verifyWhatsAppOTP(cleanPhone, code, userId);
      setStep('verified');
      if (onVerified) onVerified(cleanPhone);
    } catch (err) {
      setError(err.message || 'Verification failed');
      // Clear OTP on error
      setOtp(['', '', '', '', '', '']);
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    } finally {
      setLoading(false);
    }
  }

  function handleOTPChange(index, value) {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only last character
    setOtp(newOtp);
    setError('');

    // Auto-advance to next input
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5) {
      const code = newOtp.join('');
      if (code.length === 6) {
        setTimeout(() => handleVerifyOTP(), 100);
      }
    }
  }

  function handleKeyDown(index, e) {
    // Backspace moves to previous input
    if (e.key === 'Backspace' && !otp[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newOtp = pasted.split('');
      setOtp(newOtp);
      if (inputRefs.current[5]) inputRefs.current[5].focus();
      // Auto-verify on paste
      setTimeout(async () => {
        setLoading(true);
        const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
        try {
          await verifyWhatsAppOTP(cleanPhone, pasted, userId);
          setStep('verified');
          if (onVerified) onVerified(cleanPhone);
        } catch (err) {
          setError(err.message);
          setOtp(['', '', '', '', '', '']);
          if (inputRefs.current[0]) inputRefs.current[0].focus();
        } finally {
          setLoading(false);
        }
      }, 100);
    }
  }

  // ─── Verified State ─────────────────────────────────
  if (step === 'verified') {
    return (
      <div className={`${compact ? 'p-3' : 'p-5'} bg-green-500/10 border border-green-500/30 rounded-xl text-center`}>
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-green-400 font-semibold text-sm">WhatsApp Verified</p>
        <p className="text-gray-500 text-xs mt-1">{phone}</p>
      </div>
    );
  }

  // ─── OTP Entry State ────────────────────────────────
  if (step === 'sent') {
    return (
      <div className={`${compact ? 'p-3' : 'p-5'} bg-gray-800/50 border border-gray-700 rounded-xl`}>
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-white text-sm font-medium">Check your WhatsApp</p>
          <p className="text-gray-500 text-xs mt-1">
            We sent a 6-digit code to {phone}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {/* OTP Input Boxes */}
        <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => inputRefs.current[i] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleOTPChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="w-10 h-12 text-center text-lg font-bold bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/30 focus:outline-none transition-colors"
              disabled={loading}
            />
          ))}
        </div>

        <button
          onClick={handleVerifyOTP}
          disabled={loading || otp.join('').length !== 6}
          className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying...
            </span>
          ) : 'Verify Code'}
        </button>

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={handleSendOTP}
            disabled={countdown > 0 || loading}
            className="text-xs text-green-400 hover:text-green-300 disabled:text-gray-600 transition-colors"
          >
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
          </button>
          <button
            onClick={() => { setStep('input'); setOtp(['', '', '', '', '', '']); setError(''); }}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Change Number
          </button>
        </div>

        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full mt-3 text-xs text-gray-600 hover:text-gray-500 transition-colors"
          >
            Skip for now — verify later in Settings
          </button>
        )}
      </div>
    );
  }

  // ─── Phone Input State ──────────────────────────────
  return (
    <div className={`${compact ? 'p-3' : 'p-5'} bg-gray-800/50 border border-gray-700 rounded-xl`}>
      <div className="text-center mb-4">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
          <span className="text-2xl">📱</span>
        </div>
        <p className="text-white text-sm font-medium">Verify Your WhatsApp</p>
        <p className="text-gray-500 text-xs mt-1">
          Connect your WhatsApp to receive trade alerts, offers, and chat with Zyra AI
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); setError(''); }}
          placeholder="+971 50 123 4567"
          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
        />
      </div>

      <button
        onClick={handleSendOTP}
        disabled={loading || !phone.trim()}
        className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending code...
          </span>
        ) : 'Send Verification Code'}
      </button>

      {onSkip && (
        <button
          onClick={onSkip}
          className="w-full mt-3 text-xs text-gray-600 hover:text-gray-500 transition-colors"
        >
          Skip for now — verify later in Settings
        </button>
      )}
    </div>
  );
}
