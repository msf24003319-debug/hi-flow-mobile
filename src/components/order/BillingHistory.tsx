import { Order } from '@/types/admin.types';

export const BILLING_FILTERS = ['All', 'Confirmed Bills', 'Quotations', 'Shop Direct', 'Factory Direct'] as const;
export type BillingFilter = typeof BILLING_FILTERS[number];

export function matchesBillingFilter(order: Pick<Order, 'document_type' | 'fulfillment_source' | 'status'>, filter: BillingFilter) {
  const quotation = order.document_type === 'quotation' || order.status === 'quotation';
  switch (filter) {
    case 'Quotations': return quotation;
    case 'Confirmed Bills': return !quotation && ['paid', 'partial', 'unpaid', 'confirmed', 'completed', 'dispatched', 'ready_for_pickup', 'delivered'].includes(order.status);
    case 'Shop Direct': return (order.fulfillment_source ?? 'shop') === 'shop';
    case 'Factory Direct': return order.fulfillment_source === 'factory';
    default: return true;
  }
}

export function BillingHistory({ value, onChange }: { value: BillingFilter; onChange: (value: BillingFilter) => void }) {
  return <div role="group" aria-label="Billing history filters" className="flex flex-wrap gap-2">
    {BILLING_FILTERS.map(filter => <button key={filter} type="button" aria-pressed={value === filter}
      onClick={() => onChange(filter)} className={`rounded-lg border px-3 py-2 text-sm ${value === filter ? 'border-brand bg-brand text-bg' : 'border-border text-subtle'}`}>{filter}</button>)}
  </div>;
}
