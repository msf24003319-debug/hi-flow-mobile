'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { MultilingualInput } from '@/components/ui/MultilingualInput';

export default function AboutContentPage() {
  const [en, setEn] = useState('');
  const [ur, setUr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('site_content').select('*').eq('key', 'about').maybeSingle();
      setEn(data?.body_en ?? '');
      setUr(data?.body_ur ?? '');
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('site_content')
      .upsert({ key: 'about', body_en: en, body_ur: ur });
    setSaving(false);
    setMsg(error ? error.message : 'Saved.');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">About Page</h1>
        <p className="text-xs text-subtle mt-1">Shown on the mobile app "About Hi Flow" screen.</p>
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : (
        <>
          <MultilingualInput
            label="About text"
            multiline
            valueEn={en}
            valueUr={ur}
            onChangeEn={setEn}
            onChangeUr={setUr}
          />
          {msg && <p className="text-xs text-ok">{msg}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand text-bg rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save About'}
          </button>
        </>
      )}
    </div>
  );
}
