'use client';

import { useMemo, useState } from 'react';
import { Users, ShieldCheck, ShieldAlert, XCircle, CreditCard } from 'lucide-react';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Customer, VerificationStatus, pickProfile } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CustomerVerificationViewer } from '@/components/customer/CustomerVerificationViewer';
import { formatDate, formatCnic } from '@/lib/utils';

/** Verification status is on profiles now; fall back to the legacy customers.status. */
const verStatus = (c: Customer): VerificationStatus =>
  pickProfile(c.profiles)?.verification_status ?? (c.status as VerificationStatus) ?? 'pending';

export default function CustomersPage() {
  // Embed ONLY verification_status (present in the live profiles table
  // pre- and post-migration). CustomerVerificationViewer fetches the
  // fuller profile row itself. A migration-only column in this select
  // 400s the whole query and the list renders empty.
  const { data, loading, error, refetch } = useSupabaseData<Customer>('customers', {
    select: '*, profiles(verification_status)',
    order: { column: 'created_at', ascending: false },
  });
  const [viewing, setViewing] = useState<Customer | null>(null);
  // Optimistic status flips from the modal, applied until the refetch lands.
  const [overrides, setOverrides] = useState<Record<string, VerificationStatus>>({});

  const rowStatus = (c: Customer): VerificationStatus => overrides[c.id] ?? verStatus(c);

  const summary = useMemo(() => {
    const by = (s: VerificationStatus) => data.filter((c) => rowStatus(c) === s).length;
    return { total: data.length, pending: by('pending'), approved: by('approved'), rejected: by('rejected') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, overrides]);

  const cards = [
    { label: 'Total Customers', value: summary.total, icon: Users, tone: 'text-brand' },
    { label: 'Pending', value: summary.pending, icon: ShieldAlert, tone: 'text-warn' },
    { label: 'Approved', value: summary.approved, icon: ShieldCheck, tone: 'text-ok' },
    { label: 'Rejected', value: summary.rejected, icon: XCircle, tone: 'text-danger' },
  ] as const;

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name', render: (c) => <span className="text-white font-medium">{c.name}</span> },
    {
      key: 'cnic',
      header: 'CNIC',
      render: (c) =>
        c.cnic ? (
          <span className="font-mono text-brand">{formatCnic(c.cnic)}</span>
        ) : (
          <span className="text-muted text-xs">—</span>
        ),
    },
    { key: 'phone', header: 'Phone', render: (c) => <span className="font-mono">{c.phone}</span> },
    { key: 'area', header: 'Area', render: (c) => c.area || <span className="text-muted">—</span> },
    { key: 'joined', header: 'Applied', render: (c) => formatDate(c.created_at) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={rowStatus(c)} />,
    },
    {
      key: 'review',
      header: '',
      render: (c) => (
        <button
          onClick={() => setViewing(c)}
          className="flex items-center gap-1.5 text-brand hover:underline text-xs font-semibold"
        >
          <CreditCard className="h-3.5 w-3.5" /> Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Customers</h1>
        <p className="text-xs text-subtle mt-1">
          Retail buyers. New customers are <span className="text-ok">approved automatically</span> and
          can order right away. Open any row to review their CNIC and{' '}
          <span className="text-danger">reject</span> or suspend anyone who shouldn&apos;t have access.
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          Failed to load customers: {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] text-subtle font-medium">{c.label}</p>
                <p className="text-2xl font-black text-white mt-1">{c.value}</p>
              </div>
              <div className={`h-9 w-9 rounded-lg bg-bg border border-border flex items-center justify-center ${c.tone}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={data}
        loading={loading}
        rowKey={(c) => c.id}
        searchable={(c) => `${c.name} ${c.cnic ?? ''} ${c.phone} ${c.area ?? ''}`}
        searchPlaceholder="Search name, CNIC, phone, or area…"
        emptyText="No customers registered yet."
      />

      <CustomerVerificationViewer
        customer={viewing}
        onClose={() => setViewing(null)}
        onUpdated={refetch}
        onStatusChange={(id, status) => setOverrides((o) => ({ ...o, [id]: status }))}
      />
    </div>
  );
}
