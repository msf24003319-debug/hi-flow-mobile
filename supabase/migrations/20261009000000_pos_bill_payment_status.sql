-- Apply after 20261008000000_pos_document_workflows.sql, before deploying the payment UI.
-- The checkout transaction still checks stock after all order/status triggers run.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_status text
  CHECK (bill_status IN ('quotation','paid','partial','unpaid'));
-- Preserve existing workflow statuses and allow the payment statuses on text schemas.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) AS expression
    FROM pg_constraint WHERE conrelid='public.orders'::regclass AND contype='c'
    AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=conrelid AND attname='status' AND attnum=ANY(conkey)) LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I',c.conname);
    EXECUTE format('ALTER TABLE public.orders ADD CONSTRAINT %I CHECK ((%s) OR status IN (%L,%L,%L,%L))',
      c.conname,c.expression,'quotation','paid','partial','unpaid');
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text);
DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text,text,text,text);
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
  p_fulfillment_source text DEFAULT 'shop',
  p_bill_status text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_account_name_snapshot text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result uuid; cart jsonb; account_kind text; order_total numeric; order_net numeric; image_url text; stock_before jsonb; line record; stock_value integer; payment_status text; actual_paid numeric; actual_remaining numeric; account_name text;
BEGIN
  -- EXECUTE grants do not bypass authentication or the existing administrator RLS.
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Authenticated administrator required'; END IF;
  IF p_account_type IS NULL OR p_account_type NOT IN ('customer','shopkeeper') THEN RAISE EXCEPTION 'Invalid account type'; END IF;
  IF p_account_id IS NULL AND p_account_type<>'customer' THEN RAISE EXCEPTION 'Walk-in must use customer pricing'; END IF;
  IF p_account_id IS NOT NULL THEN
    SELECT type INTO account_kind FROM accounts WHERE id=p_account_id;
    IF NOT FOUND OR account_kind<>p_account_type THEN RAISE EXCEPTION 'Account not found or account type mismatch'; END IF;
  END IF;
  account_name := coalesce(nullif(btrim((SELECT name FROM accounts WHERE id=p_account_id)),''),'Walk-in Customer');
  IF account_name='Walk-in' THEN account_name := 'Walk-in Customer'; END IF;
  IF p_account_name_snapshot IS NOT NULL THEN
    p_account_name_snapshot := coalesce(nullif(btrim(p_account_name_snapshot),''),'Walk-in Customer');
    IF p_account_name_snapshot='Walk-in' THEN p_account_name_snapshot := 'Walk-in Customer'; END IF;
    IF p_account_name_snapshot<>account_name THEN
      RAISE EXCEPTION 'Selected account name changed. Refresh the POS before checkout';
    END IF;
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
      AND status IN ('quotation','paid','partial','unpaid','confirmed','completed') AND paid_amount IS NOT NULL) THEN
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
  actual_paid := CASE WHEN p_document_type='quotation' THEN 0 ELSE p_paid_amount END;
  IF actual_paid IS NULL OR actual_paid::text IN ('NaN','Infinity','-Infinity')
    OR actual_paid < 0 OR actual_paid > order_net OR actual_paid <> round(actual_paid,2) THEN
    RAISE EXCEPTION 'Paid amount must be between zero and the net total, with at most two decimal places';
  END IF;
  actual_remaining := greatest(0,order_net-actual_paid);
  IF p_document_type='invoice' AND p_remaining_amount IS NOT NULL AND (p_remaining_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_remaining_amount <> actual_remaining) THEN
    RAISE EXCEPTION 'Remaining amount does not match net total minus paid amount';
  END IF;
  payment_status := CASE WHEN p_document_type='quotation' THEN 'quotation'
    WHEN actual_remaining<=0 THEN 'paid' WHEN actual_paid>0 THEN 'partial' ELSE 'unpaid' END;
  IF (p_bill_status IS NOT NULL AND p_bill_status<>payment_status)
    OR (p_status IS NOT NULL AND p_status<>payment_status) THEN
    RAISE EXCEPTION 'Payment status does not match document and balance';
  END IF;
  -- A retry returns above before changing the saved payment snapshot.
  UPDATE orders SET paid_amount=actual_paid, remaining_amount=actual_remaining,
    bill_status=payment_status,status=payment_status,account_name_snapshot=account_name,
    customer_address=nullif(btrim(p_customer_address),'')
    WHERE id=result;
  FOREACH image_url IN ARRAY coalesce(p_image_urls,ARRAY[]::text[]) LOOP
    IF image_url IS NULL OR image_url !~ '^https://' OR position('/storage/v1/object/public/invoices/'||result::text||'/' in image_url)=0 THEN
      RAISE EXCEPTION 'Invalid invoice public URL';
    END IF;
    UPDATE orders SET image_urls=CASE WHEN image_url=ANY(coalesce(image_urls,ARRAY[]::text[])) THEN image_urls
      ELSE array_append(coalesce(image_urls,ARRAY[]::text[]),image_url) END WHERE id=result;
  END LOOP;
  PERFORM public.pos_apply_document_stock(result,stock_before,p_document_type='invoice');
  -- Verify values after every synchronous order/item/inventory trigger has run.
  IF NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=result
    AND o.account_id IS NOT DISTINCT FROM p_account_id
    AND o.account_type=p_account_type
    AND o.account_name_snapshot=account_name
    AND o.total_amount=order_total AND o.discount=p_discount AND o.net_amount=order_net
    AND o.total=order_net AND o.paid_amount=actual_paid AND o.remaining_amount=actual_remaining
    AND o.customer_address IS NOT DISTINCT FROM nullif(btrim(p_customer_address),'')
    AND o.document_type=p_document_type AND o.fulfillment_source=p_fulfillment_source
    AND o.payment_method=p_payment_method AND o.bill_status=payment_status AND o.status=payment_status) THEN
    RAISE EXCEPTION 'Saved checkout fields were changed by database logic. Transaction rolled back'
      USING HINT='Inspect deployed order triggers and checkout functions';
  END IF;
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
  IF bill.document_type='invoice' AND bill.status IN ('confirmed','paid','partial','unpaid') THEN RETURN p_order_id; END IF;
  IF bill.document_type<>'quotation' OR bill.status<>'quotation' THEN RAISE EXCEPTION 'Order is not a quotation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'Quotation contains no items'; END IF;
  FOR line IN SELECT product_id AS id,sum(qty) AS qty FROM order_items WHERE order_id=p_order_id GROUP BY product_id ORDER BY product_id LOOP
    SELECT stock_quantity INTO stock_value FROM products WHERE id=line.id FOR UPDATE;
    IF NOT FOUND OR stock_value IS NULL OR line.qty IS NULL OR line.qty<=0 THEN RAISE EXCEPTION 'Invalid quotation product or quantity'; END IF;
    IF stock_value<line.qty THEN RAISE EXCEPTION 'Insufficient stock for product %',line.id; END IF;
    stock_before := stock_before || jsonb_build_object(line.id::text,stock_value);
  END LOOP;
  UPDATE orders SET document_type='invoice',paid_amount=0,remaining_amount=coalesce(net_amount,total),
    bill_status=CASE WHEN coalesce(net_amount,total)<=0 THEN 'paid' ELSE 'unpaid' END,
    status=CASE WHEN coalesce(net_amount,total)<=0 THEN 'paid' ELSE 'unpaid' END,updated_at=now() WHERE id=p_order_id;
  PERFORM public.pos_apply_document_stock(p_order_id,stock_before,true);
  RETURN p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.pos_confirm_quotation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_confirm_quotation(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
