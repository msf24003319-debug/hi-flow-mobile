import { supabase } from './supabase-client';

export interface Account {
  id: string; name: string; type: 'customer' | 'shopkeeper';
  phone: string | null; email: string | null; balance: number;
}
export type PriceValue = number | string | null;
interface PriceFields {
  customer_price?: PriceValue; wholesale_price?: PriceValue;
  price?: PriceValue; unit_price?: PriceValue; sale_price?: PriceValue;
}
export interface PosProduct extends PriceFields {
  id: string; title: string | null;
  product_prices?: PriceFields | PriceFields[] | null;
}
export function positivePrice(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER && money(parsed) > 0 ? money(parsed) : null;
}
export function priceFor(product: PosProduct, wholesale: boolean): number | null {
  const joined = Array.isArray(product.product_prices) ? product.product_prices[0] : product.product_prices;
  const fields = wholesale
    ? ['wholesale_price', 'customer_price', 'price', 'unit_price', 'sale_price'] as const
    : ['customer_price', 'price', 'unit_price', 'sale_price', 'wholesale_price'] as const;
  for (const field of fields) {
    // Skip null, blank, malformed and zero placeholders rather than selling at Rs 0.
    for (const value of [product[field], joined?.[field]]) {
      const parsed = positivePrice(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}
export function normalizeProduct(product: PosProduct): PosProduct {
  return { ...product, customer_price: priceFor(product, false), wholesale_price: priceFor(product, true) };
}
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function cartTotals(items: { total_price: number }[], discount: string | number) {
  const subtotal = money(items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0));
  const reduction = Number(discount);
  return { subtotal, netTotal: money(Math.max(0, subtotal - (Number.isFinite(reduction) ? Math.max(0, reduction) : 0))) };
}
export const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Operation failed.';

/** Row-locked RPC prevents concurrent attachments overwriting one another. */
export async function attachInvoiceImage(orderId: string, url: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('pos_append_invoice_image', { p_order_id: orderId, p_url: url });
  if (error) throw error;
  return data as string[];
}

/** Remove one receipt under the same row lock used for concurrent appends. */
export async function removeInvoiceImage(orderId: string, url: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('pos_remove_invoice_image', { p_order_id: orderId, p_url: url });
  if (error) throw error;
  return data as string[];
}
