'use client';

import { CloudUpload, Loader2, Trash2 } from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { uploadInvoiceImage } from '@/lib/storage';
import { attachInvoiceImage, removeInvoiceImage, errorMessage } from '@/lib/pos';
import { A4InvoiceTemplate } from '@/components/order/A4InvoiceTemplate';
import { downloadInvoicePdf } from '@/lib/invoice-pdf';
import { Order } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { OrderDetailsModal } from '@/components/order/OrderDetailsModal';
import { formatDateTime, formatPKR } from '@/lib/utils';

interface AuditOrder extends Order {
  invoice_number: string | null; account_type: string | null; account_name_snapshot: string | null;
  total_amount: number | null; discount: number | null; net_amount: number | null;
  payment_status?: string | null;
  payment_method: string | null; image_urls: string[] | null;
  account: { name: string; type: string } | null;
}
interface AuditItem {
  id: string; qty: number; price: number; product_title_snapshot: string | null;
  quantity?: number | null; unit_price?: number | string | null; product_title?: string | null;
  product: { title: string | null; name: string | null; name_en: string | null } | null;
}
const buyerName = (o: AuditOrder) => o.account_name_snapshot ?? o.account?.name
  ?? o.buyer?.shopkeepers?.shop_name ?? o.buyer?.shopkeepers?.name ?? o.buyer?.customers?.name ?? 'Unknown buyer';
const buyerType = (o: AuditOrder) => o.account_type ?? o.account?.type
  ?? (o.buyer?.shopkeepers ? 'shopkeeper' : o.buyer?.customers ? 'customer' : 'unknown');
const invoice = (o: AuditOrder) => o.invoice_number ?? o.order_number ?? `#${o.id.slice(0, 8)}`;

