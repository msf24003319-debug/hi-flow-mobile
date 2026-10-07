-- Standalone repair for the EXISTING admin schema; retains all table data and policies.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.products') IS NULL OR to_regclass('public.accounts') IS NULL
    OR to_regclass('public.orders') IS NULL OR to_regclass('public.order_items') IS NULL
    OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Existing products/accounts/orders/order_items and is_admin() are required';
  END IF;
END $$;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS account_name_snapshot text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS discount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty integer,
  ADD COLUMN IF NOT EXISTS price numeric(14,2),
  ADD COLUMN IF NOT EXISTS product_title_snapshot text;

CREATE OR REPLACE FUNCTION public.pos_resolve_price(p_product jsonb,p_prices jsonb,p_wholesale boolean)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE field text; source_row jsonb; raw text; value numeric; fields text[];
BEGIN
  fields := CASE WHEN p_wholesale THEN ARRAY['wholesale_price','customer_price','price','unit_price','sale_price']
    ELSE ARRAY['customer_price','price','unit_price','sale_price','wholesale_price'] END;
  FOREACH field IN ARRAY fields LOOP
    FOREACH source_row IN ARRAY ARRAY[p_product,p_prices] LOOP
      raw := btrim(source_row->>field);
      IF raw IS NULL OR raw !~ '^[+]?\d+(\.\d+)?$' THEN CONTINUE; END IF;
      BEGIN
        value := round(raw::numeric,2);
        IF value>0 AND value<=9007199254740991 THEN RETURN value; END IF;
      EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_request_id uuid, p_account_id uuid, p_items jsonb,
  p_discount numeric, p_payment_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  a public.accounts%ROWTYPE; item jsonb; product jsonb; prices jsonb;
  quantity integer; unit_price numeric; subtotal numeric := 0;
  lines jsonb := '[]'::jsonb; buyer uuid := auth.uid();
  item_columns text; item_values text;
