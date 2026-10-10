-- Read-only: inspect the reported invoice and deployed RPC return definitions.
SELECT jsonb_build_object(
  'order', (SELECT to_jsonb(o) FROM public.orders o
    WHERE id::text LIKE '39b9dee8%'),
  'item_count', (SELECT count(*) FROM public.order_items
    WHERE order_id::text LIKE '39b9dee8%'),
  'items', (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM public.order_items i
    WHERE order_id::text LIKE '39b9dee8%'),
  'checkout_functions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,
    'return_type',pg_get_function_result(p.oid),
    'definition',pg_get_functiondef(p.oid))), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.proname IN ('pos_complete_checkout','pos_checkout_document'))
) AS diagnostic;