export default function HistoryPage() {
  const [orders, setOrders] = useState<AuditOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditOrder | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ orderId: string; url: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [itemsReady, setItemsReady] = useState(false);
  const exportLock = useRef(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const detailRequest = useRef(0);
  const uploadLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const rows: AuditOrder[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from('orders').select(`*,
          account:accounts!orders_account_id_fkey(name,type),
          buyer:profiles!orders_buyer_id_fkey(shopkeepers(name,shop_name,phone,area),customers(name,phone))`)
          .order('created_at', { ascending: false }).order('id').range(from, from + 499);
        if (error) throw error;
        rows.push(...(data as unknown as AuditOrder[]));
        if (!data || data.length < 500) break;
      }
      setOrders(rows);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openOrder(order: AuditOrder) {
    const request = ++detailRequest.current;
    setItemsReady(false); setSelected(order); setItems([]); setDetailLoading(true); setDetailError('');
    try {
      const rows: AuditItem[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from('order_items')
          .select('*,product:products(title,name,name_en)')
          .eq('order_id', order.id).order('id').range(from, from + 499);
        if (error) throw error;
        rows.push(...(data as unknown as AuditItem[]).map(item => ({
          ...item,
          qty: Number(item.qty ?? item.quantity ?? 0),
          price: Number(item.price ?? item.unit_price ?? 0),
          product_title_snapshot: item.product_title_snapshot ?? item.product_title ?? null,
        })));
        if (!data || data.length < 500) break;
      }
      if (detailRequest.current === request) { setItems(rows); setItemsReady(true); }
    } catch (e) { if (detailRequest.current === request) setDetailError(errorMessage(e)); }
    finally { if (detailRequest.current === request) setDetailLoading(false); }
  }

  async function saveAttachment(orderId: string, url: string) {
    // Append under a database row lock so concurrent uploads cannot overwrite receipts.
    const savedImages = await attachInvoiceImage(orderId, url);
    const existingImages = savedImages.filter(image => image !== url);
    const urls = [...existingImages, url];
    setOrders(old => old.map(o => o.id === orderId ? { ...o, image_urls: urls } : o));
    setSelected(old => old?.id === orderId ? { ...old, image_urls: urls } : old);
    setPendingAttachment(null);
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selected || pendingAttachment || uploadLock.current) return;
    const orderId = selected.id;
    uploadLock.current = true; setUploading(true); setDetailError('');
    try {
      const url = await uploadInvoiceImage(file, orderId);
      setPendingAttachment({ orderId, url });
      await saveAttachment(orderId, url);
    } catch (e) { setDetailError(errorMessage(e)); }
    finally { uploadLock.current = false; setUploading(false); }
  }

  async function retryAttachment() {
    if (!pendingAttachment || uploadLock.current) return;
    uploadLock.current = true; setUploading(true); setDetailError('');
    try { await saveAttachment(pendingAttachment.orderId, pendingAttachment.url); }
    catch (e) { setDetailError(errorMessage(e)); }
    finally { uploadLock.current = false; setUploading(false); }
  }

  async function handleImageDelete(url: string) {
    if (!selected || uploadLock.current) return;
    const orderId = selected.id;
    uploadLock.current = true; setDeletingUrl(url); setDetailError('');
    try {
      const urls = await removeInvoiceImage(orderId, url);
      setOrders(old => old.map(order => order.id === orderId ? { ...order, image_urls: urls } : order));
      setSelected(old => old?.id === orderId ? { ...old, image_urls: urls } : old);
    } catch (e) { setDetailError(errorMessage(e)); }
    finally { uploadLock.current = false; setDeletingUrl(null); }
  }

  async function handleInvoiceOutput(download: boolean) {
    if (!selected || !itemsReady || detailLoading || exportLock.current) return;
    const element = invoiceRef.current?.firstElementChild as HTMLElement | null;
    if (!element) return;
    exportLock.current = true; setExporting(true); setDetailError('');
    const previousTitle = document.title;
    try {
      if (download) await downloadInvoicePdf(element, selected.id);
      else {
        await document.fonts.ready;
        document.title = `Invoice ${invoice(selected)}`;
        window.print();
      }
    } catch (e) { setDetailError(errorMessage(e)); }
    finally { document.title = previousTitle; exportLock.current = false; setExporting(false); }
  }

  const columns: Column<AuditOrder>[] = [
    { key: 'invoice', header: 'Invoice', render: o => <span className="font-mono break-all">{invoice(o)}</span> },
    { key: 'buyer', header: 'Buyer', render: buyerName },
    { key: 'type', header: 'Type', render: o => <span className="capitalize">{buyerType(o)}</span> },
    { key: 'total', header: 'Total / Net', render: o => <span>{formatPKR(o.total_amount ?? o.total)} / {formatPKR(o.net_amount ?? o.total)}</span> },
    { key: 'images', header: 'Images', render: o => `${o.image_urls?.length ?? 0} attached` },
    { key: 'date', header: 'Date', render: o => formatDateTime(o.created_at) },
    { key: 'actions', header: 'Actions', render: o => <button className="text-brand" disabled={uploading || !!deletingUrl || exporting} onClick={() => void openOrder(o)}>View / Attach receipt</button> },
  ];

  return <div className="space-y-6">
    <div className="flex justify-between"><div><h1 className="text-2xl font-bold">Billing &amp; Purchase History</h1><p className="text-sm text-subtle">POS and existing orders, with historical line items and receipts.</p></div><button className="text-brand" disabled={loading} onClick={() => void load()}>Refresh</button></div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <DataTable columns={columns} rows={orders} loading={loading} rowKey={o => o.id} searchable={o => `${invoice(o)} ${buyerName(o)} ${buyerType(o)}`} searchPlaceholder="Search invoice, buyer or type" emptyText="No orders found." />
    {selected && <OrderDetailsModal title={invoice(selected)} subtitle={`${buyerName(selected)} (${buyerType(selected)})`} onClose={() => { if (!uploadLock.current && !exportLock.current) { ++detailRequest.current; setSelected(null); } }}
      onPrint={() => void handleInvoiceOutput(false)} onDownload={() => void handleInvoiceOutput(true)}
      exporting={exporting} invoiceReady={itemsReady && !detailLoading} invoiceRef={invoiceRef}
      invoiceTemplate={
      <A4InvoiceTemplate
        company={{ name: 'Hi Flow Pump Industries', address: '', cityPostCode: '', location: '',
          senderName: '', telephone: '', email: '', vatNtnNumber: '' }}
        customer={{ name: buyerName(selected), address: selected.delivery_address ?? '', city: '',
          telephone: selected.buyer?.shopkeepers?.phone ?? selected.buyer?.customers?.phone ?? '', type: buyerType(selected) }}
        invoice={{ number: invoice(selected), date: formatDateTime(selected.created_at),
          orderNumber: selected.order_number ?? selected.id, paymentTerms: selected.payment_method ?? 'Not recorded',
          orderStatus: selected.status, paymentStatus: selected.payment_status }}
        items={items.map(item => ({ id: item.id,
          description: item.product_title_snapshot ?? item.product?.title ?? item.product?.name ?? item.product?.name_en ?? 'Unavailable product',
          quantity: item.qty, unitPrice: item.price }))}
        discount={selected.discount ?? 0} subtotalAmount={selected.total_amount ?? selected.total}
        totalAmount={selected.net_amount ?? selected.total} branding="Hi Flow Pump Industries" />
      }>
      <div className="space-y-6 text-gray-200">
        <p className="rounded-xl border border-gray-800 bg-[#222222] px-4 py-3 text-sm text-gray-400">{formatDateTime(selected.created_at)} · {selected.status} · {selected.payment_method ?? 'Payment method not recorded'}</p>
        {detailError && <p role="alert" className="text-danger">{detailError}</p>}
        {detailLoading ? <p>Loading items...</p> : <div className="overflow-x-auto rounded-xl border border-gray-800 bg-[#202020]"><table className="w-full text-sm text-left">
          <thead><tr className="bg-[#262626] text-gray-400"><th className="p-2">Product</th><th className="p-2">Quantity</th><th className="p-2">Unit price</th><th className="p-2">Total</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.id} className="border-t border-border"><td className="p-2">{item.product_title_snapshot ?? item.product?.title ?? item.product?.name ?? item.product?.name_en ?? 'Unavailable product'}</td><td className="p-2">{item.qty}</td><td className="p-2">{formatPKR(item.price)}</td><td className="p-2">{formatPKR(item.qty * item.price)}</td></tr>)}</tbody>
        </table>{!items.length && <p>No line items recorded.</p>}</div>}
        <div className="space-y-2 rounded-xl border border-gray-800 bg-[#222222] p-4 text-sm">
          <p>Subtotal: {formatPKR(selected.total_amount ?? selected.total)}</p>
          <p>Discount: {formatPKR(selected.discount ?? 0)}</p>
          <p className="text-brand font-bold">Net total: {formatPKR(selected.net_amount ?? selected.total)}</p>
        </div>
        <div><h3 className="font-semibold mb-3">Receipt images</h3>
          <div className="flex flex-wrap gap-3">{(selected.image_urls ?? []).map((url, index) => /^https:\/\//.test(url) &&
            <div key={url} className="group relative w-32 h-32">
              <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Invoice receipt ${index + 1}`} className="w-32 h-32 rounded-xl border border-gray-700 object-cover" loading="lazy" />
              </a>
              <button type="button" aria-label={`Remove receipt ${index + 1}`} title="Remove receipt"
                disabled={uploading || !!deletingUrl}
                onClick={() => void handleImageDelete(url)}
                className="absolute right-2 top-2 rounded-lg bg-black/80 p-2 text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-red-500 hover:text-white disabled:cursor-wait">
                {deletingUrl === url ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>)}</div>
          {!selected.image_urls?.length && <p className="text-sm text-gray-500">No attached receipts.</p>}
          <label className={`relative mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-700 bg-[#202020] p-6 text-center transition ${uploading || deletingUrl || pendingAttachment ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-gray-500 hover:bg-[#262626]'} focus-within:ring-2 focus-within:ring-brand`}>
            <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Upload another receipt"
              disabled={uploading || !!deletingUrl || !!pendingAttachment} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e => void handleImageUpload(e)} />
            {uploading ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <CloudUpload className="h-8 w-8 text-gray-400" />}
            <span className="text-sm font-medium" role="status">{uploading ? 'Uploading and saving receipt...' : 'Click to upload another receipt'}</span>
            <span className="text-xs text-gray-500">JPEG, PNG or WebP ? Up to 10 MB</span>
          </label>
          {pendingAttachment && !uploading && <button className="text-brand mt-2" onClick={() => void retryAttachment()}>Retry saving uploaded receipt</button>}
          <p className="text-xs text-muted mt-2">Images are publicly accessible by URL.</p>
        </div>
      </div>
    </OrderDetailsModal>}

  </div>;
}