BEGIN
  IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF buyer IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Authenticated user and request ID required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=buyer) THEN RAISE EXCEPTION 'Administrator profile is missing'; END IF;
  -- Retry the same checkout without recording a second sale.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  IF EXISTS (SELECT 1 FROM orders WHERE id=p_request_id AND invoice_number='POS-'||p_request_id::text) THEN
    RETURN p_request_id;
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>200 THEN
    RAISE EXCEPTION 'Cart must contain 1 to 200 items';
  END IF;
  IF p_discount IS NULL OR p_discount::text IN ('NaN','Infinity','-Infinity') OR p_discount<0 OR p_discount<>round(p_discount,2)
     OR p_payment_method IS NULL OR p_payment_method NOT IN ('cash','card','bank_transfer') THEN
    RAISE EXCEPTION 'Invalid discount or payment method';
  END IF;
  IF p_account_id IS NOT NULL THEN
    SELECT * INTO a FROM accounts WHERE id=p_account_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF (item->>'qty') IS NULL OR (item->>'qty') !~ '^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    quantity := (item->>'qty')::integer;
    SELECT to_jsonb(p) INTO product FROM products p WHERE p.id=(item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    prices := NULL;
    IF to_regclass('public.product_prices') IS NOT NULL THEN
      EXECUTE 'SELECT to_jsonb(pp) FROM public.product_prices pp WHERE product_id=$1'
        INTO prices USING (item->>'product_id')::uuid;
    END IF;
    unit_price := public.pos_resolve_price(product,prices,coalesce(a.type='shopkeeper',false));
    IF unit_price IS NULL THEN RAISE EXCEPTION 'Product % has no valid positive price', coalesce(product->>'title',product->>'id'); END IF;
    unit_price := round(unit_price,2);
    subtotal := subtotal + quantity*unit_price;
    lines := lines || jsonb_build_array(jsonb_build_object('product_id',product->>'id',
      'qty',quantity,'price',unit_price,'title',coalesce(product->>'title',product->>'name','Product')));
  END LOOP;
  IF subtotal<=0 THEN RAISE EXCEPTION 'Total amount must be greater than zero'; END IF;
  IF p_discount>subtotal THEN RAISE EXCEPTION 'Discount exceeds subtotal'; END IF;
  INSERT INTO orders(id,buyer_id,fulfillment_type,status,total,invoice_number,
    account_id,account_type,account_name_snapshot,total_amount,discount,net_amount,payment_method,image_urls)
  VALUES(p_request_id,buyer,'pickup','completed',subtotal-p_discount,'POS-'||p_request_id::text,
    p_account_id,coalesce(a.type,'customer'),coalesce(a.name,'Walk-in'),subtotal,p_discount,greatest(0,subtotal-p_discount),p_payment_method,ARRAY[]::text[]);
  -- Populate canonical legacy fields and any existing snapshot aliases together.
  -- Generated columns compute themselves and must not be explicitly inserted.
  SELECT string_agg(format('%I',attname),', ' ORDER BY attnum),
         string_agg(format('r.%I',attname),', ' ORDER BY attnum)
    INTO item_columns,item_values
    FROM pg_attribute
    WHERE attrelid='public.order_items'::regclass AND attnum>0 AND NOT attisdropped
      AND attgenerated='' AND attidentity=''
      AND attname=ANY(ARRAY['order_id','product_id','qty','quantity','price','unit_price',
        'total_price','product_title','product_title_snapshot','customer_note']);
  FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
    EXECUTE format('INSERT INTO public.order_items (%s) SELECT %s FROM jsonb_populate_record(NULL::public.order_items,$1) AS r',item_columns,item_values)
      USING jsonb_build_object('order_id',p_request_id,'product_id',item->>'product_id',
        'qty',(item->>'qty')::integer,'quantity',(item->>'qty')::integer,
        'price',(item->>'price')::numeric,'unit_price',(item->>'price')::numeric,
        'total_price',(item->>'price')::numeric*(item->>'qty')::integer,
        'product_title',item->>'title','product_title_snapshot',item->>'title','customer_note','');
  END LOOP;
  RETURN p_request_id;
END $$;

-- Remove only pos_complete_checkout overloads, without CASCADE or table changes.
-- Explicit signatures avoid ambiguity when older installations have overloads.
DO $$ DECLARE signature text; BEGIN
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pos_complete_checkout'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || signature;
  END LOOP;
END $$;

CREATE FUNCTION public.pos_complete_checkout(
  p_account_id uuid DEFAULT NULL,
  p_account_type text DEFAULT 'customer',
  p_total_amount numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_net_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_image_urls text[] DEFAULT '{}',
  p_cart jsonb DEFAULT '[]'::jsonb,
  p_request_id uuid DEFAULT gen_random_uuid()
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result uuid; cart jsonb; account_kind text; order_total numeric; order_net numeric; image_url text;
BEGIN
  -- EXECUTE grants do not bypass authentication or the existing administrator RLS.
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Authenticated administrator required'; END IF;
  IF p_account_type IS NULL OR p_account_type NOT IN ('customer','shopkeeper') THEN RAISE EXCEPTION 'Invalid account type'; END IF;
  IF p_account_id IS NULL AND p_account_type<>'customer' THEN RAISE EXCEPTION 'Walk-in must use customer pricing'; END IF;
  IF p_account_id IS NOT NULL THEN
    SELECT type INTO account_kind FROM accounts WHERE id=p_account_id;
    IF NOT FOUND OR account_kind<>p_account_type THEN RAISE EXCEPTION 'Account not found or account type mismatch'; END IF;
  END IF;
  IF p_total_amount IS NULL OR p_net_amount IS NULL
    OR p_total_amount::text IN ('NaN','Infinity','-Infinity') OR p_net_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_total_amount<0 OR p_net_amount<0 THEN RAISE EXCEPTION 'Invalid total amounts'; END IF;
  IF jsonb_typeof(p_cart) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Cart must be an array'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',coalesce(value->>'product_id',value->>'id'),
    'qty',coalesce(value->>'qty',value->>'quantity'))),'[]'::jsonb) INTO cart FROM jsonb_array_elements(p_cart);
  IF EXISTS (SELECT 1 FROM orders WHERE id=p_request_id AND invoice_number='POS-'||p_request_id::text AND status<>'completed') THEN
    RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='Resume the pending table-insert checkout';
  END IF;
  result := public.pos_checkout(p_request_id,p_account_id,cart,p_discount,p_payment_method);
  SELECT total_amount,net_amount INTO order_total,order_net FROM orders WHERE id=result;
  -- Default zero totals let server-side prices be authoritative; supplied totals must agree.
  IF p_total_amount>0 AND (round(p_total_amount,2)<>order_total OR round(p_net_amount,2)<>order_net) THEN
    RAISE EXCEPTION 'Product prices changed. Reload the POS and review totals before retrying';
  END IF;
  FOREACH image_url IN ARRAY coalesce(p_image_urls,ARRAY[]::text[]) LOOP
    IF image_url IS NULL OR image_url !~ '^https://' OR position('/storage/v1/object/public/invoices/'||result::text||'/' in image_url)=0 THEN
      RAISE EXCEPTION 'Invalid invoice public URL';
    END IF;
    UPDATE orders SET image_urls=CASE WHEN image_url=ANY(coalesce(image_urls,ARRAY[]::text[])) THEN image_urls
      ELSE array_append(coalesce(image_urls,ARRAY[]::text[]),image_url) END WHERE id=result;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) TO authenticated, anon, service_role;
REVOKE ALL ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) TO authenticated, anon, service_role;
REVOKE ALL ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid) TO authenticated, anon, service_role;
CREATE OR REPLACE FUNCTION public.pos_append_invoice_image(p_order_id uuid,p_url text)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $
DECLARE urls text[];
BEGIN
  IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_url IS NULL OR p_url !~ '^https://' OR position('/storage/v1/object/public/invoices/'||p_order_id::text||'/' in p_url)=0 THEN
    RAISE EXCEPTION 'Invalid invoice image URL';
  END IF;
  SELECT image_urls INTO urls FROM orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  urls := coalesce(urls,ARRAY[]::text[]);
  IF NOT p_url=ANY(urls) THEN urls := array_append(urls,p_url); END IF;
  UPDATE orders SET image_urls=urls WHERE id=p_order_id;
  RETURN urls;
END $;
REVOKE ALL ON FUNCTION public.pos_append_invoice_image(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_append_invoice_image(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
