'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { ServiceRequest, ServiceRequestStatus, Service } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { formatDate, formatDateTime } from '@/lib/utils';

const STATUSES: ServiceRequestStatus[] = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];

const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  pending: 'bg-warn/15 text-warn border-warn/30',
  accepted: 'bg-info/15 text-info border-info/30',
  in_progress: 'bg-info/15 text-info border-info/30',
  completed: 'bg-ok/15 text-ok border-ok/30',
  cancelled: 'bg-danger/15 text-danger border-danger/30',
};

function StatusPill({ status }: { status: ServiceRequestStatus }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${STATUS_TONE[status]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function requesterInfo(r: ServiceRequest): { name: string; role: string } {
  const shop = r.buyer?.shopkeepers;
  const cust = r.buyer?.customers;
  if (shop) return { name: shop.shop_name || shop.name, role: 'Shopkeeper' };
  if (cust) return { name: cust.name, role: 'Customer' };
  return { name: r.name, role: r.buyer_role === 'shopkeeper' ? 'Shopkeeper' : 'Customer' };
}

export default function ServiceRequestsPage() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [status, setStatus] = useState<ServiceRequestStatus>('pending');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [serviceFilter, setServiceFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'shopkeeper' | 'customer'>('all');
  const [statusFilter, setStatusFilter] = useState<ServiceRequestStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [reqRes, svcRes] = await Promise.all([
      supabase
        .from('service_requests')
        .select(
          `*,
           service:services(id, name_en, name_ur, category),
           buyer:profiles!service_requests_buyer_id_fkey(shopkeepers(name, shop_name), customers(name))`
        )
        .order('created_at', { ascending: false }),
      supabase.from('services').select('*').order('name_en'),
    ]);
    if (reqRes.error) setLoadError(reqRes.error.message);
    setRows((reqRes.data as ServiceRequest[]) ?? []);
    setServices((svcRes.data as Service[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (r: ServiceRequest) => {
    setSelected(r);
    setStatus(r.status);
    setNotes(r.admin_notes ?? '');
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from('service_requests')
      .update({ status, admin_notes: notes || null })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setSelected(null);
    load();
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (serviceFilter !== 'all' && r.service_id !== serviceFilter) return false;
        if (roleFilter !== 'all' && r.buyer_role !== roleFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, serviceFilter, roleFilter, statusFilter]
  );

  const columns: Column<ServiceRequest>[] = [
    {
      key: 'id',
      header: 'Request',
      render: (r) => (
        <div>
          <div className="text-white font-mono text-[11px]">#{r.id.slice(0, 8)}</div>
          <div className="text-[11px] text-muted">{formatDate(r.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      render: (r) => <span className="text-white">{r.service?.name_en ?? '—'}</span>,
    },
    {
      key: 'who',
      header: 'Requested By',
      render: (r) => {
        const info = requesterInfo(r);
        return (
          <div>
            <div className="text-white flex items-center gap-1.5">
              {info.name}
              <span className="text-[9px] uppercase font-bold text-brand bg-brand/10 border border-brand/30 rounded px-1.5 py-0.5">
                {info.role}
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono">{r.phone}</div>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
    {
      key: 'act',
      header: '',
      className: 'text-right',
      render: (r) => (
        <button
          onClick={() => open(r)}
          className="inline-flex items-center gap-1.5 bg-brand/10 text-brand border border-brand/30 text-xs px-3 py-1.5 rounded-md font-semibold"
        >
          <Eye className="w-3.5 h-3.5" /> Open
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Service Requests</h1>
        <p className="text-xs text-subtle mt-1">China Office and Turbine Maintenance bookings from shopkeepers and customers.</p>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          Failed to load service requests: {loadError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="all">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_en}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="all">All Requesters</option>
          <option value="shopkeeper">Shopkeepers</option>
          <option value="customer">Customers</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="all">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        rowKey={(r) => r.id}
        searchable={(r) => `${r.id} ${r.name} ${r.phone}`}
        searchPlaceholder="Search by name, phone, request ID…"
        emptyText="No service requests yet."
      />

      {selected && (
        <Modal
          wide
          open
          onClose={() => setSelected(null)}
          title={selected.service?.name_en ?? 'Service Request'}
          subtitle={`#${selected.id.slice(0, 8)} · ${requesterInfo(selected).name}`}
          footer={
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-bg border border-border rounded-lg p-4">
              <div>
                <p className="text-muted">Contact</p>
                <p className="text-white font-medium">{selected.name}</p>
                <a href={`tel:${selected.phone}`} className="text-brand font-mono">
                  {selected.phone}
                </a>
              </div>
              <div>
                <p className="text-muted">Preferred Date / Time</p>
                <p className="text-white">
                  {[selected.preferred_date, selected.preferred_time].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>

            <div className="bg-bg border border-border rounded-lg p-3">
              <p className="text-muted">Location / Address</p>
              <p className="text-white mt-1 whitespace-pre-wrap">{selected.address}</p>
              {selected.latitude != null && selected.longitude != null && (
                <p className="text-subtle font-mono mt-1">
                  {selected.latitude}, {selected.longitude}
                </p>
              )}
            </div>

            {selected.description && (
              <div className="bg-bg border border-border rounded-lg p-3">
                <p className="text-muted">Description</p>
                <p className="text-white mt-1 whitespace-pre-wrap">{selected.description}</p>
              </div>
            )}

            {selected.images.length > 0 && (
              <div>
                <p className="text-muted mb-2">Photos</p>
                <div className="flex gap-2 flex-wrap">
                  {selected.images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="h-20 w-20 rounded-lg object-cover border border-border cursor-pointer"
                      onClick={() => window.open(url, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceRequestStatus)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white capitalize focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-muted mb-1">Internal / customer-visible notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <p className="text-muted">Submitted {formatDateTime(selected.created_at)}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
