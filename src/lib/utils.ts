import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatPKR = (n: number | null | undefined) =>
  `Rs ${(typeof n === 'number' ? n : 0).toLocaleString('en-PK')}`;

/**
 * The live `products` table has three drifted English-name columns. `title` is
 * the only one that's populated and correct for every row, so it wins; `name_en`
 * (often misaligned) and `name` (often empty) are fallbacks. Used everywhere a
 * product name is displayed so every screen agrees.
 */
export const resolveProductName = (p: {
  title?: string | null;
  name_en?: string | null;
  name?: string | null;
}): string =>
  (p.title && p.title.trim()) ||
  (p.name_en && p.name_en.trim()) ||
  (p.name && p.name.trim()) ||
  '—';

export const formatDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export const formatDateTime = (d?: string) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Stored as 13 raw digits; display as 35202-1234567-1. */
export const formatCnic = (cnic?: string | null): string => {
  const digits = (cnic ?? '').replace(/\D/g, '');
  if (digits.length !== 13) return cnic ?? '—';
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
};

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
