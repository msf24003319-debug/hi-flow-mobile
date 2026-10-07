// 'use client';

// import { useEffect, useState } from 'react';
// import { Plus, Minus, Equal, Save, History } from 'lucide-react';
// import { supabase } from '@/lib/supabase-client';
// import { InventoryAdjustment, InventoryAdjustmentType, InventoryOverviewRow, Product } from '@/types/admin.types';
// import { Modal } from '@/components/ui/Modal';
// import { formatDateTime, resolveProductName } from '@/lib/utils';

// interface InventoryAdjustModalProps {
//   // Accepts either the inventory-overview RPC row or a plain products-table
//   // row (e.g. from the Product Management table) — this modal only ever
//   // reads id/unit/stock_quantity/name fields, which both shapes carry.
//   product: InventoryOverviewRow | Product;
//   onClose: () => void;
//   onSaved: (update: { productId: string; stockQuantity: number }) => void;
// }

// const TYPES: { key: InventoryAdjustmentType; label: string; icon: typeof Plus }[] = [
//   { key: 'increase', label: 'Increase', icon: Plus },
//   { key: 'decrease', label: 'Decrease', icon: Minus },
//   { key: 'set', label: 'Set Exact', icon: Equal },
// ];

// export function InventoryAdjustModal({ product, onClose, onSaved }: InventoryAdjustModalProps) {
//   const [type, setType] = useState<InventoryAdjustmentType>('increase');
//   const [qty, setQty] = useState<number>(0);
//   const [reason, setReason] = useState('');
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [toast, setToast] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
//   const [history, setHistory] = useState<InventoryAdjustment[]>([]);
//   const [historyLoading, setHistoryLoading] = useState(true);

//   // Defensive against the row shape drifting (e.g. an RPC that aliases
//   // the id column differently) — resolve whatever id-like field is
//   // actually present rather than assuming `.id` unconditionally.
//   const productId: string | null =
//     product?.id || (product as any)?.product_id || (product as any)?._id || null;

//   // Defensive against the overview row using a different quantity field
//   // name than expected — same reasoning as productId above.
//   const currentStock = Number(product?.stock_quantity ?? (product as any)?.stock ?? 0) || 0;

//   // Diagnostic: log the exact row this modal was opened with, and — if
//   // no id-like field resolved at all — the full list of keys actually
//   // present on it. If the update button rejects every attempt with
//   // "missing its ID", this is the definitive source of truth for
//   // whether the row itself lacks an id, vs. something else being
//   // wrong: if `Object.keys(product)` below does NOT include `id`,
//   // `product_id`, or `_id`, the get_inventory_overview() RPC on the
//   // live Supabase project is not returning an id column under any of
//   // those names — that must be fixed in the SQL function itself, not
//   // in this component, since there is nothing left client-side to read
//   // it from.
//   useEffect(() => {
//     console.log('[InventoryAdjustModal] opened with product row:', product, 'resolved productId:', productId);
//     if (!productId) {
//       console.error('Selected product payload missing ID. Available keys:', product ? Object.keys(product) : product);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   useEffect(() => {
//     if (!productId) {
//       setHistoryLoading(false);
//       return;
//     }
//     supabase
//       .from('inventory_adjustments')
//       .select('*')
//       .eq('product_id', productId)
//       .order('created_at', { ascending: false })
//       .limit(10)
//       .then(({ data }) => {
//         setHistory((data as InventoryAdjustment[]) ?? []);
//         setHistoryLoading(false);
//       });
//   }, [productId]);

//   // Auto-dismiss the toast after a few seconds.
//   useEffect(() => {
//     if (!toast) return;
//     const timer = setTimeout(() => setToast(null), 4000);
//     return () => clearTimeout(timer);
//   }, [toast]);

//   const changeType = (next: InventoryAdjustmentType) => {
//     setType(next);
//     // Reset the quantity cleanly on every type switch instead of
//     // carrying over a stale value — avoids compounding into odd
//     // strings (e.g. "050") when a follow-up keystroke concatenates
//     // onto a previous unrelated value. "Set Exact" starts pre-filled
//     // with the current stock so the admin edits from a real baseline.
//     setQty(next === 'set' ? currentStock : 0);
//   };

