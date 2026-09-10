'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { ProductReview, ReviewStatus } from '@/types/admin.types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { formatDate } from '@/lib/utils';

const FILTERS: (ReviewStatus | 'all')[] = ['pending', 'approved', 'rejected', 'hidden', 'all'];

function reviewerInfo(r: ProductReview): { name: string; role: 'Shopkeeper' | 'Customer' | 'Unknown' } {
  const shop = r.buyer?.shopkeepers;
  const cust = r.buyer?.customers;
  if (shop) return { name: shop.shop_name || shop.name, role: 'Shopkeeper' };
  if (cust) return { name: cust.name, role: 'Customer' };
  return { name: '—', role: 'Unknown' };
}

export default function ReviewsPage() {
  const [rows, setRows] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('pending');
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('product_reviews')
      .select(
        `*,
         product:products(name_en, name_ur),
         buyer:profiles!product_reviews_buyer_id_fkey(shopkeepers(name, shop_name), customers(name))`
      )
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    setRows((data as ProductReview[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, status: ReviewStatus) => {
    await supabase.from('product_reviews').update({ status }).eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Review Moderation</h1>
        <p className="text-xs text-subtle mt-1">
          Approve, reject or hide product ratings. Averages recompute automatically.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
              filter === f ? 'bg-brand text-bg' : 'bg-card text-subtle border border-border'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted">No reviews.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-brand">{'★'.repeat(r.rating)}</span>
                    <span className="text-white font-medium text-sm">{r.product?.name_en}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.comment_ur && <p className="text-subtle text-sm mt-2" dir="auto">{r.comment_ur}</p>}
                  {r.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image_url}
                      alt="review"
                      onClick={() => setPreview(r.image_url!)}
                      className="h-20 w-20 object-cover rounded-lg mt-2 cursor-zoom-in border border-border"
                    />
                  )}
                  <p className="text-[11px] text-muted mt-2">
                    {reviewerInfo(r).name} · {reviewerInfo(r).role} · {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {r.status !== 'approved' && (
                    <button
                      onClick={() => moderate(r.id, 'approved')}
                      className="text-xs bg-ok text-bg px-3 py-1.5 rounded-md font-semibold"
                    >
                      Approve
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      onClick={() => moderate(r.id, 'rejected')}
                      className="text-xs bg-danger/10 text-danger border border-danger/30 px-3 py-1.5 rounded-md font-semibold"
                    >
                      Reject
                    </button>
                  )}
                  {r.status !== 'hidden' && (
                    <button
                      onClick={() => moderate(r.id, 'hidden')}
                      className="text-xs bg-card text-subtle border border-border px-3 py-1.5 rounded-md font-semibold"
                    >
                      Hide
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImagePreviewModal src={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
