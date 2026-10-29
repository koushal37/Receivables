// Load env before the client is created: ESM evaluates imports before the
// importing module's body, so dotenv.config() in index.js ran too late.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required env vars SUPABASE_URL and/or SUPABASE_SERVICE_KEY (see backend/.env.example)');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