//   const preview =
//     type === 'increase' ? currentStock + qty : type === 'decrease' ? currentStock - qty : qty;
//   const invalid = !Number.isSafeInteger(qty) || qty < 0 || !Number.isSafeInteger(preview) || (type === 'decrease' && preview < 0);

//   const onQtyChange = (raw: string) => {
//     // Strip leading zeros before parsing so "050" style values never
//     // occur, and fall back to 0 for anything unparseable/empty.
//     const parsed = parseInt(raw.replace(/^0+/, ''), 10) || 0;
//     setQty(Math.max(0, parsed));
//   };

//   const handleSave = async () => {
//     if (saving) return;
//     if (!productId) {
//       console.error('Selected product payload missing ID:', product);
//       setError('Cannot update inventory: this product is missing its ID. Please refresh and try again.');
//       setToast({
//         tone: 'error',
//         message: 'This product row has no ID — see the browser console for the raw payload.',
//       });
//       return;
//     }
//     if (invalid || (qty === 0 && type !== 'set')) {
//       setError(type === 'decrease' && preview < 0 ? 'This would take stock below zero.' : 'Enter a quantity greater than 0.');
//       return;
//     }
//     setSaving(true);
//     setError(null);
//     try {
//       // Adjustment type must reach the RPC as exactly one of the three
//       // lowercase strings it accepts — normalize defensively even
//       // though the UI only ever sets one of these three already.
//       const adjustmentType = (type as string).toLowerCase() as InventoryAdjustmentType;

//       const { error: err } = await supabase.rpc('admin_adjust_inventory', {
//         p_product_id: productId,
//         p_adjustment_type: adjustmentType,
//         p_quantity: Math.abs(Number(qty)),
//         p_reason: reason.trim() || null,
//       });
//       if (err) throw err;
//       // Publish the saved quantity immediately; the page reconciles it with the server.
//       onSaved({ productId, stockQuantity: preview });
//       onClose();
//     } catch (err: any) {
//       console.error('[InventoryAdjustModal] admin_adjust_inventory failed:', err);
//       const message = err?.message || 'Failed to update inventory';
//       setError(message);
//       setToast({ tone: 'error', message });
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <Modal
//       open
//       onClose={onClose}
//       title="Edit Inventory"
//       subtitle={resolveProductName(product)}
//       footer={
//         <>
//           <button
//             type="button"
//             onClick={onClose}
//             className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium"
//           >
//             Cancel
//           </button>
//           <button
//             type="button"
//             onClick={handleSave}
//             disabled={saving}
//             className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
//           >
//             <Save className="h-4 w-4" />
//             {saving ? 'Updating…' : 'Update Inventory'}
//           </button>
//         </>
//       }
//     >
//       <div className="space-y-5">
//         {error && (
//           <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
//         )}

//         {!productId && (
//           <div className="p-3 bg-warn/10 border border-warn/30 rounded-lg text-warn text-xs space-y-2">
//             <p className="font-semibold">
//               Debug: this row has no usable id (checked `id`, `product_id`, `_id`). Copy the JSON below back to
//               engineering — this is the exact payload get_inventory_overview() sent for this row.
//             </p>
//             <pre className="whitespace-pre-wrap break-all bg-bg/60 rounded p-2 text-[10px] text-subtle max-h-40 overflow-y-auto custom-scrollbar">
//               {JSON.stringify(product, null, 2)}
//             </pre>
//           </div>
//         )}

//         <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
//           <div>
//             <p className="text-[11px] text-muted">Current Stock</p>
//             <p className="text-2xl font-black text-white">
//               {currentStock} <span className="text-xs font-medium text-subtle">{product.unit}</span>
//             </p>
//           </div>
//           <div className="text-right">
//             <p className="text-[11px] text-muted">New Stock (preview)</p>
//             <p className={`text-2xl font-black ${invalid ? 'text-danger' : 'text-brand'}`}>
//               {Math.max(preview, 0)} <span className="text-xs font-medium text-subtle">{product.unit}</span>
//             </p>
//           </div>
//         </div>

