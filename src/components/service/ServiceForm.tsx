'use client';

import { useEffect, useRef, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { uploadServiceImage } from '@/lib/storage';
import { serviceSchema } from '@/validators/service.schema';
import { Service, ServiceCategory } from '@/types/admin.types';
import { Modal } from '@/components/ui/Modal';
import { MultilingualInput } from '@/components/ui/MultilingualInput';

interface ServiceFormProps {
  service: Service | null;
  defaultCategory: ServiceCategory;
  onClose: () => void;
  onSaved: () => void;
}

type FormState = {
  category: ServiceCategory;
  name_en: string;
  name_ur: string;
  description_en: string;
  description_ur: string;
  image_url: string;
  price: string; // '' = contact for price
  is_active: boolean;
  sort_order: number;
};

const emptyForm = (category: ServiceCategory): FormState => ({
  category,
  name_en: '',
  name_ur: '',
  description_en: '',
  description_ur: '',
  image_url: '',
  price: '',
  is_active: true,
  sort_order: 0,
});

export function ServiceForm({ service, defaultCategory, onClose, onSaved }: ServiceFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm(defaultCategory));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (service) {
      setForm({
        category: service.category,
        name_en: service.name_en,
        name_ur: service.name_ur,
        description_en: service.description_en ?? '',
        description_ur: service.description_ur ?? '',
        image_url: service.image_url ?? '',
        price: service.price != null ? String(service.price) : '',
        is_active: service.is_active,
        sort_order: service.sort_order,
      });
    } else {
      setForm(emptyForm(defaultCategory));
    }
  }, [service, defaultCategory]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadServiceImage(file, service?.image_url ?? undefined);
      set({ image_url: url });
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const parsed = serviceSchema.safeParse({
      ...form,
      price: form.price.trim() === '' ? null : Number(form.price),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...parsed.data, image_url: parsed.data.image_url || null };
      if (service) {
        const { error } = await supabase.from('services').update(payload).eq('id', service.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(payload);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      open
      onClose={onClose}
      title={service ? 'Edit Service' : 'New Service'}
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
            {saving ? 'Saving…' : 'Save Service'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
        )}

        <div>
          <label className="block text-xs font-medium text-subtle mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => set({ category: e.target.value as ServiceCategory })}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="china_office">China Office Services</option>
            <option value="turbine_maintenance">Turbine Maintenance Services</option>
          </select>
        </div>

        <MultilingualInput
          label="Service Name"
          required
          valueEn={form.name_en}
          valueUr={form.name_ur}
          onChangeEn={(v) => set({ name_en: v })}
          onChangeUr={(v) => set({ name_ur: v })}
        />

        <MultilingualInput
          label="Description"
          multiline
          valueEn={form.description_en}
          valueUr={form.description_ur}
          onChangeEn={(v) => set({ description_en: v })}
          onChangeUr={(v) => set({ description_ur: v })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Price (PKR)</label>
            <input
              type="number"
              min={0}
              value={form.price}
              placeholder="Leave blank for “contact for price”"
              onChange={(e) => set({ price: e.target.value })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Sort Order</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set({ sort_order: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs text-subtle">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set({ is_active: e.target.checked })}
              />
              Active (visible to shopkeepers/customers)
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-subtle mb-1">Service Image</label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg bg-bg border border-border overflow-hidden flex items-center justify-center">
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="service" className="object-cover w-full h-full" />
              ) : (
                <span className="text-[10px] text-muted">none</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-subtle rounded-lg text-xs disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Uploading…' : 'Upload / Replace'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
