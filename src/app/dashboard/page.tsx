'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import {
  UserCheck,
  ShoppingCart,
  Zap,
  Store,
  MessageSquare,
  Star,
  ClipboardList,
  Boxes,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { InventorySummary } from '@/types/admin.types';

interface Kpis {
  pendingShopkeepers: number;
  openOrders: number;
  newInquiries: number;
  newLeads: number;
  unreadFeedback: number;
  pendingReviews: number;
  pendingServiceRequests: number;
}

const CARDS = [
  { key: 'pendingShopkeepers', label: 'Pending Approvals', href: '/dashboard/shopkeepers', icon: UserCheck },
  { key: 'openOrders', label: 'Orders To Process', href: '/dashboard/orders', icon: ShoppingCart },
  {
    key: 'pendingServiceRequests',
    label: 'Pending Service Requests',
    href: '/dashboard/service-requests',
    icon: ClipboardList,
  },
  { key: 'newInquiries', label: 'New Motor Inquiries', href: '/dashboard/motor-inquiries', icon: Zap },
  { key: 'newLeads', label: 'New Franchise Leads', href: '/dashboard/franchise-leads', icon: Store },
  { key: 'unreadFeedback', label: 'Unread Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { key: 'pendingReviews', label: 'Reviews To Moderate', href: '/dashboard/reviews', icon: Star },
] as const;

export default function OverviewPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc('get_inventory_summary')
      .then(({ data, error }) => {
        if (error) {
          console.error('[OverviewPage] Inventory summary failed:', error);
          return;
        }
        // get_inventory_summary() returns a single object, not an array of one.
        setInventory((Array.isArray(data) ? data[0] : data) as InventorySummary ?? null);
      });
  }, []);

  useEffect(() => {
    (async () => {
      const count = (label: string, q: any) =>
        q.then((r: any) => {
          if (r.error) {
            console.error(`[OverviewPage] ${label} count failed:`, r.error);
            setLoadError((prev) => prev ?? `Failed to load "${label}": ${r.error.message}`);
            return 0;
          }
          return r.count ?? 0;
        });
      const [
        pendingShopkeepers,
        openOrders,
        pendingServiceRequests,
        newInquiries,
        newLeads,
        unreadFeedback,
        pendingReviews,
      ] = await Promise.all([
        count(
          'Pending Approvals',
          supabase.from('shopkeepers').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        ),
        count(
          'Orders To Process',
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'confirmed', 'dispatched'])
        ),
        count(
          'Pending Service Requests',
          supabase
            .from('service_requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'accepted', 'in_progress'])
        ),
        count(
          'New Motor Inquiries',
          supabase.from('motor_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'Submitted')
        ),
        count(
          'New Franchise Leads',
          supabase.from('franchise_leads').select('id', { count: 'exact', head: true }).eq('status', 'new')
        ),
        count(
          'Unread Feedback',
          supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('is_read', false)
        ),
        count(
          'Reviews To Moderate',
          supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        ),
      ]);
      setKpis({
        pendingShopkeepers,
        openOrders,
        pendingServiceRequests,
        newInquiries,
        newLeads,
        unreadFeedback,
        pendingReviews,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
        <p className="text-xs text-subtle mt-1">Everything that needs your attention right now.</p>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          {loadError} — check the browser console for the rest.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          const value = kpis ? kpis[c.key] : null;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="bg-surface border border-border rounded-xl p-5 hover:border-brand/40 transition flex items-center justify-between"
            >
              <div>
                <p className="text-xs text-subtle font-medium">{c.label}</p>
                <p className="text-3xl font-black text-white mt-2">
                  {value === null ? '—' : value}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                <Icon className="h-5 w-5 text-brand" />
              </div>
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm font-bold text-white tracking-tight">Inventory</h2>
        <p className="text-xs text-subtle mt-1">Stock health across the catalog.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/dashboard/products/inventory"
          className="bg-surface border border-border rounded-xl p-5 hover:border-brand/40 transition flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-subtle font-medium">In Stock Products</p>
            <p className="text-3xl font-black text-white mt-2">
              {inventory ? inventory.in_stock_count : '—'}
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center">
            <Boxes className="h-5 w-5 text-info" />
          </div>
        </Link>
        <Link
          href="/dashboard/products/inventory"
          className="bg-surface border border-border rounded-xl p-5 hover:border-warn/40 transition flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-subtle font-medium">Low Stock Products</p>
            <p className="text-3xl font-black text-white mt-2">
              {inventory ? inventory.low_stock_count : '—'}
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-warn/10 border border-warn/20 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-warn" />
          </div>
        </Link>
        <Link
          href="/dashboard/products/inventory"
          className="bg-surface border border-border rounded-xl p-5 hover:border-danger/40 transition flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-subtle font-medium">Out of Stock Products</p>
            <p className="text-3xl font-black text-white mt-2">
              {inventory ? inventory.out_of_stock_count : '—'}
            </p>
          </div>
          <div className="h-11 w-11 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center">
            <XCircle className="h-5 w-5 text-danger" />
          </div>
        </Link>
      </div>
    </div>
  );
}
