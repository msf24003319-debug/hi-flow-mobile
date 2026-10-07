# POS and billing integration

## 1. Review and apply the additive SQL

Run `supabase/migrations/20261004000000_pos_billing.sql`, followed by `supabase/migrations/20261004010000_pos_checkout_fix.sql`, in the Supabase SQL Editor on a staging copy first. If the initial migration is already installed, apply only the checkout fix. Both scripts are transactional and repeatable. They do not rename, drop, replace, backfill, or change the types of existing tables/columns. They add POS columns to existing orders and a name snapshot to existing order items. No product fields or prices are modified.

The repository has no prior migration files or live schema export. The implementation follows the current TypeScript types and queries:

- `products.id` is UUID and `products.title` is the product label.
- Prices use direct product fields and, when available, `product_prices(*)`. Customers prefer `customer_price`, `price`, `unit_price`, `sale_price`, then `wholesale_price`; shopkeepers prefer `wholesale_price`, `customer_price`, `price`, `unit_price`, then `sale_price`. For each field, the direct value precedes the joined value. Numeric strings are accepted; null, blank, malformed, nonfinite, negative and zero placeholders are skipped. Products without a positive price cannot be sold. The checkout RPC uses the same precedence.
- Existing orders use `buyer_id` referencing `profiles`, `fulfillment_type`, `status`, and `total`; existing items use `qty` and `price`. These names are retained. The checkout fix also fills existing writable aliases `quantity`, `unit_price`, `total_price`, and `product_title` when present, while excluding generated columns. It adds canonical `qty`/`price` columns only if missing; it does not backfill historical rows on deployments that previously used only aliases.
- `public.is_admin()` exists, and existing orders/items RLS permits administrator reads, inserts, and order updates. Existing grants, policies, constraints, and triggers stay in place; review them in staging. The script adds RLS only for newly created tables.
- Existing order constraints must accept `pickup` and `completed`. Additional required columns without defaults or triggers with additional requirements will reject checkout and roll the transaction back. Do not relax these constraints to force this migration through; extend the POS insert with the appropriate existing fields after reviewing the live schema.

New accounts are billing contacts independent of the existing customer/shopkeeper verification records. Create accounts from the POS buyer panel. `balance` starts at zero; this implementation records paid sales and does not implement credit balances or supplier procurement.

For legacy compatibility, POS orders retain `buyer_id=auth.uid()` (the administrator recording the sale). The billing buyer is preserved separately in `account_id`, `account_type`, and `account_name_snapshot`. Consequently, the existing fulfilment page may show an unknown buyer for these orders; Billing History shows the actual billing contact. No fake authentication profiles are created. Product names and item prices are snapshotted for POS transactions; older orders use existing item prices and their current product label.

The `invoices` bucket is created as public with a 10 MB image limit, public read, and administrator-only uploads scoped to existing order IDs. An existing private bucket causes the migration to abort rather than silently changing its visibility. Existing bucket configuration and other storage policies are retained; inspect them for broader permissions. Receipt URLs are public as requested.

## 2. Storage helper

`src/lib/storage.ts` adds `uploadInvoiceImage(file, orderId)` alongside the existing helpers. It validates JPEG/PNG/WebP files, generates unique order-scoped paths, and uploads without overwriting. Existing product/service/CNIC helpers are preserved.

`src/lib/pos.ts` contains shared pricing and error utilities and `attachInvoiceImage`, which calls a row-locked append RPC. Concurrent receipt attachments preserve both URLs. If a history attachment fails after upload, use its retry button to link the same uploaded object.

## 3. POS page

`src/app/dashboard/pos/page.tsx` loads all products and billing accounts in batches, searches `title`, recalculates numeric unit/line totals when the buyer changes, and validates quantities and discounts. Displayed net totals clamp at zero; discounts above subtotal are rejected on checkout. The checkout button stays clickable for validation errors, which show both inline and in an alert. Checkout catches/logs failures and always releases its busy state, including UUID/auth failures. The checkout RPC computes prices independently, inserts the order and all items atomically, explicitly initializes `image_urls` as an empty text array, and uses a request UUID to make retries of the same checkout idempotent. The saved invoice is authoritative if prices change after the page loads.

The optional receipt is uploaded after the sale commits. A receipt error clearly reports that the sale succeeded and directs the administrator to attach it through history. Storage and database writes cannot share a transaction; an upload whose database attachment fails can leave an unlinked storage object. Existing inventory triggers remain active; the module does not introduce additional stock deductions or stock constraints.

## 4. History page

`src/app/dashboard/history/page.tsx` lists POS and legacy orders, with buyer/type, subtotal/net amount, date, and attachment counts. Its modal fetches historical line items, displays recorded prices and quantities, previews receipt thumbnails, opens full images, and supports additional attachments. Both pages are linked from the existing sidebar.

## 5. Validate in staging

1. Apply the migration twice and confirm existing orders, product fields, policies, and triggers remain unchanged.
2. Sign in as an admin with a `profiles` row. Check a walk-in sale and customer account sale against customer pricing. Select a shopkeeper and check wholesale pricing, including a product without a wholesale price.
3. Check multi-item totals, discount limits, string prices and fallback fields, zero-placeholder products, unavailable prices, and invalid quantities. Verify an empty cart alerts, a discount above subtotal never displays a negative net total, and a rejected item or existing trigger failure leaves no partial order or items. Retry the same RPC request ID and verify only one sale exists.
4. Confirm older orders appear in history. Change a product title/price after a POS sale and confirm its snapshot and recorded prices remain unchanged.
5. Upload a receipt at checkout and another through history. Attach two images concurrently and verify neither is lost. Simulate an attachment failure, retry, and verify no duplicate sale is created.
6. Verify unauthenticated/non-admin clients cannot invoke either RPC or upload receipts, while public receipt URLs open as configured. Confirm inventory behavior against existing triggers before production use.

Local checks: `node --test tests/pos-pricing.test.cjs`, `npx.cmd tsc --noEmit --incremental false` and `npm.cmd run build`. Live database/storage checks require applying the migrations to a Supabase staging database; they have not been executed by this change.
