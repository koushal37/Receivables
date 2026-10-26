import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your-service-role-key')
);

if (!isSupabaseConfigured) {
  console.warn(
    '\n⚠️  [Supabase Notice] SUPABASE_URL or SUPABASE_SERVICE_KEY is missing or set to placeholder values in backend/.env.\n' +
    '   Running in Interactive Prototype Store Mode (in-memory database seeded with B2B demo records) so your app never crashes with HTTP 502!\n' +
    '   Add your real Supabase credentials to backend/.env & frontend/.env to switch to live cloud persistence.\n'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
