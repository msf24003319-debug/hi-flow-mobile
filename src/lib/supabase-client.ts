import { createClient } from '@supabase/supabase-js';

// Fall back to placeholders so `createClient` never throws during `next build`
// (static generation runs without real env vars). Real env vars are always
// present at runtime, so this never affects actual requests.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'hiflow-admin-auth',
  },
});
