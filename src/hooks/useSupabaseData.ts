'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

interface Options {
  select?: string;
  order?: { column: string; ascending?: boolean };
  eq?: [string, string | number | boolean];
}

/** Generic client-side table fetch with refetch + loading + error. */
export function useSupabaseData<T = any>(table: string, opts: Options = {}) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const optsKey = JSON.stringify(opts);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from(table).select(opts.select ?? '*');
    if (opts.eq) query = query.eq(opts.eq[0], opts.eq[1]);
    if (opts.order) query = query.order(opts.order.column, { ascending: opts.order.ascending ?? true });
    const { data: rows, error: err } = await query;
    if (err) {
      // Surface it — a swallowed PostgREST error (bad column in a select,
      // RLS mismatch, missing FK for an embed) otherwise looks identical
      // to "the table is empty".
      console.error(`[useSupabaseData] ${table} query failed:`, err);
      setError(err.message);
    }
    setData((rows ?? []) as T[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, optsKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
