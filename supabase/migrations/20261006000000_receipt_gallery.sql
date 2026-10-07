-- Receipt mutations preserve other images under a row lock.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_append_invoice_image(p_order_id uuid, p_url text)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE urls text[];
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_url IS NULL OR p_url !~ '^https://' OR
    position('/storage/v1/object/public/invoices/' || p_order_id::text || '/' in p_url) = 0 THEN
    RAISE EXCEPTION 'Invalid invoice image URL';
  END IF;
  SELECT image_urls INTO urls FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  urls := coalesce(urls, ARRAY[]::text[]);
  IF NOT p_url = ANY(urls) THEN urls := array_append(urls, p_url); END IF;
  UPDATE public.orders SET image_urls = urls WHERE id = p_order_id;
  RETURN urls;
END;
$$;
CREATE OR REPLACE FUNCTION public.pos_remove_invoice_image(p_order_id uuid, p_url text)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE urls text[];
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_url IS NULL THEN RAISE EXCEPTION 'Receipt URL required'; END IF;
  SELECT image_urls INTO urls FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  urls := array_remove(coalesce(urls, ARRAY[]::text[]), p_url);
  UPDATE public.orders SET image_urls = urls WHERE id = p_order_id;
  RETURN urls;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_append_invoice_image(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_remove_invoice_image(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_append_invoice_image(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_remove_invoice_image(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
