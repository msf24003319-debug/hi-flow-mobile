'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Feedback } from '@/types/admin.types';
import { formatDateTime } from '@/lib/utils';

function senderInfo(f: Feedback): { name: string; role: 'Shopkeeper' | 'Customer' | 'Unknown'; contact: string } {
  const shop = f.buyer?.shopkeepers;
  const cust = f.buyer?.customers;
  if (shop) return { name: shop.shop_name || shop.name, role: 'Shopkeeper', contact: shop.phone };
  if (cust) return { name: cust.name, role: 'Customer', contact: cust.phone };
  return { name: '—', role: 'Unknown', contact: '' };
}

export default function FeedbackPage() {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('feedback')
      .select(
        `*,
         buyer:profiles!feedback_buyer_id_fkey(shopkeepers(name, shop_name, phone), customers(name, phone))`
      )
      .order('created_at', { ascending: false });
    setRows((data as Feedback[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    await supabase.from('feedback').update({ is_read: true }).eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Feedback</h1>
        <p className="text-xs text-subtle mt-1">Messages from shopkeepers and customers.</p>
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted">No feedback yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => {
            const sender = senderInfo(f);
            return (
              <div
                key={f.id}
                className={`bg-surface border rounded-xl p-4 ${
                  f.is_read ? 'border-border' : 'border-brand/40'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white text-sm">{f.message}</p>
                    <p className="text-[11px] text-muted mt-2">
                      {sender.name}
                      {sender.contact ? ` · ${sender.contact}` : ''} ·{' '}
                      <span
                        className={
                          sender.role === 'Shopkeeper'
                            ? 'text-brand font-semibold'
                            : sender.role === 'Customer'
                            ? 'text-info font-semibold'
                            : ''
                        }
                      >
                        {sender.role}
                      </span>{' '}
                      · {formatDateTime(f.created_at)}
                    </p>
                  </div>
                  {!f.is_read && (
                    <button
                      onClick={() => markRead(f.id)}
                      className="flex items-center gap-1.5 text-xs text-brand border border-brand/30 bg-brand/10 px-2.5 py-1.5 rounded-md font-semibold shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" /> Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
