'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { ShieldCheck } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profile?.role === 'admin') router.replace('/dashboard');
      else {
        await supabase.auth.signOut();
        router.replace('/login');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-bg text-white gap-4">
      <div className="h-14 w-14 rounded-full bg-brand/10 border border-brand/30 flex items-center justify-center animate-pulse">
        <ShieldCheck className="h-8 w-8 text-brand" />
      </div>
      <p className="text-xs text-subtle">Loading Hi Flow Admin…</p>
    </div>
  );
}
