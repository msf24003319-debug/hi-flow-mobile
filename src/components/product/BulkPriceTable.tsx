'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Product } from '@/types/admin.types';

interface BulkPriceTableProps {
  products: Product[];
  onSaved: () => void;
}

type Draft = { customer: string; wholesale: string };

export function BulkPriceTable({ products, onSaved }: BulkPriceTableProps) {
  const [prices, setPrices] = useState<Record<string, Draft>>(
    Object.fromEntries(
      products.map((p) => [
        p.id,
        {
          customer: String(p.price ?? p.product_prices?.customer_price ?? 0),
          wholesale: String(p.wholesale_price ?? p.product_prices?.wholesale_price ?? 0),
        },
      ])
    )
  );
  useEffect(() => {
    setPrices(Object.fromEntries(products.map((p) => [p.id, {
      customer: String(p.price ?? p.product_prices?.customer_price ?? 0),
      wholesale: String(p.wholesale_price ?? p.product_prices?.wholesale_price ?? 0),
    }])));
  }, [products]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isChanged = (p: Product) => {
    const draft = prices[p.id];
    if (!draft) return false;
    return (
      Number(draft.customer) !== (p.price ?? p.product_prices?.customer_price ?? 0) ||
      Number(draft.wholesale) !== (p.wholesale_price ?? p.product_prices?.wholesale_price ?? 0)
    );
  };

  const changed = products.filter(isChanged);

  const saveAll = async () => {
    if (!changed.length) return;
    setSaving(true);
    setMsg(null);
    try {
      const updates = changed.map((p) => {
        const draft = prices[p.id];
        const customer = Number(draft.customer);
        const wholesale = Number(draft.wholesale);
        if (!draft.customer.trim() || !draft.wholesale.trim() ||
            !Number.isFinite(customer) || !Number.isFinite(wholesale) || customer < 0 || wholesale < 0) {
          throw new Error('Enter valid nonnegative customer and wholesale prices.');
        }
        return { product_id: p.id, customer_price: customer, wholesale_price: wholesale };
      });
      const { error } = await supabase.rpc('admin_update_product_prices', { p_updates: updates });
      if (error) throw error;
      setMsg({ ok: true, text: `${changed.length} product(s) updated.` });
      onSaved();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-card border-b border-border text-muted uppercase text-[11px]">
              <th className="py-3 px-4">Product</th>
              <th className="py-3 px-4">Customer Price</th>
              <th className="py-3 px-4">Shopkeeper Wholesale Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-subtle">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-card/60">
                <td className="py-3 px-4 text-white font-medium">{p.name_en}</td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={saving}
                    value={prices[p.id]?.customer ?? ''}
                    onChange={(e) =>
                      setPrices((s) => ({ ...s, [p.id]: { ...s[p.id], customer: e.target.value } }))
                    }
                    className="w-32 px-2 py-1 bg-bg border border-border rounded font-mono text-white focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={saving}
                    value={prices[p.id]?.wholesale ?? ''}
                    onChange={(e) =>
                      setPrices((s) => ({ ...s, [p.id]: { ...s[p.id], wholesale: e.target.value } }))
                    }
                    className="w-32 px-2 py-1 bg-bg border border-border rounded font-mono text-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg && <p className={`text-xs ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}

      <button
        onClick={saveAll}
        disabled={saving || changed.length === 0}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-40"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving…' : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
