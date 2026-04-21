// CropsIntelV2 — Auth Context
// Manages Supabase Auth state, user profiles, and guest timer

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

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
      options: { data: metadata }
    });
    if (error) throw error;

    // Create profile row
    if (data.user) {
      await supabase.from('user_profiles').upsert({
        id: data.user.id,
        email,
        full_name: metadata.full_name || '',
        company: metadata.company || '',
        role: metadata.role || 'buyer',
        country: metadata.country || '',
        products_of_interest: metadata.products_of_interest || [],
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
      signOut,
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
