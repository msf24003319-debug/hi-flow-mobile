-- Additive only. Run in Supabase SQL Editor after reviewing the live schema.
-- Existing order constraints, triggers and policies are deliberately retained.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.products') IS NULL OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Expected existing products table and is_admin() helper';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('customer', 'shopkeeper')),
  phone text, email text, balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
IF to_regclass('public.orders') IS NULL THEN
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id),
  fulfillment_type text NOT NULL DEFAULT 'pickup',
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_orders_admin ON public.orders FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
END IF;
END $$;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS account_type text CHECK (account_type IN ('customer', 'shopkeeper')),
  ADD COLUMN IF NOT EXISTS account_name_snapshot text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS discount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];
CREATE UNIQUE INDEX IF NOT EXISTS pos_orders_invoice_number_idx ON public.orders(invoice_number);
DO $$ BEGIN
IF to_regclass('public.order_items') IS NULL THEN
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty > 0),
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  customer_note text DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_order_items_admin ON public.order_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT ON public.order_items TO authenticated;
END IF;
END $$;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_title_snapshot text;
CREATE INDEX IF NOT EXISTS pos_order_items_order_idx ON public.order_items(order_id);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
-- Do not change RLS settings or policies on existing orders/order_items.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts' AND policyname='pos_accounts_admin') THEN
    CREATE POLICY pos_accounts_admin ON public.accounts FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;
GRANT SELECT, INSERT ON public.accounts TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Verify rather than silently modifying an existing bucket's configuration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='invoices' AND public) THEN
    RAISE EXCEPTION 'Existing invoices bucket is private; review configuration before enabling public receipts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pos_invoices_public_read') THEN
    CREATE POLICY pos_invoices_public_read ON storage.objects FOR SELECT TO public USING (bucket_id='invoices');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pos_invoices_admin_upload') THEN
    CREATE POLICY pos_invoices_admin_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id='invoices' AND public.is_admin()
        AND EXISTS (SELECT 1 FROM public.orders WHERE id::text=(storage.foldername(name))[1]));
  END IF;
END $$;

-- SECURITY INVOKER: existing table RLS, constraints and triggers still apply.
CREATE OR REPLACE FUNCTION public.pos_checkout(
  p_request_id uuid, p_account_id uuid, p_items jsonb,
  p_discount numeric, p_payment_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  a public.accounts%ROWTYPE; item jsonb; product jsonb; prices jsonb;
  quantity integer; unit_price numeric; subtotal numeric := 0;
  lines jsonb := '[]'::jsonb; buyer uuid := auth.uid();
BEGIN
  IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  -- Retry the same checkout without recording a second sale.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  IF EXISTS (SELECT 1 FROM orders WHERE id=p_request_id AND invoice_number='POS-'||p_request_id::text) THEN
    RETURN p_request_id;
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>200 THEN
    RAISE EXCEPTION 'Cart must contain 1 to 200 items';
  END IF;
  IF p_discount IS NULL OR p_discount<0 OR p_discount<>round(p_discount,2)
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
    unit_price := coalesce((product->>'customer_price')::numeric,(prices->>'customer_price')::numeric);
    IF a.type='shopkeeper' THEN
      unit_price := coalesce((product->>'wholesale_price')::numeric,(prices->>'wholesale_price')::numeric,unit_price);
    END IF;
    IF unit_price IS NULL OR unit_price<0 OR unit_price::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Product has no valid price';
    END IF;
    unit_price := round(unit_price,2);
    subtotal := subtotal + quantity*unit_price;
    lines := lines || jsonb_build_array(jsonb_build_object('product_id',product->>'id',
      'qty',quantity,'price',unit_price,'title',coalesce(product->>'title',product->>'name','Product')));
  END LOOP;
  IF p_discount>subtotal THEN RAISE EXCEPTION 'Discount exceeds subtotal'; END IF;
  INSERT INTO orders(id,buyer_id,fulfillment_type,status,total,invoice_number,
    account_id,account_type,account_name_snapshot,total_amount,discount,net_amount,payment_method)
  VALUES(p_request_id,buyer,'pickup','completed',subtotal-p_discount,'POS-'||p_request_id::text,
    p_account_id,coalesce(a.type,'customer'),coalesce(a.name,'Walk-in'),subtotal,p_discount,subtotal-p_discount,p_payment_method);
  INSERT INTO order_items(order_id,product_id,qty,price,product_title_snapshot)
    SELECT p_request_id,(value->>'product_id')::uuid,(value->>'qty')::integer,
      (value->>'price')::numeric,value->>'title' FROM jsonb_array_elements(lines);
  RETURN p_request_id;
END $$;

CREATE OR REPLACE FUNCTION public.pos_append_invoice_image(p_order_id uuid,p_url text)
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_append_invoice_image(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_checkout(uuid,uuid,jsonb,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_append_invoice_image(uuid,text) TO authenticated;
COMMIT;
