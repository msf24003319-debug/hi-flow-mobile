'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { FranchiseLead, FranchiseStatus } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { formatDate, downloadCSV } from '@/lib/utils';

const STATUSES: FranchiseStatus[] = ['new', 'contacted', 'qualified', 'closed'];

export default function FranchiseLeadsPage() {
  const [rows, setRows] = useState<FranchiseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FranchiseLead | null>(null);
  const [status, setStatus] = useState<FranchiseStatus>('new');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('franchise_leads')
      .select('*')
      .order('created_at', { ascending: false });
    setRows((data as FranchiseLead[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (r: FranchiseLead) => {
    setSelected(r);
    setStatus(r.status);
    setNotes(r.internal_notes ?? '');
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    await supabase
      .from('franchise_leads')
      .update({ status, internal_notes: notes || null })
      .eq('id', selected.id);
    setSaving(false);
    setSelected(null);
    load();
  };

  const exportCsv = () =>
    downloadCSV(
      `franchise-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email,
        occupation: r.occupation,
        city: r.city,
        investment: r.investment,
        owns_property: r.owns_property ? 'Yes' : 'No',
        other_franchise: r.other_franchise ? r.other_franchise_name || 'Yes' : 'No',
        heard_from: r.heard_from,
        office_address: r.office_address,
        status: r.status,
        created_at: r.created_at,
      }))
    );

  const columns: Column<FranchiseLead>[] = [
    { key: 'name', header: 'Applicant', render: (r) => <span className="text-white font-medium">{r.name}</span> },
    { key: 'city', header: 'City', render: (r) => r.city },
    { key: 'inv', header: 'Investment', render: (r) => <span className="text-ok font-mono">{r.investment}</span> },
    { key: 'phone', header: 'Phone', render: (r) => <span className="font-mono">{r.phone}</span> },
    { key: 'date', header: 'Applied', render: (r) => formatDate(r.created_at) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Franchise Leads</h1>
          <p className="text-xs text-subtle mt-1">Applications from the mobile franchise form.</p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-subtle rounded-lg text-xs"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        searchable={(r) => `${r.name} ${r.city} ${r.phone} ${r.email}`}
        emptyText="No leads yet."
      />

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.name}
          subtitle={`${selected.city} · ${selected.investment}`}
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
          <div className="space-y-3 text-xs">
            {[
              ['Phone', selected.phone],
              ['Email', selected.email],
              ['Occupation', selected.occupation],
              ['Owns property', selected.owns_property ? 'Yes' : 'No'],
              [
                'Other franchise',
                selected.other_franchise ? selected.other_franchise_name || 'Yes' : 'No',
              ],
              ['Heard from', selected.heard_from],
              ['Office address', selected.office_address],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg border border-border rounded-lg p-3">
                <p className="text-muted">{k}</p>
                <p className="text-white mt-0.5">{v}</p>
              </div>
            ))}
            <div>
              <label className="block text-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FranchiseStatus)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-white capitalize focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-muted mb-1">Internal notes</label>
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
