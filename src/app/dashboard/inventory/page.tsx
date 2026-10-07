'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, Boxes, ShoppingBag, AlertTriangle, XCircle, PencilLine } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import {
  InventoryOverviewRow,
} from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InventoryAdjustModal } from '@/components/product/InventoryAdjustModal';
import { formatPKR, resolveProductName } from '@/lib/utils';
import { InventoryRow, inventoryStatus, inventorySummary } from '@/lib/inventory';
import { errorMessage } from '@/lib/pos';
import { InventorySavedUpdate, mergeInventoryRow } from '@/lib/inventory-persistence';

const KPI_CARDS = [
  { key: 'total_products', label: 'Total Products', icon: Package, tone: 'text-brand', money: false },
  { key: 'in_stock_count', label: 'In Stock Products', icon: Boxes, tone: 'text-info', money: false },
  {
    key: 'total_inventory_value',
    label: 'Inventory Value',
    icon: ShoppingBag,
    tone: 'text-brand',
    money: true,
  },
  { key: 'low_stock_count', label: 'Low Stock Products', icon: AlertTriangle, tone: 'text-warn', money: false },
  { key: 'out_of_stock_count', label: 'Out of Stock Products', icon: XCircle, tone: 'text-danger', money: false },
] as const;

type Filter = 'all' | 'low_stock' | 'out_of_stock';

export default function InventoryPage() {
  const [products, setProducts] = useState<InventoryRow[]>([]);
  // Cards always reflect every product, independent of the active filter.
  const summary = useMemo(() => inventorySummary(products), [products]);
  const loadGeneration = useRef(0);
  const saveInProgress = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryOverviewRow | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [rawOverviewDebug, setRawOverviewDebug] = useState<unknown>(null);

  const load = useCallback(async (background = false) => {
    if (saveInProgress.current) return;
    const generation = ++loadGeneration.current;
    if (!background) setLoading(true);
    setLoadError(null);
    try {
      async function loadProducts() {
        const products: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await supabase.from('products').select('*').order('id').range(from, from + 499);
          if (error) throw error;
          products.push(...(data ?? []));
          if (!data || data.length < 500) return products;
        }
      }
      const [overview, products] = await Promise.all([supabase.rpc('get_inventory_overview'), loadProducts()]);
      if (overview.error) throw overview.error;
      const raw = overview.data;
      if (!Array.isArray(raw) || raw.some(row => !row || typeof row.id !== 'string')) {
        if (generation === loadGeneration.current) setRawOverviewDebug(raw ?? {});
        throw new Error('Inventory overview did not return product rows. Existing quantities have been retained.');
      }
      const details = new Map(products.map(product => [String(product.id), product]));
      const merged = raw.map((row: InventoryOverviewRow) => {
        const product = details.get(row.id);
        return mergeInventoryRow(row, product);
      });
      if (generation === loadGeneration.current) { setProducts(merged); setRawOverviewDebug(null); }
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(errorMessage(error));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { ++loadGeneration.current; };
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'low_stock') {
      return products.filter(product =>
        product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold);
    }
    if (filter === 'out_of_stock') {
      return products.filter(product => product.stock_quantity <= 0);
    }
    return products;
  }, [products, filter]);

  const handleSaved = ({ productId, inventoryRow }: InventorySavedUpdate) => {
    // Invalidate older requests so they cannot undo the immediate saved-state update.
    ++loadGeneration.current;
    // This row has been read back from products and checked against the overview.
    setProducts(previous => previous.map(product => product.id === productId
      ? inventoryRow
      : product));
    setLoading(false);
    setEditing(null);
  };

  const handleSaveStart = () => {
    saveInProgress.current = true;
    ++loadGeneration.current;
  };

  const handleSaveFinished = () => {
    saveInProgress.current = false;
    // Preserve refreshing, but start it only after verification has completed.
    void load(true);
  };

  const columns: Column<InventoryRow>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-bg border border-border overflow-hidden shrink-0">
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt={resolveProductName(p)} className="object-cover w-full h-full" />
            )}
          </div>
          <div>
            <div className="text-white font-medium">{resolveProductName(p)}</div>
            <div className="text-[11px] text-muted font-mono">{p.sku || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (p) => (
        <div className="text-[11px]">
          <div className="text-white font-mono">{formatPKR(p.price)}</div>
          <div className="text-muted font-mono">whs. {formatPKR(p.wholesale_price)}</div>
        </div>
      ),
    },
    { key: 'unit', header: 'Unit', render: (p) => <span className="text-subtle">{p.unit}</span> },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => (
        <span className="text-white font-mono font-semibold">{p.stock_quantity}</span>
      ),
    },
    {
      key: 'ordered',
      header: 'Ordered',
      render: (p) => <span className="text-info font-mono">{p.ordered}</span>,
    },
    {
      key: 'available',
      header: 'Available',
      render: (p) => {
        const availableQty = p.available_quantity;
        return (
          <span className={`font-mono font-semibold ${availableQty <= 0 ? 'text-danger' : 'text-ok'}`}>
            {availableQty}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <StatusBadge
          status={inventoryStatus(p)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <button
          onClick={() => setEditing(p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 ml-auto"
        >
          <PencilLine className="h-3.5 w-3.5" />
          Edit Inventory
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Inventory</h1>
        <p className="text-xs text-subtle mt-1">
          Stock on hand, units ordered, and what&apos;s still available to sell — for every product.
        </p>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">{loadError}</div>
      )}

      {rawOverviewDebug != null && (
        <div className="bg-danger/10 border border-danger/40 rounded-lg p-4 text-xs text-danger space-y-2">
          <p className="font-bold">
            Backend bug detected at fetch time (before any table row was rendered or any button clicked):
            supabase.rpc(&apos;get_inventory_overview&apos;) returned summary/aggregate data instead of an array of
            per-product rows. This is the raw, unmodified RPC response — fix the SQL function on Supabase, this
            page cannot construct an id it was never sent.
          </p>
          <pre className="whitespace-pre-wrap break-all bg-bg/60 rounded p-2 text-[10px] max-h-40 overflow-y-auto custom-scrollbar">
            {JSON.stringify(rawOverviewDebug, null, 2)}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {KPI_CARDS.map((c) => {
          const Icon = c.icon;
          const value = summary ? summary[c.key] : null;
          return (
            <div key={c.key} className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-subtle font-medium">{c.label}</p>
                <p className="text-2xl font-black text-white mt-1">
                  {value == null ? '—' : c.money ? formatPKR(value) : value}
                </p>
              </div>
              <div className={`h-9 w-9 rounded-lg bg-bg border border-border flex items-center justify-center ${c.tone}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {(
          [
            ['all', 'All Products'],
            ['low_stock', 'Low Stock'],
            ['out_of_stock', 'Out of Stock'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              filter === key
                ? 'bg-brand/15 border-brand text-brand'
                : 'bg-surface border-border text-subtle hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        rowKey={(p) => p.id}
        searchable={(p) => `${resolveProductName(p)} ${p.name_en ?? ''} ${p.name_ur ?? ''} ${p.sku ?? ''}`}
        searchPlaceholder="Search products or SKU…"
        emptyText="No products match this filter."
      />

      {editing && (
        <InventoryAdjustModal product={editing} onClose={() => setEditing(null)} onSaved={handleSaved}
          onSaveStart={handleSaveStart} onSaveFinished={handleSaveFinished} />
      )}
    </div>
  );
}
