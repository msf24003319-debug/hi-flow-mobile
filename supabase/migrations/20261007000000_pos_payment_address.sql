-- Apply after the existing POS migrations. Existing invoices retain unknown payment values.
BEGIN;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS remaining_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS customer_address text;
DROP FUNCTION IF EXISTS public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid);
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
  p_customer_address text DEFAULT NULL
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
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_complete_checkout(uuid,text,numeric,numeric,numeric,text,text[],jsonb,uuid,numeric,numeric,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
