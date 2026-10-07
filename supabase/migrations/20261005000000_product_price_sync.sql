-- Apply before deploying the updated category editor and inventory modal.
-- Existing product_prices values repair prices previously saved by the category editor.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_product_prices_to_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products SET price = NEW.customer_price,
    wholesale_price = NEW.wholesale_price, updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_product_prices_to_products() FROM PUBLIC;
DROP TRIGGER IF EXISTS sync_product_prices_to_products ON public.product_prices;
CREATE TRIGGER sync_product_prices_to_products
AFTER INSERT OR UPDATE OF customer_price, wholesale_price ON public.product_prices
FOR EACH ROW EXECUTE FUNCTION public.sync_product_prices_to_products();

UPDATE public.products p SET price = pp.customer_price,
  wholesale_price = pp.wholesale_price, updated_at = now()
FROM public.product_prices pp WHERE pp.product_id = p.id
  AND (p.price IS DISTINCT FROM pp.customer_price
    OR p.wholesale_price IS DISTINCT FROM pp.wholesale_price);

CREATE OR REPLACE FUNCTION public.admin_update_product_prices(p_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item jsonb;
  product_id_value uuid;
  customer numeric;
  wholesale numeric;
  previous_customer numeric;
  previous_wholesale numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected a price update array';
  END IF;
  IF jsonb_array_length(p_updates) = 0 THEN
    RAISE EXCEPTION 'Expected a nonempty price update array';
  END IF;
  -- Stable lock order avoids deadlocks across overlapping category saves.
  FOR item IN SELECT value FROM jsonb_array_elements(p_updates) ORDER BY value->>'product_id' LOOP
    product_id_value := (item->>'product_id')::uuid;
    customer := (item->>'customer_price')::numeric;
    wholesale := (item->>'wholesale_price')::numeric;
    IF customer IS NULL OR wholesale IS NULL OR customer < 0 OR wholesale < 0
      OR customer::text IN ('NaN', 'Infinity', '-Infinity')
      OR wholesale::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Prices must be finite nonnegative numbers';
    END IF;
    SELECT price, wholesale_price INTO previous_customer, previous_wholesale
      FROM public.products WHERE id = product_id_value FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % does not exist', product_id_value; END IF;

    INSERT INTO public.product_prices(product_id, customer_price, wholesale_price)
      VALUES (product_id_value, customer, wholesale)
      ON CONFLICT (product_id) DO UPDATE SET customer_price = EXCLUDED.customer_price,
        wholesale_price = EXCLUDED.wholesale_price;
    -- Write explicitly as well: products is the canonical source for inventory.
    UPDATE public.products SET price = customer, wholesale_price = wholesale, updated_at = now()
      WHERE id = product_id_value;
    IF previous_customer IS DISTINCT FROM customer THEN
      INSERT INTO public.product_price_history(product_id, price_type, old_price, new_price, changed_by)
        VALUES (product_id_value, 'customer', coalesce(previous_customer, 0), customer, auth.uid());
    END IF;
    IF previous_wholesale IS DISTINCT FROM wholesale THEN
      INSERT INTO public.product_price_history(product_id, price_type, old_price, new_price, changed_by)
        VALUES (product_id_value, 'wholesale', coalesce(previous_wholesale, 0), wholesale, auth.uid());
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_product_prices(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_product_prices(jsonb) TO authenticated;

-- Wrap the existing stock RPC so stock, prices and history commit or roll back together.
-- A null adjustment type allows a price-only edit without an inventory history entry.
CREATE OR REPLACE FUNCTION public.admin_update_inventory_and_prices(
  p_product_id uuid, p_adjustment_type text, p_quantity integer, p_reason text,
  p_customer_price numeric, p_wholesale_price numeric
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved_stock integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  SELECT stock_quantity INTO saved_stock FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product does not exist'; END IF;
  IF p_adjustment_type IS NOT NULL THEN
    IF p_adjustment_type NOT IN ('increase', 'decrease', 'set')
      OR p_quantity IS NULL OR p_quantity < 0
      OR (p_adjustment_type <> 'set' AND p_quantity = 0) THEN
      RAISE EXCEPTION 'Invalid stock adjustment';
    END IF;
    PERFORM public.admin_adjust_inventory(p_product_id, p_adjustment_type, p_quantity, p_reason);
  END IF;
  IF p_customer_price IS NOT NULL OR p_wholesale_price IS NOT NULL THEN
    PERFORM public.admin_update_product_prices(jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id, 'customer_price', p_customer_price,
      'wholesale_price', p_wholesale_price)));
  END IF;
  SELECT stock_quantity INTO saved_stock FROM public.products WHERE id = p_product_id;
  RETURN saved_stock;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_inventory_and_prices(uuid,text,integer,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_inventory_and_prices(uuid,text,integer,text,numeric,numeric) TO authenticated;
COMMIT;
