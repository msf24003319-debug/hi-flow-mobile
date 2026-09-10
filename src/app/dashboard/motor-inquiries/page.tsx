'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { MotorInquiry, InquiryStatus } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime, formatPKR } from '@/lib/utils';

const STATUSES: InquiryStatus[] = [
  'Submitted',
  'Under Review',
  'Quotation Sent',
  'Approved',
  'Completed',
  'Cancelled',
];

function buyerInfo(row: MotorInquiry): { name: string; phone: string; role: 'Shopkeeper' | 'Customer' | 'Unknown' } {
  const shop = row.buyer?.shopkeepers;
  const cust = row.buyer?.customers;
  if (shop) return { name: shop.shop_name || shop.name, phone: shop.phone, role: 'Shopkeeper' };
  if (cust) return { name: cust.name, phone: cust.phone, role: 'Customer' };
  return { name: '—', phone: '', role: 'Unknown' };
}

export default function MotorInquiriesPage() {
  const [rows, setRows] = useState<MotorInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MotorInquiry | null>(null);
  const [status, setStatus] = useState<InquiryStatus>('Submitted');
  const [quotationAmount, setQuotationAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [rowSaving, setRowSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('motor_inquiries')
      .select(
        `*,
         buyer:profiles!motor_inquiries_buyer_id_fkey(shopkeepers(name, shop_name, phone), customers(name, phone))`
      )
      .order('created_at', { ascending: false });
    if (error) setLoadError(error.message);
    setRows((data as MotorInquiry[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (r: MotorInquiry) => {
    setSelected(r);
    setStatus(r.status);
    setQuotationAmount(r.quotation_amount ?? 0);
    setNotes(r.admin_notes ?? '');
  };

  // Patches the row in place instead of a full refetch — the table
  // reflects the change the instant the request resolves.
  const patchRow = (id: string, patch: Partial<MotorInquiry>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  /** Fast inline status change straight from the table row, no modal. */
  const quickSetStatus = async (row: MotorInquiry, next: InquiryStatus) => {
    if (next === row.status) return;
    setRowSaving(row.id);
    const prevStatus = row.status;
    patchRow(row.id, { status: next }); // optimistic
    const { error } = await supabase.from('motor_inquiries').update({ status: next }).eq('id', row.id);
    if (error) {
      patchRow(row.id, { status: prevStatus }); // roll back
      setLoadError(error.message);
    }
    setRowSaving(null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setLoadError(null);
    const { error } = await supabase
      .from('motor_inquiries')
      .update({
        status,
        quotation_amount: quotationAmount || 0,
        admin_notes: notes || null,
      })
      .eq('id', selected.id);
    setSaving(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    patchRow(selected.id, { status, quotation_amount: quotationAmount || 0, admin_notes: notes || null });
    setSelected(null);
  };

  const columns: Column<MotorInquiry>[] = [
    {
      key: 'buyer',
      header: 'From',
      render: (r) => {
        const b = buyerInfo(r);
        return (
          <div>
            <div className="text-white">{b.name}</div>
            <div className="text-[11px] text-muted font-mono">
              {b.phone} · {b.role}
            </div>
          </div>
        );
      },
    },
    { key: 'brand', header: 'Brand', render: (r) => <span className="text-brand font-semibold">{r.brand}</span> },
    {
      key: 'req',
      header: 'Requirement',
      render: (r) => <span className="text-subtle line-clamp-2 max-w-md block">{r.requirement_text}</span>,
    },
    { key: 'date', header: 'Received', render: (r) => formatDateTime(r.created_at) },
    {
      key: 'quotation',
      header: 'Quotation',
      render: (r) => (
        <span className={`font-mono ${r.quotation_amount ? 'text-white' : 'text-muted'}`}>
          {r.quotation_amount ? formatPKR(r.quotation_amount) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="space-y-1.5">
          <StatusBadge status={r.status} />
          <select
            value={r.status}
            disabled={rowSaving === r.id}
            onChange={(e) => quickSetStatus(r, e.target.value as InquiryStatus)}
            className="w-full px-2 py-1 bg-bg border border-border rounded-md text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ),
    },
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
        <h1 className="text-2xl font-bold text-white tracking-tight">Motor Inquiries</h1>
        <p className="text-xs text-subtle mt-1">Quote-request inbox for submersible motors — manual callback.</p>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">{loadError}</div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        searchable={(r) => {
          const b = buyerInfo(r);
          return `${r.brand} ${r.requirement_text} ${b.name}`;
        }}
        emptyText="No inquiries yet."
      />

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`${selected.brand} inquiry`}
          subtitle={buyerInfo(selected).name}
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
            <div className="bg-bg border border-border rounded-lg p-3">
              <p className="text-muted">Requirement</p>
              <p className="text-white mt-1 whitespace-pre-wrap">{selected.requirement_text}</p>
            </div>
            <div className="bg-bg border border-border rounded-lg p-3 space-y-1">
              <p className="text-white">{buyerInfo(selected).name}</p>
              <a href={`tel:${buyerInfo(selected).phone}`} className="text-brand font-mono">
                {buyerInfo(selected).phone}
              </a>
              <p className="text-muted">{buyerInfo(selected).role}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InquiryStatus)}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-muted mb-1">Quotation Amount (PKR)</label>
                <input
                  type="number"
                  min={0}
                  value={quotationAmount}
                  onChange={(e) => setQuotationAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
            <div>
              <label className="block text-muted mb-1">Admin notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
