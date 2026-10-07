import { QrCode } from 'lucide-react';

export const DEFAULT_STORE_METADATA = {
  name: 'Hi Flow Pump Industries',
  telephone: '+92 300 1234567',
  email: 'info@hiflowpumps.com',
  vatNtnNumber: 'NTN-7492018-9',
};

export interface A4InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface A4InvoiceTemplateProps {
  company: {
    name: string;
    address: string;
    cityPostCode: string;
    location: string;
    senderName: string;
    telephone: string;
    email: string;
    vatNtnNumber: string;
  };
  customer: {
    name: string;
    address: string;
    city: string;
    telephone: string;
    type: string;
  };
  invoice: {
    number: string;
    date: string;
    orderNumber: string;
    paymentTerms: string;
    paymentStatus?: string | null;
    orderStatus?: string;
    shippingDate?: string;
    shippingNumber?: string;
  };
  items: A4InvoiceItem[];
  /** Fixed monetary discount, rather than a percentage. */
  discount?: number;
  currency?: string;
  subtotalAmount?: number;
  totalAmount?: number;
  branding?: string;
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-xs leading-5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="break-words font-medium text-gray-900">{value || '—'}</dd>
    </div>
  );
}

/** Render one invoice at a time; call window.print() from the containing page. */
export function A4InvoiceTemplate({
  company, customer, invoice, items, discount = 0, currency = 'PKR',
  branding = 'Thank you for your business', subtotalAmount, totalAmount,
}: A4InvoiceTemplateProps) {
  const subtotal = subtotalAmount ?? items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = totalAmount ?? subtotal - discount;
  const money = (value: number) => `${currency} ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

  const storeName = company.name.trim() || DEFAULT_STORE_METADATA.name;
  const paymentStatus = invoice.orderStatus === 'completed' ? 'Paid' : invoice.paymentStatus?.trim() || 'Paid';

  return (
    <article id="a4-printable-invoice" aria-label={`Billing invoice ${invoice.number}`}
      className="mx-auto flex w-[210mm] min-h-[297mm] shrink-0 flex-col bg-white p-[15mm] font-sans text-gray-900 shadow-xl">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold uppercase tracking-wide text-slate-900">Billing Invoice</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">{invoice.number}</p>
        </div>
        <div aria-label="QR code placeholder" className="flex h-24 w-24 shrink-0 items-center justify-center border border-gray-300 bg-gray-50">
          <QrCode aria-hidden="true" className="h-16 w-16 text-slate-900" strokeWidth={1.5} />
        </div>
      </header>

      <section aria-label="Company and sender details" className="mb-6 grid grid-cols-2 gap-8">
        <div className="space-y-1 text-xs leading-5">
          <h2 className="mb-2 break-words text-lg font-bold">{storeName}</h2>
          <p className="whitespace-pre-line break-words">{company.address}</p>
          <p>{company.cityPostCode}</p>
          <p>{company.location}</p>
          <p className="pt-2"><span className="text-gray-500">Sender: </span>{company.senderName.trim() || storeName}</p>
        </div>
        <dl className="space-y-2">
          <Detail label="Telephone" value={company.telephone.trim() || DEFAULT_STORE_METADATA.telephone} />
          <Detail label="Email" value={company.email.trim() || DEFAULT_STORE_METADATA.email} />
          <Detail label="Shipping date" value={invoice.shippingDate?.trim() || invoice.date} />
          <Detail label="Shipping number" value={invoice.shippingNumber} />
          <Detail label="VAT / NTN number" value={company.vatNtnNumber.trim() || DEFAULT_STORE_METADATA.vatNtnNumber} />
        </dl>
      </section>

      <section aria-label="Customer and invoice details" className="mb-7 grid grid-cols-2 gap-8 border-t-4 border-black pt-5">
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Send To</h2>
          <p className="mb-1 break-words text-base font-bold">{customer.name}</p>
          {customer.address.trim() && <p className="whitespace-pre-line break-words text-xs leading-5">{customer.address}</p>}
          {customer.city.trim() && <p className="text-xs leading-5">{customer.city}</p>}
          <dl className="mt-2 space-y-1">
            {customer.telephone.trim() && <Detail label="Telephone" value={customer.telephone} />}
            {customer.type.trim() && <Detail label="Customer type" value={customer.type} />}
          </dl>
        </div>
        <dl className="space-y-2">
          <Detail label="Invoice number" value={invoice.number} />
          <Detail label="Date" value={invoice.date} />
          <Detail label="Order number" value={invoice.orderNumber} />
          <Detail label="Terms of payment" value={invoice.paymentTerms} />
          <Detail label="Payment status" value={paymentStatus} />
        </dl>
      </section>

      <table className="w-full table-fixed border-collapse border border-gray-400 text-xs">
        <colgroup><col className="w-[46%]" /><col className="w-[12%]" /><col className="w-[21%]" /><col className="w-[21%]" /></colgroup>
        <thead className="bg-gray-100">
          <tr>
            <th scope="col" className="border border-gray-400 px-3 py-3 text-left">Description</th>
            <th scope="col" className="border border-gray-400 px-2 py-3 text-center">Quantity</th>
            <th scope="col" className="border border-gray-400 px-3 py-3 text-right">Unit Price</th>
            <th scope="col" className="border border-gray-400 px-3 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td className="whitespace-pre-line break-words border border-gray-400 px-3 py-3 align-top">{item.description}</td>
              <td className="border border-gray-400 px-2 py-3 text-center align-top">{item.quantity}</td>
              <td className="break-words border border-gray-400 px-3 py-3 text-right align-top">{money(item.unitPrice)}</td>
              <td className="break-words border border-gray-400 px-3 py-3 text-right align-top">{money(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
          {Array.from({ length: 4 }, (_, index) => (
            <tr key={`spacer-${index}`} aria-hidden="true" className="h-9">
              {Array.from({ length: 4 }, (_, column) => <td key={column} className="border border-gray-400">&nbsp;</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto w-[42%] border-x border-b border-gray-400 text-xs [break-inside:avoid]">
        <div className="flex justify-between gap-3 border-b border-gray-400 px-3 py-3"><dt>Subtotal</dt><dd className="text-right">{money(subtotal)}</dd></div>
        <div className="flex justify-between gap-3 border-b border-gray-400 px-3 py-3"><dt>Discount</dt><dd className="text-right">{money(discount)}</dd></div>
        <div className="flex justify-between gap-3 bg-gray-50 px-3 py-3 text-sm font-bold"><dt>Total</dt><dd className="text-right">{money(total)}</dd></div>
      </dl>

      <footer className="mt-auto flex items-center justify-center gap-2 pt-10 text-center text-[10px] text-gray-500">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 bg-blue-700" />
        <span>{branding}</span>
      </footer>
    </article>
  );
}

export default A4InvoiceTemplate;
