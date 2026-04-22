// CropsIntelV2 — WhatsApp Login Edge Function
// Verifies OTP → Finds user by WhatsApp number → Returns Supabase auth session
//
// POST /whatsapp-login
// Body: { phone_number: '+1234567890', otp_code: '123456' }
// Returns: { success: true, session: {...}, user: {...} } or { success: false, error: '...' }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone_number, otp_code } = await req.json();

    if (!phone_number || !otp_code) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing phone_number or otp_code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanPhone = phone_number.startsWith('+') ? phone_number : `+${phone_number}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ─── Step 1: Verify OTP ─────────────────────────────────────
    const { data: otpRecord, error: fetchErr } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone_number', cleanPhone)
      .single();

    if (fetchErr || !otpRecord) {
      return new Response(
        JSON.stringify({ success: false, error: 'No OTP found. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ success: false, error: 'Too many attempts. Please request a new code.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(otpRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'OTP expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment attempts
    await supabase
      .from('whatsapp_otps')
      .update({ attempts: otpRecord.attempts + 1 })
      .eq('phone_number', cleanPhone);

    if (otpRecord.otp_code !== otp_code.trim()) {
      const remaining = MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return new Response(
        JSON.stringify({ success: false, error: `Invalid code. ${remaining} attempts remaining.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // OTP verified — mark it
    await supabase
      .from('whatsapp_otps')
      .update({ verified: true })
      .eq('phone_number', cleanPhone);

    // ─── Step 2: Find user by WhatsApp number ───────────────────
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, access_tier, whatsapp_number, whatsapp_verified')
      .eq('whatsapp_number', cleanPhone)
      .single();

    if (profileErr || !profile) {
      // No account with this WhatsApp number — return verified but no account
      return new Response(
        JSON.stringify({
          success: false,
          error: 'no_account',
          message: 'WhatsApp verified but no account found. Please register first.',
          phone_verified: true,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Step 3: Mark WhatsApp as verified on profile ───────────
    await supabase
      .from('user_profiles')
      .update({
        whatsapp_verified: true,
        last_login_at: new Date().toISOString(),
        login_count: (profile as any).login_count ? (profile as any).login_count + 1 : 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    // ─── Step 4: Generate auth session via Admin API ────────────
    // Try to generate a magic link. If it fails, the user may be a V1
    // migrated user with no Supabase Auth account — auto-create one.

    let passwordSetupRequired = false;

    const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: 'magiclink',
        email: profile.email,
      }),
    });

    let linkData = await adminRes.json();

    // ─── Step 4b: V1 User Auto-Migration ────────────────────────
    // If generate_link failed, this is likely a V1 user with no auth account.
    // Auto-create a Supabase Auth account so they can log in.
    if (!adminRes.ok) {
      console.log('Generate link failed — attempting V1 user auto-migration for:', profile.email);

      // Create auth account with a random temp password, using the existing profile ID
      const tempPassword = crypto.randomUUID();
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          email: profile.email,
          password: tempPassword,
          email_confirm: true, // Skip email verification — they verified via WhatsApp
          user_metadata: {
            full_name: profile.full_name || '',
            company: (profile as any).company || '',
            v1_migrated: true,
          },
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        console.error('V1 auto-migration failed:', createData);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Account setup failed. Please contact support or try registering.',
            v1_migration_failed: true,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update user_profiles to link to new auth user ID
      const newAuthId = createData.id;
      const oldProfileId = profile.id;

      if (newAuthId && newAuthId !== oldProfileId) {
        // Update profile ID to match new auth user ID
        // First insert a new row with the new ID, then delete the old one
        const { data: fullProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', oldProfileId)
          .single();

        if (fullProfile) {
          const { id: _oldId, ...profileData } = fullProfile;
          await supabase.from('user_profiles').upsert({
            ...profileData,
            id: newAuthId,
            whatsapp_verified: true,
            updated_at: new Date().toISOString(),
          });
          // Delete old profile row (only if IDs differ)
          await supabase.from('user_profiles').delete().eq('id', oldProfileId);
        }
        // Update profile reference for the rest of this function
        profile.id = newAuthId;
      }

      passwordSetupRequired = true;
      console.log('V1 user migrated to auth successfully:', profile.email, '→', newAuthId);

      // Retry generate_link now that the auth account exists
      const retryRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          type: 'magiclink',
          email: profile.email,
        }),
      });

      linkData = await retryRes.json();

      if (!retryRes.ok) {
        console.error('Generate link retry failed:', linkData);
        return new Response(
          JSON.stringify({
            success: true,
            method: 'otp_verified',
            user_id: profile.id,
            email: profile.email,
            profile: {
              full_name: profile.full_name,
              access_tier: profile.access_tier,
              whatsapp_verified: true,
            },
            password_setup_required: true,
            message: 'Account created. Please set your password.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Extract the token from the magic link
    const actionLink = linkData.action_link || '';
    let emailToken = '';
    try {
      emailToken = new URL(actionLink).searchParams.get('token_hash') || linkData.hashed_token || '';
    } catch {
      emailToken = linkData.hashed_token || '';
    }

    if (!emailToken) {
      return new Response(
        JSON.stringify({
          success: true,
          method: 'otp_verified',
          user_id: profile.id,
          email: profile.email,
          profile: {
            full_name: profile.full_name,
            access_tier: profile.access_tier,
            whatsapp_verified: true,
          },
          password_setup_required: passwordSetupRequired,
          needs_password_login: !passwordSetupRequired,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Step 5: Verify the magic link token to get a session ───
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        type: 'magiclink',
        token_hash: emailToken,
      }),
    });

    const sessionData = await verifyRes.json();

    if (!verifyRes.ok || !sessionData.access_token) {
      return new Response(
        JSON.stringify({
          success: true,
          method: 'otp_verified',
          user_id: profile.id,
          email: profile.email,
          profile: {
            full_name: profile.full_name,
            access_tier: profile.access_tier,
            whatsapp_verified: true,
          },
          password_setup_required: passwordSetupRequired,
          needs_password_login: !passwordSetupRequired,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Step 6: Log successful WhatsApp login ──────────────────
    await supabase.from('whatsapp_messages').insert({
      direction: 'system',
      phone_number: cleanPhone,
      message_type: 'login',
      body: `WhatsApp OTP login successful for ${profile.full_name || profile.email}`,
      status: 'delivered',
      metadata: { user_id: profile.id, method: 'whatsapp_otp' },
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        method: 'session',
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_in: sessionData.expires_in,
        user: sessionData.user,
        profile: {
          full_name: profile.full_name,
          access_tier: profile.access_tier,
          whatsapp_verified: true,
        },
        password_setup_required: passwordSetupRequired,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('WhatsApp login error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
