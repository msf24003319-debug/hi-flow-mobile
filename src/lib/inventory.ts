import { computeInventoryStatus, InventoryOverviewRow, InventorySummary } from '@/types/admin.types';

export type InventoryRow = InventoryOverviewRow & { available_quantity: number };
const number = (value: unknown, fallback = 0): number => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
export function normalizeInventory(row: InventoryOverviewRow): InventoryRow {
  const stock = number(row.stock_quantity ?? row.stock);
  const ordered = Math.max(0, number(row.ordered));
  const available = Math.max(0, stock - ordered);
  return { ...row, stock, stock_quantity: stock, ordered, available,
    available_quantity: available, low_stock_threshold: Math.max(0, number(row.low_stock_threshold, 10)),
    price: number(row.price), wholesale_price: number(row.wholesale_price) };
}
export const inventoryStatus = (row: InventoryOverviewRow) =>
  computeInventoryStatus(row.stock_quantity, row.low_stock_threshold ?? 10);
export function inventorySummary(rows: InventoryOverviewRow[]): InventorySummary {
  return rows.reduce<InventorySummary>((summary, row) => {
    const normalized = normalizeInventory(row);
    const status = inventoryStatus(normalized);
    summary.total_products++;
    if (status === 'in_stock') summary.in_stock_count++;
    else if (status === 'low_stock') summary.low_stock_count++;
    else summary.out_of_stock_count++;
    summary.total_inventory_value += Math.max(0, normalized.stock_quantity) * Math.max(0, normalized.price ?? 0);
    return summary;
  }, { total_products: 0, in_stock_count: 0, low_stock_count: 0, out_of_stock_count: 0, total_inventory_value: 0 });
}
