'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { ReactNode, RefObject } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Order } from '@/types/admin.types';
import { formatPKR } from '@/lib/utils';
import { orderPayment, BILL_STATUS_CLASSES } from '@/lib/order-payment';

export interface OrderDetailsData extends Order {
  account_id?: string | null;
  account_name_snapshot?: string | null;
  account_type?: string | null;
  account?: { name: string; type: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  total_amount?: number | null;
  discount?: number | null;
  net_amount?: number | null;
  paid_amount?: number | null;
  remaining_amount?: number | null;
}

export function formatOrderNumber(order: Pick<Order, 'id' | 'order_number'>) {
  const number = String(order.order_number ?? '').trim();
  return number ? `#${number} (POS-${number.padStart(4, '0')})` : `POS-${order.id.slice(0, 8).toUpperCase()}`;
}

interface OrderDetailsModalProps {
  order: OrderDetailsData;
  subtitle?: string;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onConvert?: () => void;
  converting?: boolean;
  exporting: boolean;
  invoiceReady: boolean;
  invoiceRef: RefObject<HTMLDivElement>;
  invoiceTemplate: ReactNode;
  subtotalAmount?: number;
  children: ReactNode;
}

export function OrderDetailsModal({ order, subtitle, onClose, onPrint, onDownload,
  onConvert, converting, exporting, invoiceReady, invoiceRef, invoiceTemplate, subtotalAmount, children }: OrderDetailsModalProps) {
  const actionClass = 'p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  // POS buyer_id identifies the administrator; customer contacts belong to the billing account.
  const customer = order.account_id || order.account_type ? order.account : order.buyer?.shopkeepers ?? order.buyer?.customers;
  const name = order.account_name_snapshot ?? order.account?.name ?? customer?.name ?? 'Walk-in Customer';
  const type = order.account_type ?? order.account?.type ?? (order.buyer?.shopkeepers ? 'shopkeeper' : 'customer');
  const net = Number(order.net_amount ?? order.total);
  const { paid, remaining, status } = orderPayment(order.document_type, net, order.paid_amount, order.remaining_amount);
  return (
    <Modal open wide dark title={formatOrderNumber(order)} subtitle={subtitle} onClose={onClose}
      headerActions={<>
        <button type="button" aria-label="Print invoice" title="Print invoice"
          className={actionClass} disabled={!invoiceReady || exporting} onClick={onPrint}>
          <Printer className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Download invoice PDF" title="Download invoice PDF"
          className={actionClass} disabled={!invoiceReady || exporting} onClick={onDownload}>
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
      </>}>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 text-sm text-gray-200">
        <section className="min-w-0 rounded-xl border border-gray-800 bg-[#222222] p-4">
          <h3 className="mb-3 font-semibold">Customer details</h3>
          <dl className="space-y-2 [overflow-wrap:anywhere]">
            {Object.entries({ Name: name, Type: type, Phone: customer?.phone, Email: order.account?.email,
              Address: order.customer_address ?? order.account?.address ?? order.delivery_address }).map(([label, value]) =>
              <div key={label}><dt className="text-gray-400">{label}</dt><dd className="whitespace-pre-line">{value?.trim() || 'Not recorded'}</dd></div>)}
          </dl>
        </section>
        <section className="min-w-0 space-y-2 rounded-xl border border-gray-800 bg-[#222222] p-4">
          <h3 className="mb-3 font-semibold">Payment totals</h3>
          <span className={`inline-block rounded border px-2 py-1 text-xs font-bold ${BILL_STATUS_CLASSES[status]}`}>{status.toUpperCase()}</span>
          <p>Subtotal: {formatPKR(subtotalAmount ?? Number(order.total_amount ?? (net + Number(order.discount ?? 0))))}</p>
          <p>Discount: {formatPKR(Number(order.discount ?? 0))}</p>
          <p className="text-brand font-bold">Net Total: {formatPKR(net)}</p>
          <p className="text-green-400">Paid Amount: {formatPKR(paid)}</p>
          <p className={remaining > 0 ? 'text-red-400' : 'text-green-400'}>Pending / Remaining Amount: {formatPKR(remaining)}</p>
        </section>
      </div>
      <p className="mb-4 text-sm text-gray-300">
        {order.document_type === 'quotation' || order.status === 'quotation' ? 'Quotation' : 'Confirmed Bill'}
        {' · '}
        {order.fulfillment_source === 'factory' ? 'Factory Bill' : 'Shop Bill'}
      </p>
      {(order.document_type === 'quotation' || order.status === 'quotation') && onConvert && (
        <button
          type="button"
          disabled={converting || exporting || !invoiceReady}
          onClick={onConvert}
          className="mb-4 rounded-lg bg-brand px-4 py-2 font-semibold text-bg disabled:opacity-40"
        >
          {converting ? 'Converting...' : 'Convert Quotation to Confirmed Bill'}
        </button>
      )}
      {children}
      {invoiceReady && <div ref={invoiceRef} data-invoice-export
        className="absolute -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        {invoiceTemplate}
      </div>}
    </Modal>
  );
}
