-- Apply AFTER 20261004000000_pos_billing.sql. No existing data or product columns change.
BEGIN;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty integer,
  ADD COLUMN IF NOT EXISTS price numeric(14,2),
  ADD COLUMN IF NOT EXISTS product_title_snapshot text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];

-- Same positive-price precedence as src/lib/pos.ts; malformed and zero values are skipped.
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

REVOKE ALL ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) TO authenticated;
COMMIT;
