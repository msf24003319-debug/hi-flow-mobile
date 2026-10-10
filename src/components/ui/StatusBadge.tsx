import { clsx } from 'clsx';

const MAP: Record<string, string> = {
  // shopkeeper
  pending: 'bg-warn/15 text-warn border-warn/30',
  approved: 'bg-ok/15 text-ok border-ok/30',
  rejected: 'bg-danger/15 text-danger border-danger/30',
  suspended: 'bg-danger/15 text-danger border-danger/30',
  // orders
  quotation: 'text-blue-400 bg-blue-950/60 border-blue-800',
  paid: 'text-green-400 bg-green-950/60 border-green-800',
  partial: 'text-amber-400 bg-amber-950/60 border-amber-800',
  unpaid: 'text-red-400 bg-red-950/60 border-red-800',
  confirmed: 'bg-info/15 text-info border-info/30',
  dispatched: 'bg-info/15 text-info border-info/30',
  ready_for_pickup: 'bg-warn/15 text-warn border-warn/30',
  delivered: 'bg-ok/15 text-ok border-ok/30',
  completed: 'bg-ok/15 text-ok border-ok/30',
  cancelled: 'bg-danger/15 text-danger border-danger/30',
  // inquiries / franchise
  new: 'bg-border text-subtle border-border',
  contacted: 'bg-info/15 text-info border-info/30',
  quoted: 'bg-brand/15 text-brand border-brand/30',
  qualified: 'bg-brand/15 text-brand border-brand/30',
  closed: 'bg-ok/15 text-ok border-ok/30',
  // reviews / stock
  hidden: 'bg-border text-subtle border-border',
  available: 'bg-ok/15 text-ok border-ok/30',
  out_of_stock: 'bg-danger/15 text-danger border-danger/30',
  in_stock: 'bg-ok/15 text-ok border-ok/30',
  low_stock: 'bg-warn/15 text-warn border-warn/30',
  // motor inquiry workflow (exact-cased values stored in the DB)
  Submitted: 'bg-warn/15 text-warn border-warn/30',
  'Under Review': 'bg-info/15 text-info border-info/30',
  'Quotation Sent': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Approved: 'bg-ok/15 text-ok border-ok/30',
  Completed: 'bg-ok/15 text-ok border-ok/30',
  Cancelled: 'bg-danger/15 text-danger border-danger/30',
};

export function StatusBadge({ status }: { status?: string }) {
  const cls = (status && MAP[status]) || 'bg-border text-subtle border-border';
  return (
    <span
      className={clsx(
        'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border',
        cls
      )}
    >
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}
