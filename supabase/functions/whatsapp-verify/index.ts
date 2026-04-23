// CropsIntelV2 — WhatsApp OTP Verification Edge Function
// Verifies OTP codes sent via WhatsApp
//
// POST /whatsapp-verify
// Body: { phone_number: '+1234567890', otp_code: '123456' }

// 2026-04-23: Version bump — see whatsapp-send/index.ts for context.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

console.log('[whatsapp-verify] boot', {
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
    const { phone_number, otp_code, user_id } = await req.json();

    if (!phone_number || !otp_code) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Missing phone_number or otp_code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanPhone = phone_number.startsWith('+') ? phone_number : `+${phone_number}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch the OTP record
    const { data: otpRecord, error: fetchErr } = await supabase
      .from('whatsapp_otps')
      .select('*')
      .eq('phone_number', cleanPhone)
      .single();

    if (fetchErr || !otpRecord) {
      return new Response(
        JSON.stringify({ verified: false, error: 'No OTP found for this number. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already verified
    if (otpRecord.verified) {
      return new Response(
        JSON.stringify({ verified: true, message: 'Already verified' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Too many attempts. Please request a new code.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ verified: false, error: 'OTP expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment attempts
    await supabase
      .from('whatsapp_otps')
      .update({ attempts: otpRecord.attempts + 1 })
      .eq('phone_number', cleanPhone);

    // Verify the OTP
    if (otpRecord.otp_code !== otp_code.trim()) {
      const remaining = MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return new Response(
        JSON.stringify({ verified: false, error: `Invalid code. ${remaining} attempts remaining.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // OTP matches — mark as verified
    await supabase
      .from('whatsapp_otps')
      .update({ verified: true })
      .eq('phone_number', cleanPhone);

    // Update user_profiles if user_id provided
    if (user_id) {
      await supabase
        .from('user_profiles')
        .update({
          whatsapp_number: cleanPhone,
          whatsapp_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user_id);
    }

    // Also update any profile matching this WhatsApp number
    await supabase
      .from('user_profiles')
      .update({
        whatsapp_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_number', cleanPhone);

    // Log the verification
    await supabase.from('whatsapp_messages').insert({
      direction: 'system',
      phone_number: cleanPhone,
      message_type: 'otp_verified',
      body: 'WhatsApp number verified successfully',
      status: 'delivered',
      metadata: { user_id },
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ verified: true, message: 'WhatsApp number verified successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Verify error:', err);
    return new Response(
      JSON.stringify({ verified: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
