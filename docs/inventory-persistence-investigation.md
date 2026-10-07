# Inventory persistence investigation

## Confirmed observations (4 October 2026)

Read-only queries against the Supabase project configured in this application's
environment returned, for product `a63e6acf-7487-4ee3-b83a-ac69a1319de5`:

| Source | stock_quantity | stock | stock_qty | ordered | available_quantity |
| --- | --- | --- | --- | --- | --- |
| products | 20 | 20 | 100 | — | — |
| get_inventory_overview | 20 | 20 | — | 0 | 20 |

The products timestamp was `2026-10-04T11:21:36.621505+00:00`. The product had
no rows in `inventory_adjustments` in the service-role read. The live API exposes
`stock_qty`, `min_reorder_level`, `stock_quantity`, `low_stock_threshold`, and `stock`.
This confirms legacy/canonical data disagreement, but does not establish which
writer caused it. The overview agreed with canonical stock in the inspected read.

Historical definitions were found in the adjacent mobile project:
`F:/reactmobileapp/supabase/migrations/20260918000000_inventory_management.sql`,
`20260925000000_fix_product_rpc_drift_and_inventory_security.sql`, and
`20260926000000_fix_function_overload_collisions.sql`.
Those adjustment definitions lock/read/update `products.stock_quantity`, update
`stock_status`, insert adjustment history, enforce `is_admin()`, and return the
new integer quantity. They do not explicitly write `products.stock` or `stock_qty`.
The historical overview calculates `greatest(stock_quantity - ordered, 0)` for
non-cancelled orders, but its return signature differs from the live response.
These files are evidence about intended behavior, not proof of deployed behavior.

## Changes made

- Save lifecycle callbacks invalidate outstanding loads before the adjustment
  starts. Loads requested during a save are skipped; reconciliation starts after
  the modal's verification attempt finishes. Request generations prevent older
  responses or errors from applying to newer state.
- The modal reads canonical database stock before sending the adjustment. After
  a successful RPC it reads the product again and calls the overview. Canonical
  stock, the `stock` alias, overview stock, and computed availability must agree.
- An integer RPC result is checked against the post-save database value. When
  no integer result is returned, the fresh database baseline determines the
  expected adjustment result. A conflicting concurrent edit is reported rather
  than treated as a successful verification.
- The parent receives a complete verified row, including current ordered and
  available quantities. It never substitutes the modal's preview for saved stock.
- Once the RPC succeeds, a failed verification can only retry reads. It cannot
  replay the adjustment. Inputs are held until verification completes or the
  administrator closes the modal.
- Merge inconsistencies produce visible errors. There is no permanent local
  stock override or precedence rule that conceals database disagreement.
- Diagnostic console output covers old UI stock, request type/quantity, fresh
  baseline, RPC result, both database aliases, overview quantities, and merged row.

No database SQL was applied. No trigger, obsolete materialized view, RLS policy,
grant, order, cart, customer, or product-management page was changed. The shared
modal keeps its existing product-management callback compatible.

## Remaining blocker

The configured service key permits REST reads, but does not expose PostgreSQL
catalogs. The existing Supabase CLI login returned HTTP 403 when querying the
affected project's SQL endpoint. The deployed function and trigger definitions
are absent from the admin repository; historical mobile definitions cannot be
assumed to be current.

Run `supabase/inventory-diagnostics.sql` in the affected project's SQL Editor and
provide its result sets, or provide an authorized SQL connection. It is read-only
and retrieves the full adjustment/overview definitions, all products triggers
and their functions, other public stock writers, and the affected row/history.
Inspect those results before preparing a narrowly scoped database repair. Do not
recreate `trigger_refresh_inventory` or the obsolete materialized view.

## Validation

Automated regression coverage exercises actual modal handlers and inventory-page
callbacks with controlled Supabase responses. It covers Increase 20→30, Decrease
30→25, Set Exact 25→100, RPC-return concurrency, verification retries, older load
responses, source disagreement, availability, filters, and cards.

Live Increase/Decrease/Set, delayed persistence, full browser refresh, and modal
reopen acceptance remain **unverified**. No live inventory adjustment was issued
while the deployed RPC/trigger behavior was unknown. After inspecting/fixing the
SQL, test the user's sequence with an authenticated admin and compare products,
overview, adjustment history, the table, and reopened modal after every operation.
Repeat the reads after waiting and after a full browser refresh. A temporary UI
change or passing mocked test is not proof of database persistence.
