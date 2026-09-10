'use client';

import { useState } from 'react';
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
          customer: String(p.product_prices?.customer_price ?? 0),
          wholesale: String(p.product_prices?.wholesale_price ?? 0),
        },
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isChanged = (p: Product) => {
    const draft = prices[p.id];
    if (!draft) return false;
    return (
      Number(draft.customer) !== (p.product_prices?.customer_price ?? 0) ||
      Number(draft.wholesale) !== (p.product_prices?.wholesale_price ?? 0)
    );
  };

  const changed = products.filter(isChanged);

  const saveAll = async () => {
    if (!changed.length) return;
    setSaving(true);
    setMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      for (const p of changed) {
        const draft = prices[p.id];
        const newCustomer = Number(draft.customer);
        const newWholesale = Number(draft.wholesale);
        const prevCustomer = p.product_prices?.customer_price ?? 0;
        const prevWholesale = p.product_prices?.wholesale_price ?? 0;

        const { error } = await supabase
          .from('product_prices')
          .upsert({ product_id: p.id, customer_price: newCustomer, wholesale_price: newWholesale });
        if (error) throw error;

        const historyRows: Array<Record<string, unknown>> = [];
        if (newCustomer !== prevCustomer) {
          historyRows.push({
            product_id: p.id,
            price_type: 'customer',
            old_price: prevCustomer,
            new_price: newCustomer,
            changed_by: user?.id,
          });
        }
        if (newWholesale !== prevWholesale) {
          historyRows.push({
            product_id: p.id,
            price_type: 'wholesale',
            old_price: prevWholesale,
            new_price: newWholesale,
            changed_by: user?.id,
          });
        }
        if (historyRows.length) {
          await supabase.from('product_price_history').insert(historyRows);
        }
      }
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
