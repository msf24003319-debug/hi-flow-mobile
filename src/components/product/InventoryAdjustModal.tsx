'use client';

import { useEffect, useState } from 'react';
import { Plus, Minus, Equal, Save, History } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { InventoryAdjustment, InventoryAdjustmentType, InventoryOverviewRow, Product } from '@/types/admin.types';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime, resolveProductName } from '@/lib/utils';

interface InventoryAdjustModalProps {
  // Accepts either the inventory-overview RPC row or a plain products-table
  // row (e.g. from the Product Management table) — this modal only ever
  // reads id/unit/stock_quantity/name fields, which both shapes carry.
  product: InventoryOverviewRow | Product;
  onClose: () => void;
  onSaved: () => void;
}

const TYPES: { key: InventoryAdjustmentType; label: string; icon: typeof Plus }[] = [
  { key: 'increase', label: 'Increase', icon: Plus },
  { key: 'decrease', label: 'Decrease', icon: Minus },
  { key: 'set', label: 'Set Exact', icon: Equal },
];

export function InventoryAdjustModal({ product, onClose, onSaved }: InventoryAdjustModalProps) {
  const [type, setType] = useState<InventoryAdjustmentType>('increase');
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [history, setHistory] = useState<InventoryAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Defensive against the row shape drifting (e.g. an RPC that aliases
  // the id column differently) — resolve whatever id-like field is
  // actually present rather than assuming `.id` unconditionally.
  const productId: string | null =
    product?.id || (product as any)?.product_id || (product as any)?._id || null;

  // Defensive against the overview row using a different quantity field
  // name than expected — same reasoning as productId above.
  const currentStock: number = product?.stock_quantity ?? (product as any)?.stock ?? 0;

  // Diagnostic: log the exact row this modal was opened with, and — if
  // no id-like field resolved at all — the full list of keys actually
  // present on it. If the update button rejects every attempt with
  // "missing its ID", this is the definitive source of truth for
  // whether the row itself lacks an id, vs. something else being
  // wrong: if `Object.keys(product)` below does NOT include `id`,
  // `product_id`, or `_id`, the get_inventory_overview() RPC on the
  // live Supabase project is not returning an id column under any of
  // those names — that must be fixed in the SQL function itself, not
  // in this component, since there is nothing left client-side to read
  // it from.
  useEffect(() => {
    console.log('[InventoryAdjustModal] opened with product row:', product, 'resolved productId:', productId);
    if (!productId) {
      console.error('Selected product payload missing ID. Available keys:', product ? Object.keys(product) : product);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!productId) {
      setHistoryLoading(false);
      return;
    }
    supabase
      .from('inventory_adjustments')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setHistory((data as InventoryAdjustment[]) ?? []);
        setHistoryLoading(false);
      });
  }, [productId]);

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const changeType = (next: InventoryAdjustmentType) => {
    setType(next);
    // Reset the quantity cleanly on every type switch instead of
    // carrying over a stale value — avoids compounding into odd
    // strings (e.g. "050") when a follow-up keystroke concatenates
    // onto a previous unrelated value. "Set Exact" starts pre-filled
    // with the current stock so the admin edits from a real baseline.
    setQty(next === 'set' ? currentStock : 0);
  };

  const preview =
    type === 'increase' ? currentStock + qty : type === 'decrease' ? currentStock - qty : qty;
  const invalid = qty < 0 || (type === 'decrease' && preview < 0);

  const onQtyChange = (raw: string) => {
    // Strip leading zeros before parsing so "050" style values never
    // occur, and fall back to 0 for anything unparseable/empty.
    const parsed = parseInt(raw.replace(/^0+/, ''), 10) || 0;
    setQty(Math.max(0, parsed));
  };

  const handleSave = async () => {
    if (!productId) {
      console.error('Selected product payload missing ID:', product);
      setError('Cannot update inventory: this product is missing its ID. Please refresh and try again.');
      setToast({
        tone: 'error',
        message: 'This product row has no ID — see the browser console for the raw payload.',
      });
      return;
    }
    if (invalid || qty === 0) {
      setError(type === 'decrease' && preview < 0 ? 'This would take stock below zero.' : 'Enter a quantity greater than 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Adjustment type must reach the RPC as exactly one of the three
      // lowercase strings it accepts — normalize defensively even
      // though the UI only ever sets one of these three already.
      const adjustmentType = (type as string).toLowerCase() as InventoryAdjustmentType;

      const { error: err } = await supabase.rpc('admin_adjust_inventory', {
        p_product_id: productId,
        p_adjustment_type: adjustmentType,
        p_quantity: Math.abs(Number(qty)),
        p_reason: reason.trim() || null,
      });
      if (err) throw err;
      // No success toast here — the modal closes immediately below,
      // which would unmount it before a toast could ever be seen.
      // onSaved() refreshes the table, which is the success signal.
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('[InventoryAdjustModal] admin_adjust_inventory failed:', err);
      const message = err?.message || 'Failed to update inventory';
      setError(message);
      setToast({ tone: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Inventory"
      subtitle={resolveProductName(product)}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Updating…' : 'Update Inventory'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
        )}

        {!productId && (
          <div className="p-3 bg-warn/10 border border-warn/30 rounded-lg text-warn text-xs space-y-2">
            <p className="font-semibold">
              Debug: this row has no usable id (checked `id`, `product_id`, `_id`). Copy the JSON below back to
              engineering — this is the exact payload get_inventory_overview() sent for this row.
            </p>
            <pre className="whitespace-pre-wrap break-all bg-bg/60 rounded p-2 text-[10px] text-subtle max-h-40 overflow-y-auto custom-scrollbar">
              {JSON.stringify(product, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
          <div>
            <p className="text-[11px] text-muted">Current Stock</p>
            <p className="text-2xl font-black text-white">
              {currentStock} <span className="text-xs font-medium text-subtle">{product.unit}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">New Stock (preview)</p>
            <p className={`text-2xl font-black ${invalid ? 'text-danger' : 'text-brand'}`}>
              {Math.max(preview, 0)} <span className="text-xs font-medium text-subtle">{product.unit}</span>
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-subtle mb-2">Adjustment Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((tOpt) => {
              const Icon = tOpt.icon;
              const active = type === tOpt.key;
              return (
                <button
                  key={tOpt.key}
                  type="button"
                  onClick={() => changeType(tOpt.key)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border transition ${
                    active
                      ? 'bg-brand/15 border-brand text-brand'
                      : 'bg-bg border-border text-subtle hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tOpt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-subtle mb-1">
            {type === 'set' ? 'New Exact Quantity' : 'Adjustment Quantity'}
          </label>
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-subtle mb-1">Reason (optional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. New shipment, damaged units, stock count correction…"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-3.5 w-3.5 text-muted" />
            <p className="text-xs font-semibold text-subtle">Recent Adjustments</p>
          </div>
          {historyLoading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted">No adjustments recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-white font-medium">
                      {h.previous_quantity} → {h.new_quantity}{' '}
                      <span className={h.adjustment >= 0 ? 'text-ok' : 'text-danger'}>
                        ({h.adjustment >= 0 ? '+' : ''}
                        {h.adjustment})
                      </span>
                    </p>
                    {h.reason && <p className="text-[11px] text-muted mt-0.5">{h.reason}</p>}
                  </div>
                  <p className="text-[10px] text-muted whitespace-nowrap ml-2">{formatDateTime(h.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="alert"
          className={`fixed bottom-6 right-6 z-[60] max-w-sm px-4 py-3 rounded-lg border text-xs font-medium shadow-lg ${
            toast.tone === 'error'
              ? 'bg-danger/15 border-danger/40 text-danger'
              : 'bg-ok/15 border-ok/40 text-ok'
          }`}
        >
          {toast.message}
        </div>
      )}
    </Modal>
  );
}
