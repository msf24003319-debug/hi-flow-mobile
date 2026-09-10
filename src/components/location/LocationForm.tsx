'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Modal } from '@/components/ui/Modal';

export type LocationField =
  | { key: string; label: string; type: 'text'; required?: boolean }
  | { key: string; label: string; type: 'number'; required?: boolean; step?: string }
  | { key: string; label: string; type: 'select'; required?: boolean; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'checkbox' };

interface LocationFormProps {
  table: string;
  title: string;
  fields: LocationField[];
  /** existing row (edit) or null (create) */
  row: Record<string, any> | null;
  defaults?: Record<string, any>;
  onClose: () => void;
  onSaved: () => void;
}

export function LocationForm({ table, title, fields, row, defaults, onClose, onSaved }: LocationFormProps) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base: Record<string, any> = { is_active: true, needs_verification: false, ...defaults };
    fields.forEach((f) => {
      if (f.type === 'checkbox') base[f.key] = row ? !!row[f.key] : base[f.key] ?? false;
      else base[f.key] = row ? (row[f.key] ?? '') : base[f.key] ?? '';
    });
    setForm(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    for (const f of fields) {
      if ('required' in f && f.required && (form[f.key] === '' || form[f.key] == null)) {
        setError(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, any> = {};
      fields.forEach((f) => {
        let v = form[f.key];
        if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
        if (f.type === 'select' && v === '') v = null;
        payload[f.key] = v;
      });

      const { error: err } = row
        ? await supabase.from(table).update(payload).eq('id', row.id)
        : await supabase.from(table).insert(payload);
      if (err) throw err;
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand';

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${title}` : `New ${title}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            {f.type !== 'checkbox' && (
              <label className="block text-xs font-medium text-subtle mb-1">
                {f.label} {'required' in f && f.required && <span className="text-danger">*</span>}
              </label>
            )}
            {f.type === 'text' && (
              <input value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={inputCls} />
            )}
            {f.type === 'number' && (
              <input
                type="number"
                step={f.step ?? 'any'}
                value={form[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                className={inputCls}
              />
            )}
            {f.type === 'select' && (
              <select value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className={inputCls}>
                <option value="">— select —</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {f.type === 'checkbox' && (
              <label className="flex items-center gap-2 text-xs text-subtle">
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                {f.label}
              </label>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
