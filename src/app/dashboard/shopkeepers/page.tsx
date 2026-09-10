'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Shopkeeper, VerificationStatus, pickProfile } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CNICViewer } from '@/components/shopkeeper/CNICViewer';
import { formatDate, formatCnic } from '@/lib/utils';

/** Verification status is on profiles now; fall back to legacy shopkeepers.status. */
const verStatus = (s: Shopkeeper): VerificationStatus =>
  pickProfile(s.profiles)?.verification_status ?? (s.status as VerificationStatus) ?? 'pending';

export default function ShopkeepersPage() {
  // Embed ONLY verification_status (present in the live profiles table
  // pre- and post-migration). The CNICViewer fetches the fuller profile
  // row itself, resiliently. Embedding a migration-only column here
  // (e.g. verification_rejection_reason) 400s the whole query.
  const { data, loading, error, refetch } = useSupabaseData<Shopkeeper>('shopkeepers', {
    select: '*, profiles(verification_status)',
    order: { column: 'created_at', ascending: false },
  });
  const [selected, setSelected] = useState<Shopkeeper | null>(null);
  // Optimistic status flips from the modal, applied until the refetch lands.
  const [overrides, setOverrides] = useState<Record<string, VerificationStatus>>({});

  const rowStatus = (s: Shopkeeper): VerificationStatus => overrides[s.id] ?? verStatus(s);

  const counts = useMemo(() => {
    const by = (s: string) => data.filter((d) => rowStatus(d) === s).length;
    return { pending: by('pending'), approved: by('approved'), rejected: by('rejected') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, overrides]);

  const columns: Column<Shopkeeper>[] = [
    {
      key: 'name',
      header: 'Shopkeeper',
      render: (s) => (
        <div>
          <div className="text-white font-medium">{s.name}</div>
          <div className="text-[11px] text-muted">{s.shop_name}</div>
        </div>
      ),
    },
    { key: 'cnic', header: 'CNIC', render: (s) => <span className="font-mono text-brand">{formatCnic(s.cnic)}</span> },
    { key: 'phone', header: 'Phone', render: (s) => <span className="font-mono">{s.phone}</span> },
    { key: 'area', header: 'Area', render: (s) => s.area },
    { key: 'created', header: 'Applied', render: (s) => formatDate(s.created_at) },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={rowStatus(s)} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) => (
        <button
          onClick={() => setSelected(s)}
          className="inline-flex items-center gap-1.5 bg-brand/10 text-brand border border-brand/30 text-xs px-3 py-1.5 rounded-md font-semibold"
        >
          <Eye className="w-3.5 h-3.5" /> Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Shopkeepers</h1>
        <p className="text-xs text-subtle mt-1">
          New shopkeepers are <span className="text-ok">approved automatically</span> and can order
          right away. Open any row to review their CNIC and <span className="text-danger">reject</span>{' '}
          or suspend anyone who shouldn&apos;t have access.
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          Failed to load shopkeepers: {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: counts.pending, tone: 'text-warn' },
          { label: 'Approved', value: counts.approved, tone: 'text-ok' },
          { label: 'Rejected', value: counts.rejected, tone: 'text-danger' },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-subtle uppercase">{c.label}</p>
            <p className={`text-2xl font-black mt-1 ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data}
        loading={loading}
        rowKey={(s) => s.id}
        searchable={(s) => `${s.name} ${s.shop_name} ${s.cnic} ${s.phone} ${s.area}`}
        searchPlaceholder="Search name, shop, CNIC, phone…"
        emptyText="No shopkeepers registered yet."
      />

      <CNICViewer
        shopkeeper={selected}
        onClose={() => setSelected(null)}
        onUpdated={refetch}
        onStatusChange={(id, status) => setOverrides((o) => ({ ...o, [id]: status }))}
      />
    </div>
  );
}
