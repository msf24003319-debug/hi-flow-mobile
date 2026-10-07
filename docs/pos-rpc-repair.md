# Checkout RPC repair

## SQL

Run the complete `supabase/migrations/20261004020000_pos_complete_checkout.sql` script in Supabase SQL Editor. It repairs an existing admin schema without requiring the previous POS RPC migrations. It expects existing UUID IDs, `accounts(name,type)`, `profiles`, `orders(buyer_id,fulfillment_type,status,total)`, and the existing `is_admin()` helper. It uses only `ADD COLUMN IF NOT EXISTS` for tables, retains their policies and data, recreates only checkout-related functions, grants execution, and notifies PostgREST to reload its schema cache.

The `pos_complete_checkout` function has all eight requested parameters and defaults, plus an optional `p_request_id` defaulting to a generated UUID. The frontend supplies a stable UUID so retries reuse an invoice. The script removes old `pos_complete_checkout` overloads by explicit signature, without `CASCADE`; PostgreSQL will stop the transaction if a dependent object prevents removal. Existing product fields are untouched. Existing required item aliases are populated dynamically by the atomic RPC.

Execution is granted to `authenticated`, `anon`, and `service_role` as requested. The function remains `SECURITY INVOKER`, requires an authenticated administrator, and retains existing RLS. An execution grant alone does not authorize an anonymous checkout or a service client lacking a user session. Existing order policies must allow administrator reads, inserts and updates, and item policies must allow administrator reads/inserts. Additional required fields or incompatible existing constraints will produce explicit errors; this script does not relax them.

The receipt append RPC is also restored. The existing public `invoices` bucket and its upload policies are still required for image uploads. Checkout initializes `image_urls` as an empty array, and uploaded receipt public URLs are attached after the sale commits.

## Frontend

The complete component is `src/app/dashboard/pos/page.tsx`; its persistence helper is `src/lib/pos-checkout.ts`. Checkout uses the exact `pos_complete_checkout` argument names. A `PGRST202` missing-function response uses `orders.insert` followed by `order_items.insert`, then marks the order completed. A pending fallback invoice encountered after RPC installation is resumed through the same table path. Permission, validation, and other RPC errors do not trigger table inserts.

Direct inserts are separate requests and therefore cannot provide the RPC's atomic transaction. They create a pending order before recording line items. A failed request retains the invoice UUID and fixed cart in memory, allowing the retry button to resume rather than duplicate the sale. The helper verifies previously inserted line items and inserts only missing IDs. A failed line-item batch can populate known required legacy aliases and retry the batch. Generated aliases are omitted. Existing triggers still execute; test inventory behavior in staging.

Checkout always clears its busy lock in `finally` and shows both console errors and alert dialogs. The cart remains fixed while an ambiguous/partial invoice awaits confirmation, but Retry checkout stays enabled. A definitive PostgreSQL RPC error rolls back atomically and unlocks editing. If the page is reloaded during a partial fallback, review the pending invoice in Billing History before starting another sale; the retry snapshot is not persisted across reloads. Cross-tab concurrency and live database triggers require staging verification.

## Verification

Run `node --test tests/pos-pricing.test.cjs tests/pos-checkout.test.cjs`, `npx.cmd tsc --noEmit --incremental false`, and `npm.cmd run build` locally. In staging, apply the SQL twice, confirm the function is visible in the API, test walk-in/account sales, simulate failed item writes and retry, test permissions and receipts, and confirm existing records remain unchanged. No live SQL was executed by this change.
