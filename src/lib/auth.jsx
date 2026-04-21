// CropsIntelV2 — Auth Context
// Manages Supabase Auth state, user profiles, and guest timer

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { sendWhatsAppOTP, whatsAppLogin } from './whatsapp';

const AuthContext = createContext(null);

const GUEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const GUEST_START_KEY = 'cropsintel_guest_start';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestExpired, setGuestExpired] = useState(false);
  const [guestTimeLeft, setGuestTimeLeft] = useState(GUEST_DURATION_MS);

  // Load user on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
        // Clear guest timer on login
        localStorage.removeItem(GUEST_START_KEY);
        setGuestExpired(false);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Guest timer
  useEffect(() => {
    if (user) return; // Logged in users don't need timer

    let startTime = localStorage.getItem(GUEST_START_KEY);
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem(GUEST_START_KEY, startTime);
    }

    const tick = () => {
      const elapsed = Date.now() - parseInt(startTime);
      const remaining = Math.max(0, GUEST_DURATION_MS - elapsed);
      setGuestTimeLeft(remaining);
      if (remaining <= 0) {
        setGuestExpired(true);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [user]);

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }

  const signUp = useCallback(async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: metadata.full_name, company: metadata.company } }
    });
    if (error) throw error;

    // Create rich profile row
    if (data.user) {
      await supabase.from('user_profiles').upsert({
        id: data.user.id,
        email,
        full_name: metadata.full_name || '',
        company: metadata.company || '',
        role: metadata.role || 'buyer',
        country: metadata.country || '',
        city: metadata.city || '',
        phone: metadata.phone || '',
        whatsapp_number: metadata.whatsapp_number || '',
        trade_type: metadata.trade_type || '',
        annual_volume: metadata.annual_volume || '',
        products_of_interest: metadata.products_of_interest || [],
        preferred_ports: metadata.preferred_ports || [],
        certifications: metadata.certifications || [],
        payment_terms: metadata.payment_terms || [],
        website: metadata.website || '',
        social_links: metadata.social_links || {},
        created_at: new Date().toISOString()
      });
    }

    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  // Send WhatsApp OTP for login
  const sendLoginOTP = useCallback(async (phoneNumber) => {
    return await sendWhatsAppOTP(phoneNumber);
  }, []);

  // Verify WhatsApp OTP and sign in
  const signInWithOTP = useCallback(async (phoneNumber, otpCode) => {
    const result = await whatsAppLogin(phoneNumber, otpCode);

    if (result.method === 'session' && result.access_token) {
      // We got a full session — set it in Supabase client
      const { data, error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;
      return { ...result, session: data.session };
    }

    if (result.needs_password_login) {
      // OTP verified but couldn't generate session — return for password fallback
      return result;
    }

    return result;
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    // Reset guest timer
    localStorage.setItem(GUEST_START_KEY, Date.now().toString());
    setGuestExpired(false);
    setGuestTimeLeft(GUEST_DURATION_MS);
  }, []);

  const resetGuestTimer = useCallback(() => {
    localStorage.setItem(GUEST_START_KEY, Date.now().toString());
    setGuestExpired(false);
    setGuestTimeLeft(GUEST_DURATION_MS);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      guestExpired,
      guestTimeLeft,
      signUp,
      signIn,
      signInWithOTP,
      sendLoginOTP,
      signOut,
      resetPassword,
      resetGuestTimer,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
