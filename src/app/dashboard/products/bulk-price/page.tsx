'use client';

import { useMemo, useState } from 'react';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Category, Product } from '@/types/admin.types';
import { BulkPriceTable } from '@/components/product/BulkPriceTable';

export default function CategoryPricePage() {
  const { data: categories } = useSupabaseData<Category>('categories', {
    select: 'id, name, name_ur, parent_id, sort_order',
    order: { column: 'sort_order' },
  });
  const { data: products, refetch } = useSupabaseData<Product>('products', {
    select: '*, product_prices(customer_price, wholesale_price)',
    order: { column: 'name_en' },
  });

  const [categoryId, setCategoryId] = useState<string>('');

  const inCategory = useMemo(
    () => products.filter((p) => p.category_id === categoryId),
    [products, categoryId]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Category Price Edit</h1>
        <p className="text-xs text-subtle mt-1">
          Update every price in a category on one screen. Each change is logged to price history and
          applies to new orders only.
        </p>
      </div>

      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-brand"
      >
        <option
          value=""
          className="bg-[#1e1e1e] text-white py-1.5 px-2"
          style={{ backgroundColor: '#1e1e1e', color: '#ffffff' }}
        >
          — choose a category —
        </option>
        {categories.map((c) => (
          <option
            key={c.id}
            value={c.id}
            className="bg-[#1e1e1e] text-white py-1.5 px-2"
            style={{ backgroundColor: '#1e1e1e', color: '#ffffff' }}
          >
            {c.name || c.name_ur || `Category (${c.id.slice(0, 6)})`}
          </option>
        ))}
      </select>

      {categoryId ? (
        inCategory.length ? (
          <BulkPriceTable key={categoryId} products={inCategory} onSaved={refetch} />
        ) : (
          <p className="text-xs text-muted">No products in this category.</p>
        )
      ) : null}
    </div>
  );
}
