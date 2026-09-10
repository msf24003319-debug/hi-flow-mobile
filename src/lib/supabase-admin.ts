import { createClient } from '@supabase/supabase-js';

// Service-role client. SERVER ONLY — never import from a client component.
// Most admin pages use the anon client (RLS `is_admin()` grants access);
// use this only where you must bypass RLS in a server context.
// Fall back to placeholders so `createClient` never throws during `next build`
// (static generation runs without real env vars). Real env vars are always
// present at runtime, so this never affects actual requests.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'placeholder-key';

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
