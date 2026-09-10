'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { Plus, Edit2, Power } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Division, District, Tehsil, Area, Station } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationForm, LocationField } from '@/components/location/LocationForm';

type TabKey = 'divisions' | 'districts' | 'tehsils' | 'areas' | 'stations';
const TABS: { key: TabKey; label: string; singular: string }[] = [
  { key: 'divisions', label: 'Divisions', singular: 'Division' },
  { key: 'districts', label: 'Districts', singular: 'District' },
  { key: 'tehsils', label: 'Tehsils', singular: 'Tehsil' },
  { key: 'areas', label: 'Areas', singular: 'Area' },
  { key: 'stations', label: 'Ada / Bus Stations', singular: 'Station' },
];

function VerifyBadge({ v }: { v: boolean }) {
  return v ? (
    <span className="text-[10px] font-bold uppercase text-warn bg-warn/15 border border-warn/30 rounded-full px-2 py-0.5">
      verify
    </span>
  ) : (
    <span className="text-muted">—</span>
  );
}

interface SectionProps<T extends { id: string; is_active: boolean }> {
  table: TabKey;
  singular: string;
  rows: T[];
  loading: boolean;
  refetch: () => void;
  columns: Column<T>[];
  fields: LocationField[];
  searchable: (r: T) => string;
}

