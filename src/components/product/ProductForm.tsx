'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { uploadProductImage } from '@/lib/storage';
import { resolveProductName } from '@/lib/utils';
import { productSchema } from '@/validators/product.schema';
import { Category, Product } from '@/types/admin.types';
import { Modal } from '@/components/ui/Modal';
import { MultilingualInput } from '@/components/ui/MultilingualInput';
import { AddCategoryModal } from '@/components/product/AddCategoryModal';

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  /** Optional: notify the parent so its own categories list can refetch. */
  onCategoryAdded?: () => void;
}

type FormState = {
  name_en: string;
  name_ur: string;
  category_id: string;
  description_en: string;
  description_ur: string;
  specifications_en: string;
  specifications_ur: string;
  image_url: string;
  customer_price: number;
  wholesale_price: number;
  stock_status: 'available' | 'out_of_stock';
  featured: boolean;
  sku: string;
  unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
};

const empty: FormState = {
  name_en: '',
  name_ur: '',
  category_id: '',
  description_en: '',
  description_ur: '',
  specifications_en: '',
  specifications_ur: '',
  image_url: '',
  customer_price: 0,
  wholesale_price: 0,
  stock_status: 'available',
  featured: false,
  sku: '',
  unit: 'pcs',
  stock_quantity: 0,
  low_stock_threshold: 5,
};

