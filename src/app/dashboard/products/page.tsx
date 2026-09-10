'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Boxes } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Category, computeInventoryStatus, Product } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ProductForm } from '@/components/product/ProductForm';
import { InventoryAdjustModal } from '@/components/product/InventoryAdjustModal';
import { formatPKR, resolveProductName } from '@/lib/utils';

export default function ProductsPage() {
  const { data: products, loading, refetch } = useSupabaseData<Product>('products', {
    select: '*, product_prices(customer_price, wholesale_price)',
    order: { column: 'created_at', ascending: false },
  });
  const { data: categories, refetch: refetchCategories } = useSupabaseData<Category>('categories', {
    select: 'id, name, name_ur, parent_id, sort_order',
    order: { column: 'sort_order' },
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState<Product | null>(null);

  const remove = async (id: string) => {
    if (!confirm('Delete this product? Existing orders keep their recorded price.')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) alert(error.message);
    else refetch();
  };

  const columns: Column<Product>[] = [
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
            <div className="text-[11px] text-muted" dir="rtl">
              {p.name_ur}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'cat',
      header: 'Category',
      render: (p) => categories.find((c) => c.id === p.category_id)?.name ?? '—',
    },
    {
      key: 'customer_price',
      header: 'Customer Price',
      render: (p) => {
        const v = p.product_prices?.customer_price ?? 0;
        return (
          <span className={`font-mono ${v > 0 ? 'text-white' : 'text-warn'}`}>
            {formatPKR(v)}
            {v > 0 ? '' : ' ⚠'}
          </span>
        );
      },
    },
    {
      key: 'wholesale_price',
      header: 'Shopkeeper Wholesale Price',
      render: (p) => {
        const v = p.product_prices?.wholesale_price ?? 0;
        return (
          <span className={`font-mono ${v > 0 ? 'text-brand' : 'text-warn'}`}>
            {formatPKR(v)}
            {v > 0 ? '' : ' ⚠'}
          </span>
        );
      },
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => (
        <div>
          <span className="text-white font-mono font-semibold">
            {p.stock_quantity} {p.unit}
          </span>
          <div className="mt-1">
            <StatusBadge status={computeInventoryStatus(p.stock_quantity, p.low_stock_threshold)} />
          </div>
        </div>
      ),
    },
    {
      key: 'featured',
      header: 'Featured',
      // Render the boolean as text — React renders `false` as nothing, so a
      // bare {p.featured} would leave the cell blank for every non-featured row.
      render: (p) => (
        <span className={p.featured ? 'text-brand font-medium' : 'text-muted'}>
          {p.featured ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      // avg_rating/review_count default to 0 in the DB. Always show the number
      // (0.0 is a real value, not "no data") plus the review count in parens.
      render: (p) => {
        const avg = p.avg_rating != null ? Number(p.avg_rating) : 0;
        const count = p.review_count ?? 0;
        return (
          <span className={count > 0 ? 'text-white' : 'text-muted'}>
            {avg.toFixed(1)} ({count})
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setAdjustingStock(p)}
            title="Edit Inventory"
            className="p-1.5 text-subtle hover:text-brand hover:bg-brand/10 rounded-lg"
          >
            <Boxes className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setEditing(p);
              setFormOpen(true);
            }}
            title="Edit Product"
            className="p-1.5 text-subtle hover:text-white hover:bg-card rounded-lg"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => remove(p.id)}
            title="Delete Product"
            className="p-1.5 text-subtle hover:text-danger hover:bg-danger/10 rounded-lg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Products</h1>
          <p className="text-xs text-subtle mt-1">Manage the catalog, prices, stock and images.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg text-xs font-semibold"
        >
          <Plus className="h-4 w-4" /> New Product
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={products}
        loading={loading}
        rowKey={(p) => p.id}
        searchable={(p) => `${resolveProductName(p)} ${p.name_en ?? ''} ${p.name_ur ?? ''}`}
        searchPlaceholder="Search products…"
        emptyText="No products yet."
      />

      {formOpen && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={refetch}
          onCategoryAdded={refetchCategories}
        />
      )}

      {adjustingStock && (
        <InventoryAdjustModal
          product={adjustingStock}
          onClose={() => setAdjustingStock(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
