import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryOverviewRow } from '@/types/admin.types';
import { InventoryRow, normalizeInventory } from '@/lib/inventory';

export interface InventorySavedUpdate {
  productId: string;
  stockQuantity: number;
  inventoryRow: InventoryRow;
}

export function mergeInventoryRow(
  overview: InventoryOverviewRow,
  product: Record<string, unknown> | undefined,
): InventoryRow {
  if (!product || String(product.id) !== overview.id) {
    throw new Error(`Product ${overview.id} was missing from the products read. Retry inventory loading.`);
  }
  const stock = Number(product.stock_quantity);
  if (product.stock_quantity == null || !Number.isSafeInteger(stock)) {
    throw new Error(`Product ${overview.id} has an invalid canonical stock_quantity.`);
  }
  if (product.stock == null || Number(product.stock) !== stock) {
    throw new Error(`Product ${overview.id}: products.stock_quantity (${stock}) and products.stock (${product.stock}) disagree. Check the inventory RPC and stock synchronization trigger.`);
  }
  if (overview.stock_quantity == null || Number(overview.stock_quantity) !== stock || Number(overview.stock) !== stock) {
    throw new Error(`Product ${overview.id}: products stock (${stock}) and inventory overview stock (${overview.stock_quantity}/${overview.stock}) disagree. Retry the read; if it persists, inspect the database functions.`);
  }
  const merged = normalizeInventory({
    ...overview,
    title: product.title as string | null | undefined ?? overview.title,
    name_ur: product.name_ur as string | undefined ?? overview.name_ur,
    image_url: product.image_url as string | undefined ?? overview.image_url,
    sku: product.sku as string | undefined ?? overview.sku,
    unit: product.unit as string | undefined ?? overview.unit,
    price: product.price as number | null | undefined ?? overview.price,
    wholesale_price: product.wholesale_price as number | null | undefined ?? overview.wholesale_price,
    stock_quantity: stock,
    low_stock_threshold: product.low_stock_threshold as number | undefined ?? overview.low_stock_threshold ?? 10,
  });
  const available = (overview as InventoryOverviewRow & { available_quantity?: unknown }).available_quantity ?? overview.available;
  if (available == null || Number(available) !== merged.available_quantity) {
    throw new Error(`Product ${overview.id}: overview availability (${available}) disagrees with stock minus ordered (${merged.available_quantity}). Inspect get_inventory_overview().`);
  }
  return merged;
}

// Reads only: safe to retry after an adjustment has already committed.
export async function verifySavedInventory(
  client: SupabaseClient,
  productId: string,
): Promise<InventorySavedUpdate> {
  const { data: product, error: productError } = await client.from('products')
    .select('*').eq('id', productId).single();
  if (productError) throw productError;
  const { data: overview, error: overviewError } = await client.rpc('get_inventory_overview');
  if (overviewError) throw overviewError;
  const row = Array.isArray(overview) ? overview.find(row => row?.id === productId) : null;
  console.debug('[inventory] post-save verification', {
    productId,
    databaseStockQuantity: product?.stock_quantity,
    databaseStock: product?.stock,
    overviewStockQuantity: row?.stock_quantity,
    overviewStock: row?.stock,
    overviewAvailableQuantity: row?.available_quantity ?? row?.available,
  });
  if (!row) throw new Error('Inventory overview did not return the saved product.');
  const inventoryRow = mergeInventoryRow(row, product);
  console.debug('[inventory] confirmed InventoryRow', inventoryRow);
  return { productId, stockQuantity: inventoryRow.stock_quantity, inventoryRow };
}
