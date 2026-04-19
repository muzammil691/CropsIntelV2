// CropsIntelV2 — Supabase Admin Client
// Server-side only (uses service_role key, bypasses RLS)
// Used by scrapers, processors, and autonomous functions

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load .env for Node.js scripts (not needed in Vite/browser)
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export default supabaseAdmin;
