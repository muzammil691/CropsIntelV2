// CropsIntelV2 — WhatsApp Login Edge Function
// Verifies OTP → Finds user by WhatsApp number → Returns Supabase auth session
// Last auto-deploy trigger: 2026-04-24 (SUPABASE_ACCESS_TOKEN pipeline first run)
//
// POST /whatsapp-login
// Body: { phone_number: '+1234567890', otp_code: '123456' }
// Returns: { success: true, session: {...}, user: {...} } or { success: false, error: '...' }

// 2026-04-23: Version bump — see whatsapp-send/index.ts for context.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

console.log('[whatsapp-login] boot', {
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_KEY,
});

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
        // First insert a new row with the new ID, then delete the old one.
        // Both steps are wrapped so a delete-failure can't create a split-brain
        // (two profile rows for the same user). If delete fails, we mark the
        // old row with a cleanup flag so a reconcile job can handle it later.
        const { data: fullProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', oldProfileId)
          .single();

        if (fullProfile) {
          const { id: _oldId, ...profileData } = fullProfile;

          const { error: upsertErr } = await supabase.from('user_profiles').upsert({
            ...profileData,
            id: newAuthId,
            whatsapp_verified: true,
            updated_at: new Date().toISOString(),
          });

          if (upsertErr) {
            console.error('V1 migration: new profile upsert failed, aborting move', upsertErr);
            // Keep old profile intact; user can still log in via magiclink retry.
            profile.id = oldProfileId;
          } else {
            // Delete old profile row. If this fails, DO NOT lose the upserted
            // new row — instead tag the old row as orphaned so a cleanup job
            // can purge it. This prevents the FK-constraint or network-failure
            // case from leaving duplicate rows silently.
            const { error: deleteErr } = await supabase
              .from('user_profiles')
              .delete()
              .eq('id', oldProfileId);

            if (deleteErr) {
              console.error('V1 migration: old profile delete failed, tagging as orphan', deleteErr);
              // Stash cleanup flag in metadata JSONB (no schema migration needed).
              // A reconcile job can `where metadata->>'cleanup_pending' = 'true'` later.
              const existingMeta = (fullProfile as any).metadata || {};
              await supabase
                .from('user_profiles')
                .update({
                  metadata: {
                    ...existingMeta,
                    cleanup_pending: true,
                    cleanup_reason: deleteErr.message,
                    cleanup_replacement_id: newAuthId,
                    cleanup_flagged_at: new Date().toISOString(),
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', oldProfileId);
            }

            profile.id = newAuthId;
          }
        }
      } else if (newAuthId === oldProfileId) {
        // IDs match — no profile move needed. Rare but possible if auth and
        // profiles tables were seeded with matching UUIDs during V1 import.
        console.log('V1 migration: auth ID matches profile ID, no move needed');
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
      // Magic link returned but no token — cannot fetch a session.
      // Flags are mutually exclusive; see the session-failure fallback below.
      const messageForUser = passwordSetupRequired
        ? 'Account ready. Please set a password to complete sign in.'
        : 'OTP verified. Please enter your password to finish signing in, or use Reset Password if you don\'t remember it.';
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
          message: messageForUser,
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
      // Session token retrieval failed. The flags below are MUTUALLY EXCLUSIVE
      // — exactly one is true. Frontend (Login.jsx) must check
      // `password_setup_required` FIRST, then `needs_password_login`.
      //   • V1 freshly-migrated user → password_setup_required=true → /set-password
      //   • Existing auth user whose session fetch glitched → needs_password_login=true → /login password form
      const messageForUser = passwordSetupRequired
        ? 'Account ready. Please set a password to complete sign in.'
        : 'OTP verified. Please enter your password to finish signing in, or use Reset Password if you don\'t remember it.';
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
          message: messageForUser,
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