function Section<T extends { id: string; is_active: boolean }>({
  table,
  singular,
  rows,
  loading,
  refetch,
  columns,
  fields,
  searchable,
}: SectionProps<T>) {
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async (r: T) => {
    const { error } = await supabase.from(table).update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) alert(error.message);
    else refetch();
  };

  const allColumns: Column<T>[] = [
    ...columns,
    { key: 'active', header: 'Active', render: (r) => <StatusBadge status={r.is_active ? 'approved' : 'hidden'} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setEditing(r);
              setOpen(true);
            }}
            className="p-1.5 text-subtle hover:text-white hover:bg-card rounded-lg"
            title="Edit"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => toggle(r)}
            className={`p-1.5 rounded-lg hover:bg-card ${r.is_active ? 'text-ok' : 'text-muted'}`}
            title={r.is_active ? 'Deactivate' : 'Activate'}
          >
            <Power className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg text-xs font-semibold"
        >
          <Plus className="h-4 w-4" /> New {singular}
        </button>
      </div>

      <DataTable
        columns={allColumns}
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        searchable={searchable}
        emptyText={`No ${singular.toLowerCase()}s yet.`}
      />

      {open && (
        <LocationForm
          table={table}
          title={singular}
          fields={fields}
          row={editing}
          onClose={() => setOpen(false)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export default function LocationsPage() {
  const [tab, setTab] = useState<TabKey>('divisions');

  const divisions = useSupabaseData<Division>('divisions', { order: { column: 'sort_order' } });
  const districts = useSupabaseData<District>('districts', { order: { column: 'name' } });
  const tehsils = useSupabaseData<Tehsil>('tehsils', { order: { column: 'name' } });
  const areas = useSupabaseData<Area>('areas', { order: { column: 'name' } });
  const stations = useSupabaseData<Station>('stations', { order: { column: 'name' } });

  const nameOf = (list: { id: string; name: string }[], id?: string | null) =>
    list.find((x) => x.id === id)?.name ?? '—';

  const divisionOpts = useMemo(
    () => divisions.data.map((d) => ({ value: d.id, label: d.name })),
    [divisions.data]
  );
  const districtOpts = useMemo(
    () => districts.data.map((d) => ({ value: d.id, label: `${d.name} (${nameOf(divisions.data, d.division_id)})` })),
    [districts.data, divisions.data]
  );
  const tehsilOpts = useMemo(
    () => tehsils.data.map((t) => ({ value: t.id, label: `${t.name} (${nameOf(districts.data, t.district_id)})` })),
    [tehsils.data, districts.data]
  );
  const areaOpts = useMemo(
    () => areas.data.map((a) => ({ value: a.id, label: `${a.name} (${nameOf(tehsils.data, a.tehsil_id)})` })),
    [areas.data, tehsils.data]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Location Management</h1>
        <p className="text-xs text-subtle mt-1">
          South Punjab delivery areas & Ada / Bus Stations. One source of truth for the mobile app.
          Rows marked <span className="text-warn font-semibold">verify</span> need a coordinate/detail check.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              tab === tb.key ? 'bg-brand text-bg' : 'bg-card text-subtle border border-border'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'divisions' && (
        <Section<Division>
          table="divisions"
          singular="Division"
          rows={divisions.data}
          loading={divisions.loading}
          refetch={divisions.refetch}
          searchable={(r) => `${r.name} ${r.province}`}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="text-white font-medium">{r.name}</span> },
            { key: 'province', header: 'Province', render: (r) => r.province },
            { key: 'order', header: 'Order', render: (r) => r.sort_order },
            { key: 'verify', header: 'Verify', render: (r) => <VerifyBadge v={r.needs_verification} /> },
          ]}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'province', label: 'Province', type: 'text', required: true },
            { key: 'sort_order', label: 'Sort order', type: 'number' },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
            { key: 'needs_verification', label: 'Needs verification', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'districts' && (
        <Section<District>
          table="districts"
          singular="District"
          rows={districts.data}
          loading={districts.loading}
          refetch={districts.refetch}
          searchable={(r) => `${r.name} ${nameOf(divisions.data, r.division_id)}`}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="text-white font-medium">{r.name}</span> },
            { key: 'division', header: 'Division', render: (r) => nameOf(divisions.data, r.division_id) },
            { key: 'verify', header: 'Verify', render: (r) => <VerifyBadge v={r.needs_verification} /> },
          ]}
          fields={[
            { key: 'division_id', label: 'Division', type: 'select', required: true, options: divisionOpts },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
            { key: 'needs_verification', label: 'Needs verification', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'tehsils' && (
        <Section<Tehsil>
          table="tehsils"
          singular="Tehsil"
          rows={tehsils.data}
          loading={tehsils.loading}
          refetch={tehsils.refetch}
          searchable={(r) => `${r.name} ${nameOf(districts.data, r.district_id)}`}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="text-white font-medium">{r.name}</span> },
            { key: 'district', header: 'District', render: (r) => nameOf(districts.data, r.district_id) },
            { key: 'verify', header: 'Verify', render: (r) => <VerifyBadge v={r.needs_verification} /> },
          ]}
          fields={[
            { key: 'district_id', label: 'District', type: 'select', required: true, options: districtOpts },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
            { key: 'needs_verification', label: 'Needs verification', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'areas' && (
        <Section<Area>
          table="areas"
          singular="Area"
          rows={areas.data}
          loading={areas.loading}
          refetch={areas.refetch}
          searchable={(r) => `${r.name} ${nameOf(tehsils.data, r.tehsil_id)}`}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="text-white font-medium">{r.name}</span> },
            { key: 'tehsil', header: 'Tehsil', render: (r) => nameOf(tehsils.data, r.tehsil_id) },
            {
              key: 'coords',
              header: 'Lat, Lng',
              render: (r) =>
                r.latitude != null ? (
                  <span className="font-mono text-[11px]">
                    {r.latitude}, {r.longitude}
                  </span>
                ) : (
                  <span className="text-warn">missing</span>
                ),
            },
            { key: 'verify', header: 'Verify', render: (r) => <VerifyBadge v={r.needs_verification} /> },
          ]}
          fields={[
            { key: 'tehsil_id', label: 'Tehsil', type: 'select', required: true, options: tehsilOpts },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'latitude', label: 'Latitude', type: 'number' },
            { key: 'longitude', label: 'Longitude', type: 'number' },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
            { key: 'needs_verification', label: 'Needs verification', type: 'checkbox' },
          ]}
        />
      )}

      {tab === 'stations' && (
        <Section<Station>
          table="stations"
          singular="Station"
          rows={stations.data}
          loading={stations.loading}
          refetch={stations.refetch}
          searchable={(r) => `${r.name} ${r.address ?? ''} ${nameOf(districts.data, r.district_id)}`}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="text-white font-medium">{r.name}</span> },
            { key: 'address', header: 'Address', render: (r) => r.address ?? '—' },
            { key: 'district', header: 'District', render: (r) => nameOf(districts.data, r.district_id) },
            { key: 'area', header: 'Area', render: (r) => nameOf(areas.data, r.area_id) },
            {
              key: 'coords',
              header: 'Lat, Lng',
              render: (r) =>
                r.latitude != null ? (
                  <span className="font-mono text-[11px]">
                    {r.latitude}, {r.longitude}
                  </span>
                ) : (
                  <span className="text-warn">missing</span>
                ),
            },
            { key: 'verify', header: 'Verify', render: (r) => <VerifyBadge v={r.needs_verification} /> },
          ]}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'address', label: 'Address', type: 'text' },
            { key: 'district_id', label: 'District', type: 'select', required: true, options: districtOpts },
            { key: 'tehsil_id', label: 'Tehsil (optional)', type: 'select', options: tehsilOpts },
            { key: 'area_id', label: 'Area (optional)', type: 'select', options: areaOpts },
            { key: 'latitude', label: 'Latitude', type: 'number' },
            { key: 'longitude', label: 'Longitude', type: 'number' },
            { key: 'is_active', label: 'Active', type: 'checkbox' },
            { key: 'needs_verification', label: 'Needs verification', type: 'checkbox' },
          ]}
        />
      )}
    </div>
  );
}
