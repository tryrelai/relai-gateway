import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client. Server-side only. Bypasses RLS — never expose this key.
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
