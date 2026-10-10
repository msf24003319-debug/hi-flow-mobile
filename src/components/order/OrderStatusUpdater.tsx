'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { OrderStatus } from '@/types/admin.types';

const STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'dispatched',
  'ready_for_pickup',
  'delivered',
  'completed',
  'cancelled',
];

interface OrderStatusUpdaterProps {
  orderId: string;
  current: OrderStatus;
  onUpdated?: (s: OrderStatus) => void;
}

export function OrderStatusUpdater({ orderId, current, onUpdated }: OrderStatusUpdaterProps) {
  const [status, setStatus] = useState<OrderStatus>(current);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { error: e1 } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (e1) throw e1;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // old_status/new_status are the live table's original NOT NULL
      // columns (nothing in the UI reads them back); status is the
      // one this app actually displays.
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status,
        old_status: current,
        new_status: status,
        notes: note || null,
        changed_by: user?.id ?? null,
      });
      setMsg({ ok: true, text: 'Status updated.' });
      onUpdated?.(status);
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  if (current === 'quotation') return <p className="text-sm text-subtle">Convert this quotation from Billing History to confirm it and deduct stock.</p>;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-subtle mb-1">Order Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white capitalize focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-subtle mb-1">Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Dispatched via company van"
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving…' : 'Save Status'}
      </button>
    </div>
  );
}
