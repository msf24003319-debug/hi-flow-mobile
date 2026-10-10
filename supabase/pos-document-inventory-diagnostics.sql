-- Read-only. Run in Supabase SQL Editor and return the diagnostic JSON.
-- Captures deployed stock logic without changing orders, inventory, or triggers.
SELECT jsonb_build_object(
  'product', (SELECT to_jsonb(p) FROM public.products p
    WHERE p.id='c957413b-0cb5-4b96-8e18-f702a8180bac'::uuid),
  'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table', t.tgrelid::regclass::text, 'name', t.tgname,
    'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid),
    'function', p.oid::regprocedure::text, 'function_definition', pg_get_functiondef(p.oid)
  ) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid IN ('public.products'::regclass,'public.orders'::regclass,'public.order_items'::regclass)
      AND NOT t.tgisinternal),
  'inventory_functions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)
  ) ORDER BY p.proname),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND (p.proname IN ('admin_adjust_inventory','get_inventory_overview','product_available_qty')
        OR (p.prosrc ~ '\m(stock_qty|stock_quantity)\M' AND p.proname NOT LIKE 'pos_%')))
) AS diagnostic;
