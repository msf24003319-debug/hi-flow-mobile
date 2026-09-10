'use client';

import { ReactNode, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  emptyText?: string;
  rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  searchable,
  searchPlaceholder = 'Search…',
  emptyText = 'No records found.',
  rowKey,
}: DataTableProps<T>) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q || !searchable) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => searchable(r).toLowerCase().includes(needle));
  }, [q, rows, searchable]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-bg border border-border rounded-lg text-xs text-white placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-card border-b border-border text-muted text-[11px] font-semibold uppercase tracking-wider">
              {columns.map((c) => (
                <th key={c.key} className={`py-3 px-4 ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs text-subtle">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-muted">
                  <div className="h-5 w-5 border-2 border-border border-t-brand rounded-full animate-spin mx-auto mb-2" />
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-muted">
                  {emptyText}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-card/60 transition">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-3.5 px-4 ${c.className ?? ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
