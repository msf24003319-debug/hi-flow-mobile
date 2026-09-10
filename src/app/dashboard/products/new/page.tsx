'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Category } from '@/types/admin.types';
import { ProductForm } from '@/components/product/ProductForm';

export default function NewProductPage() {
  const router = useRouter();
  const { data: categories, refetch: refetchCategories } = useSupabaseData<Category>('categories', {
    select: 'id, name, name_ur, parent_id, sort_order',
    order: { column: 'sort_order' },
  });

  return (
    <ProductForm
      product={null}
      categories={categories}
      onClose={() => router.push('/dashboard/products')}
      onSaved={() => router.push('/dashboard/products')}
      onCategoryAdded={refetchCategories}
    />
  );
}
