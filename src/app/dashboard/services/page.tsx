'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Service, ServiceCategory } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { ServiceForm } from '@/components/service/ServiceForm';
import { formatPKR } from '@/lib/utils';

const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  china_office: 'China Office Services',
  turbine_maintenance: 'Turbine Maintenance Services',
};

const TABS: (ServiceCategory | 'all')[] = ['all', 'china_office', 'turbine_maintenance'];

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ServiceCategory | 'all'>('all');
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from('services').select('*').order('category').order('sort_order');
    if (error) setLoadError(error.message);
    setServices((data as Service[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (s: Service) => {
    await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  const remove = async (s: Service) => {
    if (!confirm(`Delete "${s.name_en}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('services').delete().eq('id', s.id);
    if (error) {
      alert(
        error.message.includes('foreign key')
          ? 'This service has existing requests and cannot be deleted — disable it instead.'
          : error.message
      );
      return;
    }
    load();
  };

  const rows = tab === 'all' ? services : services.filter((s) => s.category === tab);

  const columns: Column<Service>[] = [
    {
      key: 'name',
      header: 'Service',
      render: (s) => (
        <div className="flex items-center gap-3">
          {s.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.image_url} alt="" className="h-9 w-9 rounded-lg object-cover border border-border" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-card border border-border" />
          )}
          <div>
            <div className="text-white font-medium">{s.name_en}</div>
            <div className="text-[11px] text-muted">{s.name_ur}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (s) => <span>{CATEGORY_LABEL[s.category]}</span> },
    {
      key: 'price',
      header: 'Price',
      render: (s) => (
        <span className="font-mono text-white">{s.price != null ? formatPKR(s.price) : 'Contact for price'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
            s.is_active ? 'bg-ok/15 text-ok border-ok/30' : 'bg-border text-subtle border-border'
          }`}
        >
          {s.is_active ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      className: 'text-right',
      render: (s) => (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => toggleActive(s)}
            title={s.is_active ? 'Disable' : 'Enable'}
            className="p-1.5 rounded-md bg-card border border-border text-subtle hover:text-white"
          >
            {s.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setEditing(s)}
            title="Edit"
            className="p-1.5 rounded-md bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => remove(s)}
            title="Delete"
            className="p-1.5 rounded-md bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Services</h1>
          <p className="text-xs text-subtle mt-1">Manage China Office and Turbine Maintenance services.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg text-xs font-semibold"
        >
          <Plus className="h-4 w-4" /> New Service
        </button>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          Failed to load services: {loadError}
        </div>
      )}

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              tab === t
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'bg-surface text-subtle border-border hover:text-white'
            }`}
          >
            {t === 'all' ? 'All' : CATEGORY_LABEL[t]}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={(s) => s.id}
        searchable={(s) => `${s.name_en} ${s.name_ur}`}
        searchPlaceholder="Search services…"
        emptyText="No services yet."
      />

      {(editing || creating) && (
        <ServiceForm
          service={editing}
          defaultCategory={tab === 'all' ? 'china_office' : tab}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={load}
        />
      )}
    </div>
  );
}
