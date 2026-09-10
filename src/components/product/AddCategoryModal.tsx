'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Category } from '@/types/admin.types';
import { categorySchema } from '@/validators/category.schema';
import { Modal } from '@/components/ui/Modal';

interface AddCategoryModalProps {
  /** sort_order to assign the new row — usually max(existing) + 1. */
  nextSortOrder: number;
  onClose: () => void;
  /** Called with the freshly inserted row so the caller can merge + select it. */
  onCreated: (category: Category) => void;
}

export function AddCategoryModal({ nextSortOrder, onClose, onCreated }: AddCategoryModalProps) {
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = categorySchema.safeParse({ name, name_ur: nameUr });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // RLS: "Admin modify categories" (FOR ALL USING is_admin()) already
      // permits this insert for admin sessions — no extra policy needed.
      // Live DB column is `name` (English), not `name_en`.
      const { data, error: err } = await supabase
        .from('categories')
        .insert({ ...parsed.data, sort_order: nextSortOrder })
        .select('id, name, name_ur, parent_id, sort_order')
        .single();
      if (err) throw err;
      onCreated(data as Category);
    } catch (e: any) {
      setError(e.message || 'Could not create the category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Category"
      subtitle="Added to the category list right away."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-card text-subtle rounded-lg text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Add Category'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
        )}
        <div>
          <label className="block text-xs font-medium text-subtle mb-1">
            Category Name (English) <span className="text-danger">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Turbine Parts"
            autoFocus
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-subtle mb-1">
            Category Name (Urdu) <span className="text-danger">*</span>
          </label>
          <input
            value={nameUr}
            onChange={(e) => setNameUr(e.target.value)}
            dir="rtl"
            placeholder="مثلاً ٹربائن پرزہ جات"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>
    </Modal>
  );
}
