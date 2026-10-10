'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';

interface UseAdminAuthReturn {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

export function useAdminAuth(redirectTo = '/login'): UseAdminAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const evaluate = async (current: Session | null, request: number) => {
      if (!active || request !== revision) return;
      setLoading(true);
      if (!current?.user) {
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        setLoading(false);
        router.replace(redirectTo);
        return;
      }

      setSession(current);
      setUser(current.user);

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', current.user.id)
          .maybeSingle();
        if (active && request === revision) setIsAdmin(!error && profile?.role === 'admin');
      } catch {
        if (active && request === revision) setIsAdmin(false);
      } finally {
        if (active && request === revision) setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, current) => {
      const request = ++revision;
      clearTimeout(timer);
      // Supabase runs this callback under its auth lock. Defer profile
      // requests until the callback returns so they can obtain a token.
      timer = setTimeout(() => { void evaluate(current, request); }, 0);
    });
    return () => {
      active = false;
      ++revision;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [redirectTo, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace(redirectTo);
  };

  return { user, session, loading, isAdmin, signOut };
}
