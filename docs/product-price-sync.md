# Product price synchronization

Apply `supabase/migrations/20261005000000_product_price_sync.sql` to the affected Supabase project before deploying the frontend changes. The migration runs in a transaction and expects the existing products, product_prices, product_price_history, is_admin(), and admin_adjust_inventory(uuid, text, integer, text) schema used by this application.

The migration repairs existing products.price and products.wholesale_price from product_prices. This intentionally treats previously saved category prices as the source for the repair. It retains the inventory overview and stock RPC definitions. A product_prices trigger also synchronizes legacy ProductForm saves into products.

Category saves call admin_update_product_prices with all changed rows in one transaction. Prices and history either all commit or all roll back. History uses locked database prices and the authenticated admin identity rather than browser-supplied old prices or user IDs.

Inventory edits call admin_update_inventory_and_prices. A null adjustment type skips stock changes for price-only saves. Combined changes wrap the existing stock RPC and price RPC in one transaction. The modal reads back products and the overview before reporting success; retrying verification never replays the committed mutation.

After applying, change a category price and verify products, product_prices, and get_inventory_overview() return the same prices. Test a price-only inventory edit and a combined stock/price edit. Confirm price history records only changed prices and a price-only edit creates no stock adjustment. Verify access is rejected for non-admin users. Existing completed order prices are not modified.

Local verification: npx.cmd tsc --noEmit and node --test tests/*.test.cjs. Database execution requires the affected Supabase project; local modal tests use mocked RPC responses and do not validate the deployed database functions.