//         <div>
//           <label className="block text-xs font-medium text-subtle mb-2">Adjustment Type</label>
//           <div className="grid grid-cols-3 gap-2">
//             {TYPES.map((tOpt) => {
//               const Icon = tOpt.icon;
//               const active = type === tOpt.key;
//               return (
//                 <button
//                   key={tOpt.key}
//                   type="button"
//                   onClick={() => changeType(tOpt.key)}
//                   className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border transition ${
//                     active
//                       ? 'bg-brand/15 border-brand text-brand'
//                       : 'bg-bg border-border text-subtle hover:text-white'
//                   }`}
//                 >
//                   <Icon className="h-3.5 w-3.5" />
//                   {tOpt.label}
//                 </button>
//               );
//             })}
//           </div>
//         </div>

//         <div>
//           <label className="block text-xs font-medium text-subtle mb-1">
//             {type === 'set' ? 'New Exact Quantity' : 'Adjustment Quantity'}
//           </label>
//           <input
//             type="number"
//             min={0}
//             value={qty}
//             onChange={(e) => onQtyChange(e.target.value)}
//             className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
//             autoFocus
//           />
//         </div>

//         <div>
//           <label className="block text-xs font-medium text-subtle mb-1">Reason (optional)</label>
//           <input
//             value={reason}
//             onChange={(e) => setReason(e.target.value)}
//             placeholder="e.g. New shipment, damaged units, stock count correction…"
//             className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
//           />
//         </div>

//         <div>
//           <div className="flex items-center gap-2 mb-2">
//             <History className="h-3.5 w-3.5 text-muted" />
//             <p className="text-xs font-semibold text-subtle">Recent Adjustments</p>
//           </div>
//           {historyLoading ? (
//             <p className="text-xs text-muted">Loading…</p>
//           ) : history.length === 0 ? (
//             <p className="text-xs text-muted">No adjustments recorded yet.</p>
//           ) : (
//             <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
//               {history.map((h) => (
//                 <div key={h.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
//                   <div>
//                     <p className="text-xs text-white font-medium">
//                       {h.previous_quantity} → {h.new_quantity}{' '}
//                       <span className={h.adjustment >= 0 ? 'text-ok' : 'text-danger'}>
//                         ({h.adjustment >= 0 ? '+' : ''}
//                         {h.adjustment})
//                       </span>
//                     </p>
//                     {h.reason && <p className="text-[11px] text-muted mt-0.5">{h.reason}</p>}
//                   </div>
//                   <p className="text-[10px] text-muted whitespace-nowrap ml-2">{formatDateTime(h.created_at)}</p>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>

//       {toast && (
//         <div
//           role="alert"
//           className={`fixed bottom-6 right-6 z-[60] max-w-sm px-4 py-3 rounded-lg border text-xs font-medium shadow-lg ${
//             toast.tone === 'error'
//               ? 'bg-danger/15 border-danger/40 text-danger'
//               : 'bg-ok/15 border-ok/40 text-ok'
//           }`}
//         >
//           {toast.message}
//         </div>
//       )}
//     </Modal>
//   );
// }


'use client';

import { useEffect, useRef, useState } from 'react';
import { InventorySavedUpdate, verifySavedInventory } from '@/lib/inventory-persistence';
import { Plus, Minus, Equal, Save, History } from 'lucide-react';

import { supabase } from '@/lib/supabase-client';

import {
  InventoryAdjustment,
  InventoryAdjustmentType,
  InventoryOverviewRow,
  Product,
} from '@/types/admin.types';

import { Modal } from '@/components/ui/Modal';
import { formatDateTime, resolveProductName } from '@/lib/utils';

interface InventoryAdjustModalProps {
  product: InventoryOverviewRow | Product;
  onClose: () => void;
  onSaved: (update: InventorySavedUpdate) => void;
  onSaveStart?: () => void;
  onSaveFinished?: () => void;
}

const TYPES: {
  key: InventoryAdjustmentType;
  label: string;
  icon: typeof Plus;
}[] = [
  { key: 'increase', label: 'Increase', icon: Plus },
  { key: 'decrease', label: 'Decrease', icon: Minus },
  { key: 'set', label: 'Set Exact', icon: Equal },
];

