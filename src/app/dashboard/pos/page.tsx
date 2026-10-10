'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { uploadInvoiceImage } from '@/lib/storage';
import { Account, PosProduct, normalizeProduct, priceFor, money, cartTotals, errorMessage, attachInvoiceImage } from '@/lib/pos';
import { formatPKR } from '@/lib/utils';
import { CheckoutSnapshot, completeCheckout } from '@/lib/pos-checkout';
import { checkoutPayment } from '@/lib/order-payment';
import { verifySavedCheckout } from '@/lib/checkout-verification';

const input = 'w-full min-w-0 rounded-lg border border-border bg-bg p-2 text-xs text-white';

export default function PosPage() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('');
  const [document_type, setDocumentType] = useState<'invoice' | 'quotation'>('invoice');
  const [fulfillment_source, setFulfillmentSource] = useState<'shop' | 'factory'>('shop');
  const [payment, setPayment] = useState('cash');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<CheckoutSnapshot | null>(null);
  const checkoutSnapshot = useRef<CheckoutSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<Account['type']>('customer');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountAddress, setAccountAddress] = useState('');
  const requestId = useRef<string | null>(null);
  const lock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // Page through all rows: Supabase defaults to a maximum of 1,000 per request.
        async function rows(table: string, select: string) {
          const result: unknown[] = [];
          for (let from = 0; ; from += 500) {
            const { data, error } = await supabase.from(table).select(select).order('id').range(from, from + 499);
            if (error) throw error;
            result.push(...(data ?? []));
            if (!data || data.length < 500) return result;
          }
        }
        async function loadProducts() {
          try { return await rows('products', '*, product_prices(*)'); }
          catch (e) {
            // Support deployments with direct price columns and no pricing relationship.
            if (!e || typeof e !== 'object' || !('code' in e) || !['PGRST200', 'PGRST205', '42P01'].includes(String(e.code))) throw e;
            return rows('products', '*');
          }
        }
        const [p, a] = await Promise.all([loadProducts(), rows('accounts', '*')]);
        if (active) { setProducts((p as PosProduct[]).map(normalizeProduct)); setAccounts(a as Account[]); }
      } catch (e) { if (active) setError(errorMessage(e)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const account = accounts.find(a => a.id === accountId);
  const wholesale = account?.type === 'shopkeeper';
  const lines = Object.entries(cart).map(([id, qty]) => {
    const product = products.find(p => p.id === id)!;
    const raw = priceFor(product, wholesale);
    const unit_price = raw === null ? null : money(raw);
    return { product, qty, price: unit_price, unit_price, total_price: money((unit_price ?? 0) * qty) };
  });
  const { subtotal, netTotal } = cartTotals(lines, discount);
  const reduction = Number(discount);
  const { paid, remaining: remainingAmount, status: billStatus } = checkoutPayment(document_type, netTotal, paidAmount);
  const validationError = lines.length === 0 ? 'Add at least one product before completing the sale.'
    : !Number.isFinite(subtotal) || subtotal <= 0 ? 'Total amount must be a valid amount greater than zero.'
    : lines.some(l => l.unit_price === null || l.unit_price <= 0 || !Number.isFinite(l.total_price)) ? 'Every product must have a valid price greater than zero.'
    : lines.some(l => !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 999999) ? 'Quantities must be whole numbers from 1 to 999999.'
    : lines.length > 200 ? 'A sale can contain at most 200 different products.'
    : discount.trim() === '' || !Number.isFinite(reduction) || reduction < 0 || reduction > subtotal || money(reduction) !== reduction ? 'Discount must be between zero and the subtotal, with at most two decimal places.'
    : !Number.isFinite(paid) || paid < 0 || paid > netTotal || money(paid) !== paid ? 'Paid amount must be between zero and the net total, with at most two decimal places.'
    : accountId && !account ? 'Selected billing account is unavailable. Select the account again.' : '';
  const changeCart = (id: string, qty: number) => {
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty > 999999) { setError('Enter a whole-number quantity up to 999999.'); return; }
    const product = products.find(p => p.id === id);
    if (qty > 0 && (!product || priceFor(product, wholesale) === null)) {
      setError('This product has no valid sale price. Update its price before adding it.'); return;
    }
    requestId.current = null;
    setCart(old => { const next = { ...old }; if (qty <= 0) delete next[id]; else next[id] = qty; return next; });
  };

  async function createAccount() {
    if (lock.current || !accountName.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { data, error } = await supabase.from('accounts').insert({ name: accountName.trim(), type: accountType,
        phone: accountPhone.trim() || null, email: accountEmail.trim() || null, address: accountAddress.trim() || null }).select('*').single();
      if (error) throw error;
      setAccounts(old => [...old, data as Account]); setAccountId(data.id); setAccountName('');
      setAccountPhone(''); setAccountEmail(''); setAccountAddress(''); requestId.current = null;
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }

  async function handleCompleteSale() {
    if (lock.current) return;
    if (!checkoutSnapshot.current && validationError) { setError(validationError); window.alert(validationError); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      // UUID creation and auth failures must also release the checkout lock.
      const id = requestId.current ?? crypto.randomUUID();
      requestId.current = id;
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError?.name === 'AuthSessionMissingError' || authError?.code === 'refresh_token_not_found' || authError?.code === 'refresh_token_already_used') {
        throw new Error('Your session has expired. Sign in again before checkout.');
      }
      if (authError) throw authError;
      if (!auth.user) throw new Error('Your session has expired. Sign in again before checkout.');
      if (!checkoutSnapshot.current) {
        checkoutSnapshot.current = {
          document_type,
          fulfillment_source,
          id,
          buyerId: auth.user.id,
          accountId: accountId || null,
          accountType: account?.type ?? 'customer',
          accountName: account?.name || 'Walk-in Customer',
          subtotal,
          discount: reduction,
          net: netTotal,
          payment,
          paid_amount: paid,
          remaining_amount: remainingAmount,
          bill_status: billStatus,
          status: billStatus,
          customer_address: account?.address?.trim() || null,
          items: lines.map(l => ({ id: crypto.randomUUID(), product_id: l.product.id, qty: l.qty,
            price: l.unit_price!, product_title_snapshot: l.product.title ?? 'Product' })),
        };
        setPendingCheckout(checkoutSnapshot.current);
      }
      if (checkoutSnapshot.current.buyerId !== auth.user.id) throw new Error('Sign in as the administrator who started this invoice.');
      const orderId = await completeCheckout(checkoutSnapshot.current);
      await verifySavedCheckout(checkoutSnapshot.current);
      setMessage(`${checkoutSnapshot.current.document_type === 'quotation' ? 'Quotation' : 'Confirmed bill'} POS-${orderId} saved.`);
      // The sale is committed first. A receipt failure must never prompt another sale.
      if (receipt) {
        try {
          const url = await uploadInvoiceImage(receipt, orderId);
          await attachInvoiceImage(orderId, url);
        } catch (e) {
          console.error('Receipt attachment failed after sale was saved:', e);
          setError(`Sale saved, but receipt attachment failed: ${errorMessage(e)}. Attach it from Billing History.`);
        }
      }
      setCart({}); setDiscount('0'); setPaidAmount(''); setReceipt(null); requestId.current = null;
      checkoutSnapshot.current = null; setPendingCheckout(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (e) {
      console.error('Checkout failed:', {
        message: e && typeof e === 'object' && 'message' in e ? e.message : String(e),
        details: e && typeof e === 'object' && 'details' in e ? e.details : null,
        error: e,
      });
      if (e && typeof e === 'object' && 'canEdit' in e && e.canEdit === true) {
        checkoutSnapshot.current = null; setPendingCheckout(null); requestId.current = null;
      }
      const detail = errorMessage(e);
      const text = `${detail === 'Operation failed.' ? 'Checkout failed' : detail}${checkoutSnapshot.current ? ` Invoice POS-${checkoutSnapshot.current.id} may be pending. Retry this checkout to resume it; review Billing History before starting another sale.` : ''}`;
      setError(text); window.alert(text);
    }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">POS Terminal</h1><p className="text-subtle text-sm">Customer and shopkeeper billing</p></div>
    {error && <p role="alert" className="text-danger whitespace-pre-line">{error}{error.startsWith('Your session has expired.') && <> <Link href="/login" className="underline">Sign in</Link></>}</p>}
    {message && <p role="status" className="text-brand break-all">{message} <Link href="/dashboard/history" className="underline">View history</Link></p>}
    <fieldset disabled={busy || loading || !!pendingCheckout} className="grid min-w-0 grid-cols-[1.1fr_0.9fr] gap-2 disabled:opacity-70">
      <section className="min-w-0 space-y-2 text-xs">
        <label className="block">Search products by title<input className={input} value={search} onChange={e => setSearch(e.target.value)} /></label>
        {loading ? <p>Loading products and accounts...</p> : <div className="max-h-[65vh] overflow-y-auto space-y-2">
          {products.filter(p => (p.title ?? '').toLowerCase().includes(search.toLowerCase())).map(p => {
            const price = priceFor(p, wholesale);
            return <button key={p.id} disabled={price === null || lines.length >= 200 && !cart[p.id]} onClick={() => changeCart(p.id, (cart[p.id] ?? 0) + 1)}
              className="w-full min-w-0 flex flex-wrap justify-between text-left text-xs gap-2 border border-border rounded-lg p-2 bg-surface disabled:opacity-40">
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{p.title || 'Untitled product'}</span><span className="min-w-0 [overflow-wrap:anywhere]">{price === null ? 'Price unavailable' : formatPKR(money(price))} +</span>
            </button>;
          })}
          {products.length === 0 && <p>No products available.</p>}
        </div>}
      </section>
      <section className="min-w-0 space-y-2 text-xs [overflow-wrap:anywhere] bg-surface border border-border rounded-xl p-2">
        <label className="block">Buyer<select className={input} value={accountId} onChange={e => { setAccountId(e.target.value); requestId.current = null; }}>
          <option value="">Walk-in Customer (customer pricing)</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
        </select></label>
        <details><summary className="cursor-pointer text-brand">Add customer / shopkeeper account</summary>
          <div className="space-y-2 mt-2">
            <input aria-label="Account name" placeholder="Name" className={input} value={accountName} onChange={e => setAccountName(e.target.value)} />
            <select aria-label="Account type" className={input} value={accountType} onChange={e => setAccountType(e.target.value as Account['type'])}><option value="customer">Customer</option><option value="shopkeeper">Shopkeeper</option></select>
            <input aria-label="Phone" placeholder="Phone" className={input} value={accountPhone} onChange={e => setAccountPhone(e.target.value)} />
            <input aria-label="Email" type="email" placeholder="Email" className={input} value={accountEmail} onChange={e => setAccountEmail(e.target.value)} />
            <input aria-label="Address" placeholder="Address" className={input} value={accountAddress} onChange={e => setAccountAddress(e.target.value)} />
            <button disabled={!accountName.trim()} className="text-brand" onClick={() => void createAccount()}>Save account</button>
          </div>
        </details>
        <p className="text-subtle text-xs">{wholesale ? 'Wholesale pricing (customer price fallback)' : 'Customer pricing'}</p>
        {lines.map(l => <div key={l.product.id} className="space-y-2 border-b border-border pb-2">
          <div className="flex flex-wrap justify-between gap-2"><span className="min-w-0">{l.product.title}</span><button aria-label={`Remove ${l.product.title}`} onClick={() => changeCart(l.product.id, 0)} className="text-danger">Remove</button></div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input aria-label={`Quantity for ${l.product.title}`} type="number" min="1" max="999999" step="1" className={`${input} max-w-16`} value={l.qty} onChange={e => changeCart(l.product.id, Number(e.target.value))} />
            <span className="min-w-0">{l.price === null ? 'Price unavailable' : `${formatPKR(l.price)} each / ${formatPKR(money(l.price * l.qty))}`}</span>
          </div>
        </div>)}
        {!lines.length && <p className="text-muted">Select products to start a sale.</p>}
        <p className="flex flex-wrap justify-between gap-2"><span>Subtotal</span><span>{formatPKR(subtotal)}</span></p>
        <label className="block">Discount (PKR)<input className={input} type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={e => { setDiscount(e.target.value); requestId.current = null; }} /></label>
        <p className="flex flex-wrap justify-between gap-2 text-brand font-bold"><span>Net total</span><span>{formatPKR(netTotal)}</span></p>
        <label className="block">Paid Amount (PKR)<input disabled={document_type === 'quotation'} className={input} type="number" min="0" max={netTotal} step="0.01" placeholder={String(netTotal)} value={document_type === 'quotation' ? '0' : paidAmount} onChange={e => { setPaidAmount(e.target.value); requestId.current = null; }} /></label>
        <p aria-live="polite" className={`flex flex-wrap justify-between gap-2 ${remainingAmount > 0 ? 'text-red-400' : 'text-green-400'}`}><span>Pending / Remaining</span><span>{formatPKR(remainingAmount)}</span></p>
        <label className="block">Document type<select className={input} value={document_type} onChange={e => { setDocumentType(e.target.value as 'invoice' | 'quotation'); requestId.current = null; }}><option value="invoice">Confirmed Bill</option><option value="quotation">Quotation</option></select></label>
        <label className="block">Fulfillment source<select className={input} value={fulfillment_source} onChange={e => { setFulfillmentSource(e.target.value as 'shop' | 'factory'); requestId.current = null; }}><option value="shop">Shop Bill</option><option value="factory">Factory Bill</option></select></label>
        {document_type === 'quotation' && <p className="text-subtle text-xs">Quotations do not deduct stock. Stock is deducted when converted to a confirmed bill.</p>}
        <label className="block">Payment method<select className={input} value={payment} onChange={e => { setPayment(e.target.value); requestId.current = null; }}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></label>
        <label className="block">Receipt image (optional, max 10 MB)<input ref={fileInput} className="block mt-2 w-full min-w-0 text-xs file:max-w-full file:whitespace-normal file:text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReceipt(e.target.files?.[0] ?? null)} /></label>
        <p className="text-muted text-xs">Attached images use public URLs. Upload receipts suitable for public access.</p>
        {validationError && <p className="text-warn text-xs">{validationError}</p>}
      </section>
    </fieldset>
    {pendingCheckout && !busy && <p role="status" className="text-warn">Invoice POS-{pendingCheckout.id} is awaiting confirmation. Retry the same checkout to finish it.</p>}
    <button type="button" disabled={busy || loading} onClick={() => void handleCompleteSale()} className="w-full rounded-lg bg-brand text-bg font-semibold p-3 disabled:opacity-40">{busy ? 'Saving...' : pendingCheckout ? 'Retry checkout' : document_type === 'quotation' ? 'Save quotation' : 'Confirm bill'}</button>
  </div>;
}
