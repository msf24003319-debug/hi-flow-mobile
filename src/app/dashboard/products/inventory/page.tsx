'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Boxes, ShoppingBag, AlertTriangle, XCircle, PencilLine } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import {
  computeInventoryStatus,
  InventoryOverviewRow,
  InventorySummary,
} from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InventoryAdjustModal } from '@/components/product/InventoryAdjustModal';
import { formatPKR, resolveProductName } from '@/lib/utils';

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
  const [rows, setRows] = useState<InventoryOverviewRow[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryOverviewRow | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [rawOverviewDebug, setRawOverviewDebug] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [overview, summaryRes, namesRes] = await Promise.all([
      supabase.rpc('get_inventory_overview'),
      supabase.rpc('get_inventory_summary'),
      // get_inventory_overview() surfaces the drifted `name` column (empty for
      // several rows). Pull `title` straight from products so this screen shows
      // the same product name as /dashboard/products. Left join, no filters.
      supabase.from('products').select('id, title, name_ur'),
    ]);
    if (overview.error) setLoadError(overview.error.message);
    if (summaryRes.error) setLoadError((prev) => prev ?? summaryRes.error!.message);
    if (namesRes.error) setLoadError((prev) => prev ?? namesRes.error!.message);

    // Fetch-time shape check — runs the instant the RPC responds, long
    // before any row is rendered or any button exists to click. If
    // this fires, the bad shape came over the wire from Supabase
    // itself; nothing downstream in this component (rendering, click
    // handlers, setEditing) has run yet at this point.
    const rawOverview = overview.data;
    const firstItem = Array.isArray(rawOverview) ? rawOverview[0] : rawOverview;
    const looksLikeSummaryNotRows =
      firstItem && typeof firstItem === 'object' && 'total_products' in firstItem && !('id' in firstItem);
    if (looksLikeSummaryNotRows) {
      console.error(
        '[InventoryPage] get_inventory_overview() returned summary-shaped data instead of per-product rows. ' +
          'This is the raw RPC response, captured before any rendering or click handler ran:',
        rawOverview
      );
    }
    setRawOverviewDebug(looksLikeSummaryNotRows ? rawOverview : null);

    const nameById = new Map<string, { title?: string | null; name_ur?: string | null }>(
      (Array.isArray(namesRes.data) ? namesRes.data : []).map((r: any) => [
        r.id,
        { title: r.title, name_ur: r.name_ur },
      ]),
    );
    const mergedRows = (Array.isArray(rawOverview) ? rawOverview : []).map((r: any) => ({
      ...r,
      title: nameById.get(r.id)?.title ?? r.title ?? null,
      name_ur: nameById.get(r.id)?.name_ur ?? r.name_ur ?? undefined,
    }));
    setRows(mergedRows as InventoryOverviewRow[]);
    // get_inventory_summary() returns a single JSON object; older code treated
    // it as an array and read [0], which was always undefined -> all KPIs blank.
    const rawSummary = summaryRes.data;
    setSummary(
      (Array.isArray(rawSummary) ? rawSummary[0] : rawSummary) as InventorySummary ?? null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The live RPC returns `stock`/`stock_quantity`, `ordered` and `available`
  // (not `stock_qty`/`ordered_qty`/`available_qty`). Normalise every row to
  // guaranteed numbers so a missing/null field can't blank a cell or poison
  // a status/filter comparison.
  const normalize = (r: InventoryOverviewRow) => {
    const totalStock = r.stock_quantity ?? r.stock ?? 0;
    const orderedQty = r.ordered ?? 0;
    const availableQty = r.available ?? Math.max(0, totalStock - orderedQty);
    return { totalStock, orderedQty, availableQty };
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter(
      (r) => computeInventoryStatus(normalize(r).availableQty, r.low_stock_threshold ?? 0) === filter,
    );
  }, [rows, filter]);

  const columns: Column<InventoryOverviewRow>[] = [
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
        <span className="text-white font-mono font-semibold">{normalize(p).totalStock}</span>
      ),
    },
    {
      key: 'ordered',
      header: 'Ordered',
      render: (p) => <span className="text-info font-mono">{normalize(p).orderedQty}</span>,
    },
    {
      key: 'available',
      header: 'Available',
      render: (p) => {
        const { availableQty } = normalize(p);
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
          status={computeInventoryStatus(normalize(p).availableQty, p.low_stock_threshold ?? 0)}
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
        <InventoryAdjustModal product={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
