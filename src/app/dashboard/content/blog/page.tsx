'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { BlogPost } from '@/types/admin.types';
import { blogSchema } from '@/validators/content.schema';
import { MultilingualInput } from '@/components/ui/MultilingualInput';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';

const empty = {
  title_en: '',
  title_ur: '',
  content_en: '',
  content_ur: '',
  image_url: '',
  is_published: false,
};

export default function BlogContentPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    setPosts((data as BlogPost[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setError(null);
    setOpen(true);
  };

  const openEdit = (p: BlogPost) => {
    setEditing(p);
    setForm({
      title_en: p.title_en,
      title_ur: p.title_ur,
      content_en: p.content_en,
      content_ur: p.content_ur,
      image_url: p.image_url ?? '',
      is_published: p.is_published,
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const parsed = blogSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const payload = {
      ...parsed.data,
      image_url: parsed.data.image_url || null,
      published_at: parsed.data.is_published ? new Date().toISOString() : null,
    };
    const { error } = editing
      ? await supabase.from('blog_posts').update(payload).eq('id', editing.id)
      : await supabase.from('blog_posts').insert(payload);
    setSaving(false);
    if (error) setError(error.message);
    else {
      setOpen(false);
      load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    await supabase.from('blog_posts').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Blog</h1>
          <p className="text-xs text-subtle mt-1">Bilingual articles shown in the mobile app.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg text-xs font-semibold"
        >
          <Plus className="h-4 w-4" /> New Post
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <div
              key={p.id}
              className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-white font-medium text-sm">{p.title_en}</p>
                <p className="text-[11px] text-muted">{formatDate(p.published_at ?? p.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={p.is_published ? 'approved' : 'new'} />
                <button onClick={() => openEdit(p)} className="text-xs text-brand font-semibold">
                  Edit
                </button>
                <button onClick={() => remove(p.id)} className="text-muted hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal
          wide
          open
          onClose={() => setOpen(false)}
          title={editing ? 'Edit Post' : 'New Post'}
          footer={
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          }
        >
          <div className="space-y-5">
            {error && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">{error}</div>
            )}
            <MultilingualInput
              label="Title"
              required
              valueEn={form.title_en}
              valueUr={form.title_ur}
              onChangeEn={(v) => setForm((f) => ({ ...f, title_en: v }))}
              onChangeUr={(v) => setForm((f) => ({ ...f, title_ur: v }))}
            />
            <MultilingualInput
              label="Content"
              required
              multiline
              valueEn={form.content_en}
              valueUr={form.content_ur}
              onChangeEn={(v) => setForm((f) => ({ ...f, content_en: v }))}
              onChangeUr={(v) => setForm((f) => ({ ...f, content_ur: v }))}
            />
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Image URL (optional)</label>
              <input
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-subtle">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              />
              Published (visible in the app)
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