export function InventoryAdjustModal({
  product,
  onClose,
  onSaved,
  onSaveStart,
  onSaveFinished,
}: InventoryAdjustModalProps) {
  const [type, setType] =
    useState<InventoryAdjustmentType>('increase');

  const initialCustomer = product.price ?? ('product_prices' in product ? product.product_prices?.customer_price : null) ?? 0;
  const initialWholesale = product.wholesale_price ?? ('product_prices' in product ? product.product_prices?.wholesale_price : null) ?? 0;
  const [customerPrice, setCustomerPrice] = useState(String(initialCustomer));
  const [wholesalePrice, setWholesalePrice] = useState(String(initialWholesale));
  const pricesChanged = Number(customerPrice) !== Number(initialCustomer) || Number(wholesalePrice) !== Number(initialWholesale);
  const pricesInvalid = !customerPrice.trim() || !wholesalePrice.trim() ||
    !Number.isFinite(Number(customerPrice)) || !Number.isFinite(Number(wholesalePrice)) ||
    Number(customerPrice) < 0 || Number(wholesalePrice) < 0;

  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const committed = useRef(false);
  const expectedSavedStock = useRef<number | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    tone: 'error' | 'success';
    message: string;
  } | null>(null);

  const [history, setHistory] = useState<InventoryAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  /*
   * Resolve the product ID defensively.
   */
  const productId: string | null =
    product?.id ||
    (product as any)?.product_id ||
    (product as any)?._id ||
    null;

  /*
   * Read the current stock from the row supplied by the inventory page.
   */
  const currentStock =
    Number(
      product?.stock_quantity ??
        (product as any)?.stock ??
        0,
    ) || 0;

  const stockChanged = type === 'set' ? qty !== currentStock : qty !== 0;

  /*
   * Log the actual row once when the modal opens.
   */
  useEffect(() => {
    console.log(
      '[InventoryAdjustModal] opened',
      {
        product,
        productId,
        currentStock,
      },
    );

    if (!productId) {
      console.error(
        '[InventoryAdjustModal] Product is missing ID',
        {
          product,
          availableKeys: product
            ? Object.keys(product)
            : [],
        },
      );
    }

    // Intentionally only run when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Load recent adjustment history.
   */
  useEffect(() => {
    let cancelled = false;

    if (!productId) {
      setHistoryLoading(false);
      return;
    }

    const loadHistory = async () => {
      setHistoryLoading(true);

      const { data, error: historyError } =
        await supabase
          .from('inventory_adjustments')
          .select('*')
          .eq('product_id', productId)
          .order('created_at', {
            ascending: false,
          })
          .limit(10);

      if (cancelled) return;

      if (historyError) {
        console.error(
          '[InventoryAdjustModal] Failed to load history:',
          historyError,
        );

        setHistory([]);
      } else {
        setHistory(
          (data as InventoryAdjustment[]) ?? [],
        );
      }

      setHistoryLoading(false);
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  /*
   * Auto-dismiss toast.
   */
  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(
      () => setToast(null),
      4000,
    );

    return () => clearTimeout(timer);
  }, [toast]);

  /*
   * Change adjustment type.
   */
  const changeType = (
    next: InventoryAdjustmentType,
  ) => {
    setType(next);

    if (next === 'set') {
      setQty(currentStock);
    } else {
      setQty(0);
    }

    setError(null);
  };

  /*
   * Calculate preview.
   */
  const preview =
    type === 'increase'
      ? currentStock + qty
      : type === 'decrease'
        ? currentStock - qty
        : qty;

  const invalid =
    !Number.isSafeInteger(qty) ||
    qty < 0 ||
    !Number.isSafeInteger(preview) ||
    (type === 'decrease' && preview < 0);

  /*
   * Quantity input.
   */
  const onQtyChange = (raw: string) => {
    const cleaned = raw.replace(/^0+/, '');

    const parsed =
      parseInt(cleaned, 10) || 0;

    setQty(Math.max(0, parsed));
    setError(null);
  };

  /*
   * Save inventory adjustment.
   *
   * IMPORTANT:
   * We do NOT trust the calculated `preview` as the final
   * database value.
   *
   * The RPC performs the real update.
   * After it succeeds, we read the actual stock_quantity
   * from products and send THAT value to the parent.
   *
   * This prevents the inventory page from showing a value
   * that differs from the database.
   */
  const handleSave = async () => {
    if (saveLock.current) return;

    if (!productId) {
      console.error(
        '[InventoryAdjustModal] Cannot save. Missing product ID:',
        product,
      );

      setError(
        'Cannot update inventory: this product is missing its ID. Please refresh and try again.',
      );

      setToast({
        tone: 'error',
        message:
          'This product row has no ID. Please refresh the page and try again.',
      });

      return;
    }

    if (
      !committed.current && (invalid || pricesInvalid || (!stockChanged && !pricesChanged))
    ) {
      setError(
        type === 'decrease' && preview < 0
          ? 'This would take stock below zero.'
          : 'Enter valid prices and change a price or stock quantity.',
      );

      return;
    }

    saveLock.current = true;
    setSaving(true);
    onSaveStart?.();
    setError(null);
    setToast(null);

    try {
      const adjustmentType =
        type.toLowerCase() as InventoryAdjustmentType;

      console.log(
        '[InventoryAdjustModal] Saving inventory adjustment:',
        {
          productId,
          adjustmentType,
          quantity: Math.abs(Number(qty)),
          reason: reason.trim() || null,
          currentStock,
          preview,
        },
      );

      if (!committed.current) {
        // Capture the database baseline, rather than trusting the UI preview.
        const { data: before, error: beforeError } = await supabase.from('products')
          .select('id, stock_quantity, stock').eq('id', productId).single();
        if (beforeError) throw beforeError;
        const baseline = Number(before?.stock_quantity);
        if (before?.stock_quantity == null || !Number.isSafeInteger(baseline) || baseline < 0 ||
            before?.stock == null || Number(before.stock) !== baseline) {
          throw new Error('Cannot adjust inventory: the database stock columns are invalid or disagree.');
        }
        expectedSavedStock.current = !stockChanged ? baseline : adjustmentType === 'increase' ? baseline + qty
          : adjustmentType === 'decrease' ? baseline - qty : qty;
        if (!Number.isSafeInteger(expectedSavedStock.current) || expectedSavedStock.current < 0) {
          throw new Error('The requested adjustment is invalid for the current database stock.');
        }
        console.debug('[inventory] database baseline', { productId, baseline, expectedStock: expectedSavedStock.current });

        const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_update_inventory_and_prices', {
          p_product_id: productId,
          p_adjustment_type: stockChanged ? adjustmentType : null,
          p_quantity: Math.abs(Number(qty)),
          p_reason: reason.trim() || null,
          p_customer_price: pricesChanged ? Number(customerPrice) : null,
          p_wholesale_price: pricesChanged ? Number(wholesalePrice) : null,
        });
        if (rpcError) throw rpcError;
        committed.current = true;
        // The row-locked RPC can account for a concurrent edit after our baseline
        // read. Its integer return is authoritative; the read-back must agree.
        if (typeof rpcResult === 'number' && Number.isSafeInteger(rpcResult) && rpcResult >= 0) {
          expectedSavedStock.current = rpcResult;
        }
        setVerificationPending(true);
        console.debug('[inventory] adjustment RPC result', { productId, rpcResult });
      }

      // Never replay Increase/Decrease if this read fails after a committed RPC.
      const confirmed = await verifySavedInventory(supabase, productId);
      if (confirmed.stockQuantity !== expectedSavedStock.current) {
        throw new Error(`Requested stock ${expectedSavedStock.current}, but products.stock_quantity is ${confirmed.stockQuantity}. The RPC may have updated a legacy column, or another writer changed this product. Inspect the RPC and triggers before adjusting again.`);
      }
      if (pricesChanged && (Number(confirmed.inventoryRow.price) !== Number(customerPrice) ||
          Number(confirmed.inventoryRow.wholesale_price) !== Number(wholesalePrice))) {
        throw new Error('Saved product prices do not match the requested prices.');
      }
      setVerificationPending(false);
      onSaved(confirmed);

      /*
       * The parent will close/reconcile the inventory UI.
       */
      onClose();
    } catch (err: any) {
      console.error(
        '[InventoryAdjustModal] Inventory update failed:',
        err,
      );

      const detail = err?.message || 'Failed to update inventory';
      const message = committed.current
        ? `The adjustment succeeded, but verification failed: ${detail}. Retry verification; the adjustment will not be applied again.`
        : detail;

      setError(message);

      setToast({
        tone: 'error',
        message,
      });
    } finally {
      saveLock.current = false;
      setSaving(false);
      onSaveFinished?.();
    }
  };

  return (
    <Modal
      open
      onClose={() => { if (!saveLock.current) onClose(); }}
      title="Edit Inventory"
      subtitle={resolveProductName(product)}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !productId}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />

            {saving
              ? 'Updating…'
              : verificationPending ? 'Verify Saved Inventory' : 'Update Inventory'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
            {error}
          </div>
        )}

        {!productId && (
          <div className="p-3 bg-warn/10 border border-warn/30 rounded-lg text-warn text-xs space-y-2">
            <p className="font-semibold">
              This product row has no usable ID.
            </p>

            <pre className="whitespace-pre-wrap break-all bg-bg/60 rounded p-2 text-[10px] text-subtle max-h-40 overflow-y-auto custom-scrollbar">
              {JSON.stringify(
                product,
                null,
                2,
              )}
            </pre>
          </div>
        )}

        {/* Current / Preview */}
        <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
          <div>
            <p className="text-[11px] text-muted">
              Current Stock
            </p>

            <p className="text-2xl font-black text-white">
              {currentStock}{' '}
              <span className="text-xs font-medium text-subtle">
                {product.unit}
              </span>
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] text-muted">
              New Stock (preview)
            </p>

            <p
              className={`text-2xl font-black ${
                invalid
                  ? 'text-danger'
                  : 'text-brand'
              }`}
            >
              {Math.max(preview, 0)}{' '}
              <span className="text-xs font-medium text-subtle">
                {product.unit}
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-subtle">
            Customer Price (Rs)
            <input type="number" min="0" step="0.01" value={customerPrice}
              disabled={saving || verificationPending} onChange={(e) => setCustomerPrice(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-bg border border-border rounded-lg text-white" />
          </label>
          <label className="text-xs text-subtle">
            Wholesale Price (Rs)
            <input type="number" min="0" step="0.01" value={wholesalePrice}
              disabled={saving || verificationPending} onChange={(e) => setWholesalePrice(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-bg border border-border rounded-lg text-white" />
          </label>
        </div>

        {/* Adjustment Type */}
        <div>
          <label className="block text-xs font-medium text-subtle mb-2">
            Adjustment Type
          </label>

          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((tOpt) => {
              const Icon = tOpt.icon;
              const active =
                type === tOpt.key;

              return (
                <button
                  key={tOpt.key}
                  type="button"
                  onClick={() =>
                    changeType(tOpt.key)
                  }
                  disabled={saving || verificationPending}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border transition ${
                    active
                      ? 'bg-brand/15 border-brand text-brand'
                      : 'bg-bg border-border text-subtle hover:text-white'
                  } disabled:opacity-50`}
                >
                  <Icon className="h-3.5 w-3.5" />

                  {tOpt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-xs font-medium text-subtle mb-1">
            {type === 'set'
              ? 'New Exact Quantity'
              : 'Adjustment Quantity'}
          </label>

          <input
            type="number"
            min={0}
            value={qty}
            disabled={saving || verificationPending}
            onChange={(e) =>
              onQtyChange(e.target.value)
            }
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
            autoFocus
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-subtle mb-1">
            Reason (optional)
          </label>

          <input
            value={reason}
            disabled={saving || verificationPending}
            onChange={(e) =>
              setReason(e.target.value)
            }
            placeholder="e.g. New shipment, damaged units, stock count correction…"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          />
        </div>

        {/* History */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-3.5 w-3.5 text-muted" />

            <p className="text-xs font-semibold text-subtle">
              Recent Adjustments
            </p>
          </div>

          {historyLoading ? (
            <p className="text-xs text-muted">
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted">
              No adjustments recorded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-xs text-white font-medium">
                      {h.previous_quantity} →{' '}
                      {h.new_quantity}{' '}
                      <span
                        className={
                          h.adjustment >= 0
                            ? 'text-ok'
                            : 'text-danger'
                        }
                      >
                        (
                        {h.adjustment >= 0
                          ? '+'
                          : ''}
                        {h.adjustment})
                      </span>
                    </p>

                    {h.reason && (
                      <p className="text-[11px] text-muted mt-0.5">
                        {h.reason}
                      </p>
                    )}
                  </div>

                  <p className="text-[10px] text-muted whitespace-nowrap ml-2">
                    {formatDateTime(
                      h.created_at,
                    )}
                  </p>
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
