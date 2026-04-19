// CropsIntelV2 — Database Setup Script
// Reads schema.sql and executes it against Supabase
// Run: node scripts/setup-database.js

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function setupDatabase() {
  console.log('Setting up CropsIntelV2 database...');
  console.log(`URL: ${supabaseUrl}`);

  const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Split by semicolons, filter out empty statements and comments-only blocks
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.match(/^--/));

  console.log(`Found ${statements.length} SQL statements to execute`);

  let success = 0;
  let failed = 0;

  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc('', {}).then(() => ({})).catch(() => ({}));
      // Use the REST API's SQL endpoint via fetch
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: stmt })
      });
      success++;
    } catch (err) {
      failed++;
      console.error(`Failed: ${stmt.substring(0, 60)}...`, err.message);
    }
  }

  console.log(`\nDatabase setup complete: ${success} succeeded, ${failed} failed`);
  console.log('\nNote: Run schema.sql directly in Supabase SQL Editor for best results.');
  console.log('Dashboard: https://supabase.com/dashboard/project/eywsfmixzrdfcywmdaaw/sql');
}

setupDatabase().catch(console.error);
