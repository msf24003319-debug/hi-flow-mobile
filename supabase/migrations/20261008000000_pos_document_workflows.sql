-- Apply after 20261007000000_pos_payment_address.sql, before deploying the UI.
-- Existing stock triggers are retained. Unexpected trigger deductions abort atomically.
BEGIN;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'invoice' CHECK (document_type IN ('invoice','quotation')),
  ADD COLUMN IF NOT EXISTS fulfillment_source text NOT NULL DEFAULT 'shop' CHECK (fulfillment_source IN ('shop','factory'));
-- Preserve existing status checks while permitting quotation records (text status schemas).
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, pg_get_expr(conbin,conrelid) AS expression
    FROM pg_constraint WHERE conrelid='public.orders'::regclass AND contype='c'
    AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=conrelid AND attname='status' AND attnum=ANY(conkey)) LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I',c.conname);
    EXECUTE format('ALTER TABLE public.orders ADD CONSTRAINT %I CHECK ((%s) OR status = %L)',c.conname,c.expression,'quotation');
  END LOOP;
END $$;

-- Define the pricing dependency here for databases missing the earlier checkout repair.
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

-- Reconcile only recognized trigger behavior: no deduction, or exactly one deduction.
-- Never overwrite an unexpected adjustment; roll back the complete transaction instead.
CREATE OR REPLACE FUNCTION public.pos_apply_document_stock(p_order_id uuid,p_before jsonb,p_deduct boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE line record; before_qty integer; current_qty integer; target_qty integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  FOR line IN SELECT product_id AS id,sum(qty) AS qty FROM order_items WHERE order_id=p_order_id GROUP BY product_id ORDER BY product_id LOOP
    before_qty := (p_before->>line.id::text)::integer;
    SELECT stock_quantity INTO current_qty FROM products WHERE id=line.id FOR UPDATE;
    IF NOT FOUND OR before_qty IS NULL THEN RAISE EXCEPTION 'Missing stock snapshot'; END IF;
    target_qty := before_qty - CASE WHEN p_deduct THEN line.qty ELSE 0 END;
    IF target_qty<0 THEN RAISE EXCEPTION 'Insufficient stock for product %',line.id; END IF;
    IF current_qty=target_qty THEN CONTINUE; END IF;
    IF p_deduct AND current_qty=before_qty THEN
      UPDATE products SET stock_quantity=target_qty,updated_at=now() WHERE id=line.id;
      SELECT stock_quantity INTO current_qty FROM products WHERE id=line.id;
      IF current_qty IS DISTINCT FROM target_qty THEN RAISE EXCEPTION 'Inventory update did not persist for product %',line.id; END IF;
    ELSE
      RAISE EXCEPTION 'Existing inventory trigger is incompatible with document workflows for product %. Transaction rolled back',line.id
        USING DETAIL = format('stock_before=%s, stock_after_triggers=%s, expected_stock=%s, order_quantity=%s, deduct=%s',
          before_qty,current_qty,target_qty,line.qty,p_deduct),
        HINT = 'Run supabase/pos-document-inventory-diagnostics.sql to inspect the deployed triggers before changing inventory logic';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pos_checkout_document(
  p_request_id uuid, p_account_id uuid, p_items jsonb,
  p_discount numeric, p_payment_method text, p_document_type text, p_fulfillment_source text
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
    account_id,account_type,account_name_snapshot,total_amount,discount,net_amount,payment_method,image_urls,document_type,fulfillment_source)
  VALUES(p_request_id,buyer,'pickup',CASE WHEN p_document_type='quotation' THEN 'quotation' ELSE 'confirmed' END,subtotal-p_discount,'POS-'||p_request_id::text,
    p_account_id,coalesce(a.type,'customer'),coalesce(a.name,'Walk-in Customer'),subtotal,p_discount,greatest(0,subtotal-p_discount),p_payment_method,ARRAY[]::text[],p_document_type,p_fulfillment_source);
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


DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text);
DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text);
CREATE FUNCTION public.pos_complete_checkout(
  p_account_id uuid DEFAULT NULL,
  p_account_type text DEFAULT 'customer',
  p_total_amount numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_net_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_image_urls text[] DEFAULT '{}',
  p_cart jsonb DEFAULT '[]'::jsonb,
  p_request_id uuid DEFAULT gen_random_uuid(),
  p_paid_amount numeric DEFAULT 0,
  p_remaining_amount numeric DEFAULT NULL,
  p_customer_address text DEFAULT NULL,
  p_document_type text DEFAULT 'invoice',
  p_fulfillment_source text DEFAULT 'shop'
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result uuid; cart jsonb; account_kind text; order_total numeric; order_net numeric; image_url text; stock_before jsonb; line record; stock_value integer;
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
  IF p_document_type IS NULL OR p_document_type NOT IN ('invoice','quotation')
    OR p_fulfillment_source IS NULL OR p_fulfillment_source NOT IN ('shop','factory') THEN
    RAISE EXCEPTION 'Invalid document type or fulfillment source';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  IF EXISTS (SELECT 1 FROM orders WHERE id=p_request_id) THEN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id=p_request_id AND invoice_number='POS-'||p_request_id::text
      AND status IN ('quotation','confirmed','completed') AND paid_amount IS NOT NULL) THEN
      RAISE EXCEPTION 'Existing checkout is incomplete or belongs to another order. Review Billing History';
    END IF;
    RETURN p_request_id;
  END IF;
  stock_before := '{}'::jsonb;
  -- Lock each distinct product in a stable order; aggregate duplicate cart lines.
  FOR line IN SELECT (value->>'product_id')::uuid AS id, sum((value->>'qty')::integer) AS qty
    FROM jsonb_array_elements(cart) GROUP BY 1 ORDER BY 1 LOOP
    SELECT stock_quantity INTO stock_value FROM products WHERE id=line.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF stock_value IS NULL OR line.qty IS NULL OR line.qty<=0 THEN RAISE EXCEPTION 'Invalid stock or quantity'; END IF;
    IF p_document_type='invoice' AND stock_value<line.qty THEN RAISE EXCEPTION 'Insufficient stock for product %',line.id; END IF;
    stock_before := stock_before || jsonb_build_object(line.id::text,stock_value);
  END LOOP;
  result := public.pos_checkout_document(p_request_id,p_account_id,cart,p_discount,p_payment_method,p_document_type,p_fulfillment_source);
  SELECT total_amount,net_amount INTO order_total,order_net FROM orders WHERE id=result;
  -- Default zero totals let server-side prices be authoritative; supplied totals must agree.
  IF p_total_amount>0 AND (round(p_total_amount,2)<>order_total OR round(p_net_amount,2)<>order_net) THEN
    RAISE EXCEPTION 'Product prices changed. Reload the POS and review totals before retrying';
  END IF;
  IF p_paid_amount IS NULL OR p_paid_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_paid_amount < 0 OR p_paid_amount > order_net OR p_paid_amount <> round(p_paid_amount,2) THEN
    RAISE EXCEPTION 'Paid amount must be between zero and the net total, with at most two decimal places';
  END IF;
  IF p_remaining_amount IS NOT NULL AND (p_remaining_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_remaining_amount <> order_net - p_paid_amount) THEN
    RAISE EXCEPTION 'Remaining amount does not match net total minus paid amount';
  END IF;
  -- Preserve the original payment snapshot when retrying an already saved invoice.
  UPDATE orders SET paid_amount=p_paid_amount, remaining_amount=order_net-p_paid_amount,
    customer_address=nullif(btrim(p_customer_address),'')
    WHERE id=result AND paid_amount IS NULL;
  FOREACH image_url IN ARRAY coalesce(p_image_urls,ARRAY[]::text[]) LOOP
    IF image_url IS NULL OR image_url !~ '^https://' OR position('/storage/v1/object/public/invoices/'||result::text||'/' in image_url)=0 THEN
      RAISE EXCEPTION 'Invalid invoice public URL';
    END IF;
    UPDATE orders SET image_urls=CASE WHEN image_url=ANY(coalesce(image_urls,ARRAY[]::text[])) THEN image_urls
      ELSE array_append(coalesce(image_urls,ARRAY[]::text[]),image_url) END WHERE id=result;
  END LOOP;
  PERFORM public.pos_apply_document_stock(result,stock_before,p_document_type='invoice');
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.pos_confirm_quotation(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE bill public.orders%ROWTYPE; line record; stock_value integer; stock_before jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO bill FROM orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found'; END IF;
  -- Row lock makes repeated or concurrent conversions deduct exactly once.
  IF bill.document_type='invoice' AND bill.status='confirmed' THEN RETURN p_order_id; END IF;
  IF bill.document_type<>'quotation' OR bill.status<>'quotation' THEN RAISE EXCEPTION 'Order is not a quotation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'Quotation contains no items'; END IF;
  FOR line IN SELECT product_id AS id,sum(qty) AS qty FROM order_items WHERE order_id=p_order_id GROUP BY product_id ORDER BY product_id LOOP
    SELECT stock_quantity INTO stock_value FROM products WHERE id=line.id FOR UPDATE;
    IF NOT FOUND OR stock_value IS NULL OR line.qty IS NULL OR line.qty<=0 THEN RAISE EXCEPTION 'Invalid quotation product or quantity'; END IF;
    IF stock_value<line.qty THEN RAISE EXCEPTION 'Insufficient stock for product %',line.id; END IF;
    stock_before := stock_before || jsonb_build_object(line.id::text,stock_value);
  END LOOP;
  UPDATE orders SET document_type='invoice',status='confirmed',updated_at=now() WHERE id=p_order_id;
  PERFORM public.pos_apply_document_stock(p_order_id,stock_before,true);
  RETURN p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_resolve_price(jsonb,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.pos_apply_document_stock(uuid,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_checkout_document(uuid,uuid,jsonb,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_confirm_quotation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_apply_document_stock(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_checkout_document(uuid,uuid,jsonb,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_confirm_quotation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
