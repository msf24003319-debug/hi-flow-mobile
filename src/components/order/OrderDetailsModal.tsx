'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { ReactNode, RefObject } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Order } from '@/types/admin.types';
import { formatPKR } from '@/lib/utils';

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
  exporting: boolean;
  invoiceReady: boolean;
  invoiceRef: RefObject<HTMLDivElement>;
  invoiceTemplate: ReactNode;
  children: ReactNode;
}

export function OrderDetailsModal({ order, subtitle, onClose, onPrint, onDownload,
  exporting, invoiceReady, invoiceRef, invoiceTemplate, children }: OrderDetailsModalProps) {
  const actionClass = 'p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  // POS buyer_id identifies the administrator; customer contacts belong to the billing account.
  const customer = order.account_id || order.account_type ? order.account : order.buyer?.shopkeepers ?? order.buyer?.customers;
  const name = order.account_name_snapshot ?? order.account?.name ?? customer?.name ?? 'Walk-in';
  const type = order.account_type ?? order.account?.type ?? (order.buyer?.shopkeepers ? 'shopkeeper' : 'customer');
  const net = Number(order.net_amount ?? order.total);
  const paid = order.paid_amount == null ? null : Number(order.paid_amount);
  const remaining = order.remaining_amount == null ? (paid == null ? null : Math.max(0, Math.round((net - paid) * 100) / 100)) : Number(order.remaining_amount);
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
          <p>Subtotal: {formatPKR(Number(order.total_amount ?? order.total))}</p>
          <p>Discount: {formatPKR(Number(order.discount ?? 0))}</p>
          <p className="text-brand font-bold">Net Total: {formatPKR(net)}</p>
          <p className="text-green-400">Paid Amount: {paid == null ? 'Not recorded' : formatPKR(paid)}</p>
          <p className={remaining == null ? 'text-gray-400' : remaining > 0 ? 'text-red-400' : 'text-green-400'}>Pending / Remaining Amount: {remaining == null ? 'Not recorded' : formatPKR(remaining)}</p>
        </section>
      </div>
      {children}
      {invoiceReady && <div ref={invoiceRef} data-invoice-export
        className="absolute -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        {invoiceTemplate}
      </div>}
    </Modal>
  );
}
