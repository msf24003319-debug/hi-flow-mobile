'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const evaluate = useCallback(
    async (current: Session | null) => {
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', current.user.id)
        .maybeSingle();

      setIsAdmin(profile?.role === 'admin');
      setLoading(false);
    },
    [redirectTo, router]
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace(redirectTo);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => evaluate(s));
    return () => subscription.unsubscribe();
  }, [evaluate]);

  return { user, session, loading, isAdmin, signOut };
}
