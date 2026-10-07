-- Read-only: run in the affected project's SQL Editor and return all result sets.
-- No functions, triggers, policies, tables, or data are changed by this script.

SELECT p.oid::regprocedure AS function_signature,
       pg_get_functiondef(p.oid) AS complete_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_adjust_inventory', 'get_inventory_overview',
                   'refresh_inventory_overview', 'product_available_qty');

SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS trigger_definition,
       p.oid::regprocedure AS trigger_function,
       pg_get_functiondef(p.oid) AS complete_trigger_function
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.products'::regclass AND NOT t.tgisinternal;

-- Include other public functions that reference stock aliases. This identifies
-- callers/writers before deciding whether any legacy column needs changing.
SELECT p.oid::regprocedure AS function_signature,
       pg_get_functiondef(p.oid) AS complete_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND p.prosrc ~ '\m(stock_qty|stock_quantity|min_reorder_level)\M';

SELECT id, title, stock_quantity, stock, stock_qty,
       low_stock_threshold, min_reorder_level, updated_at
FROM public.products
WHERE id = 'a63e6acf-7487-4ee3-b83a-ac69a1319de5';

SELECT * FROM public.get_inventory_overview()
WHERE id = 'a63e6acf-7487-4ee3-b83a-ac69a1319de5';

SELECT * FROM public.inventory_adjustments
WHERE product_id = 'a63e6acf-7487-4ee3-b83a-ac69a1319de5'
ORDER BY created_at DESC LIMIT 10;