export function ProductForm({ product, categories, onClose, onSaved, onCategoryAdded }: ProductFormProps) {
  const [form, setForm] = useState<FormState>(empty);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Local copy of the category list so a category added from inside this form
  // shows up in the dropdown immediately, without waiting for a page refresh.
  const [categoryList, setCategoryList] = useState<Category[]>(categories);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  useEffect(() => setCategoryList(categories), [categories]);

  const onCategoryCreated = (cat: Category) => {
    setCategoryList((prev) =>
      [...prev.filter((c) => c.id !== cat.id), cat].sort(
        (a, b) => a.sort_order - b.sort_order || (a.name ?? '').localeCompare(b.name ?? ''),
      ),
    );
    set({ category_id: cat.id });
    setAddCategoryOpen(false);
    onCategoryAdded?.();
  };

  useEffect(() => {
    if (product) {
      setForm({
        // The catalog + inventory screens display `title` (see
        // resolveProductName / migration drift notes on the Product type), so
        // seed the English-name field from the same resolved value the rest of
        // the admin shows — not the raw, often-misaligned `name_en` column.
        name_en: (() => {
          const resolved = resolveProductName(product);
          return resolved === '—' ? '' : resolved;
        })(),
        name_ur: product.name_ur,
        category_id: product.category_id ?? '',
        description_en: product.description_en ?? '',
        description_ur: product.description_ur ?? '',
        specifications_en: product.specifications_en ?? '',
        specifications_ur: product.specifications_ur ?? '',
        image_url: product.image_url,
        customer_price: product.product_prices?.customer_price ?? 0,
        wholesale_price: product.product_prices?.wholesale_price ?? 0,
        // Some live rows still carry a stray legacy 'in_stock' value that
        // predates the two-value stock_status enum (see migration
        // 20260925000000) — normalize it here so opening Edit Product on
        // one of those rows doesn't fail schema validation on save. This
        // field isn't actually written back for existing products (see the
        // update() call below), so the normalized value is display-only.
        stock_status: product.stock_status === 'out_of_stock' ? 'out_of_stock' : 'available',
        featured: product.featured,
        sku: product.sku ?? '',
        unit: product.unit ?? 'pcs',
        stock_quantity: product.stock_quantity ?? 0,
        low_stock_threshold: product.low_stock_threshold ?? 5,
      });
    } else {
      setForm(empty);
    }
  }, [product]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadProductImage(file, product?.image_url);
      set({ image_url: url });
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const parsed = productSchema.safeParse({
      ...form,
      customer_price: Number(form.customer_price),
      wholesale_price: Number(form.wholesale_price),
      stock_quantity: Number(form.stock_quantity),
      low_stock_threshold: Number(form.low_stock_threshold),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    // New products only: stock_quantity is whatever the admin typed into
    // Opening Stock, defaulting to 0 — nothing before this stopped a
    // rushed save from publishing a product with 0 stock, which then
    // fails at checkout with "insufficient stock". Editing an existing
    // product is exempt: its stock_quantity is a read-only display of
    // real on-hand stock (see the update() call below), which can be
    // legitimately 0 for a sold-out item and must stay editable.
    if (!product && parsed.data.stock_quantity <= 0) {
      setError('Enter an opening stock quantity greater than 0 so this product can be ordered right away. Use Edit Inventory afterward if you need to zero it out.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { customer_price, wholesale_price, stock_quantity, stock_status, sku, ...productFields } =
        parsed.data;
      // category_id is required by productSchema (a valid UUID, never '' or
      // null) — productFields.category_id is spread through as-is so every
      // insert/update payload explicitly carries a real category.
      // The live `products` table has three drifted English-name columns
      // (`title`, `name_en`, `name`). `title` is the one every admin screen
      // reads for display (resolveProductName), so it MUST be written or an
      // edit appears to do nothing. Keep all three in sync from the single
      // English-name field so they stop drifting further.
      const englishName = productFields.name_en.trim();
      const productPayload: Record<string, unknown> = {
        ...productFields,
        title: englishName,
        name_en: englishName,
        name: englishName,
        sku: sku || null,
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let productId = product?.id;

      if (productId) {
        // stock_quantity/stock_status are intentionally excluded here —
        // stock is only ever changed via the Edit Inventory action,
        // which logs an auditable adjustment. Editing the product form
        // must never silently move stock.
        // .select() forces PostgREST to return the updated row(s). Without it
        // an update that matches nothing (wrong id, or an RLS policy that
        // silently filters the row) returns { data: null, error: null } — a
        // "successful" no-op that looks exactly like the bug reported here.
        const { data: updated, error } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', productId)
          .select();
        if (error) {
          console.error('[ProductForm] product update failed:', error);
          throw error;
        }
        if (!updated || updated.length === 0) {
          console.error(
            '[ProductForm] product update affected 0 rows — id or RLS mismatch:',
            productId,
          );
          throw new Error(
            'Save did not update any row. The product may have been deleted, or you may not have permission to edit it.',
          );
        }
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({
            ...productPayload,
            stock_quantity,
            stock_status: stock_quantity > 0 ? 'available' : 'out_of_stock',
          })
          .select('id')
          .single();
        if (error) {
          console.error('[ProductForm] product insert failed:', error);
          throw error;
        }
        productId = data.id;
      }

      const prevCustomer = product?.product_prices?.customer_price;
      const prevWholesale = product?.product_prices?.wholesale_price;

      const { error: priceError } = await supabase
        .from('product_prices')
        .upsert({ product_id: productId, customer_price, wholesale_price });
      if (priceError) {
        console.error('[ProductForm] product_prices upsert failed:', priceError);
        throw priceError;
      }

      // Log price history only for values that actually changed.
      const historyRows: Array<Record<string, unknown>> = [];
      if (prevCustomer !== undefined && prevCustomer !== customer_price) {
        historyRows.push({
          product_id: productId,
          price_type: 'customer',
          old_price: prevCustomer,
          new_price: customer_price,
          changed_by: user?.id,
        });
      }
      if (prevWholesale !== undefined && prevWholesale !== wholesale_price) {
        historyRows.push({
          product_id: productId,
          price_type: 'wholesale',
          old_price: prevWholesale,
          new_price: wholesale_price,
          changed_by: user?.id,
        });
      }
      if (historyRows.length) {
        await supabase.from('product_price_history').insert(historyRows);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('[ProductForm] save failed:', err);
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      wide
      open
      onClose={onClose}
      title={product ? 'Edit Product' : 'New Product'}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Product'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
        )}

        <MultilingualInput
          label="Product Name"
          required
          valueEn={form.name_en}
          valueUr={form.name_ur}
          onChangeEn={(v) => set({ name_en: v })}
          onChangeUr={(v) => set({ name_ur: v })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-subtle">
                Category <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                onClick={() => setAddCategoryOpen(true)}
                className="flex items-center gap-1 text-[11px] text-brand hover:underline"
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </div>
            <select
              value={form.category_id}
              onChange={(e) => set({ category_id: e.target.value })}
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option
                value=""
                className="bg-[#1e1e1e] text-white py-1.5 px-2"
                style={{ backgroundColor: '#1e1e1e', color: '#ffffff' }}
              >
                — select a category —
              </option>
              {categoryList.map((c) => (
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
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Customer Price (PKR)</label>
            <input
              type="number"
              min={0}
              value={form.customer_price}
              onChange={(e) => set({ customer_price: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">
              Shopkeeper Wholesale Price (PKR)
            </label>
            <input
              type="number"
              min={0}
              value={form.wholesale_price}
              onChange={(e) => set({ wholesale_price: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Unit</label>
            <input
              value={form.unit}
              onChange={(e) => set({ unit: e.target.value })}
              placeholder="pcs, box, meter…"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">SKU / Product Code</label>
            <input
              value={form.sku}
              onChange={(e) => set({ sku: e.target.value })}
              placeholder="e.g. HF-2HP-001"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Low Stock Threshold</label>
            <input
              type="number"
              min={0}
              value={form.low_stock_threshold}
              onChange={(e) => set({ low_stock_threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="text-[10px] text-muted mt-1">Below this available quantity, the product shows as Low Stock.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">
              {product ? 'Current Stock' : 'Opening Stock'}
            </label>
            {product ? (
              <>
                <div className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-subtle">
                  <span className="font-mono text-white">
                    {form.stock_quantity} {form.unit || 'pcs'}
                  </span>
                </div>
                <p className="text-[10px] text-muted mt-1">
                  Use <span className="text-brand font-semibold">Edit Inventory</span> to change stock.
                </p>
              </>
            ) : (
              <>
                <input
                  type="number"
                  min={0}
                  value={form.stock_quantity}
                  onChange={(e) => set({ stock_quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <p className="text-[10px] text-muted mt-1">
                  How many you actually have on hand. 0 means customers can&apos;t order it yet.
                </p>
              </>
            )}
          </div>
        </div>

        <MultilingualInput
          label="Description"
          multiline
          valueEn={form.description_en}
          valueUr={form.description_ur}
          onChangeEn={(v) => set({ description_en: v })}
          onChangeUr={(v) => set({ description_ur: v })}
        />
        <MultilingualInput
          label="Specifications"
          multiline
          valueEn={form.specifications_en}
          valueUr={form.specifications_ur}
          onChangeEn={(v) => set({ specifications_en: v })}
          onChangeUr={(v) => set({ specifications_ur: v })}
        />

        <div>
          <label className="block text-xs font-medium text-subtle mb-1">Product Image</label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg bg-bg border border-border overflow-hidden flex items-center justify-center">
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="product" className="object-cover w-full h-full" />
              ) : (
                <span className="text-[10px] text-muted">none</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-subtle rounded-lg text-xs disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Uploading…' : 'Upload / Replace'}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-subtle">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set({ featured: e.target.checked })}
          />
          Feature on Home (e.g. Multi Stage Turbine variants)
        </label>
      </div>
    </Modal>

    {addCategoryOpen && (
      <AddCategoryModal
        nextSortOrder={categoryList.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1}
        onClose={() => setAddCategoryOpen(false)}
        onCreated={onCategoryCreated}
      />
    )}
    </>
  );
}
