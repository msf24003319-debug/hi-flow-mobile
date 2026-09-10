import { createClient } from '@supabase/supabase-js';

// Service-role client. SERVER ONLY — never import from a client component.
// Most admin pages use the anon client (RLS `is_admin()` grants access);
// use this only where you must bypass RLS in a server context.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
