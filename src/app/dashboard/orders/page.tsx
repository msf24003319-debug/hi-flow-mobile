'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { Order } from '@/types/admin.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { OrderStatusUpdater } from '@/components/order/OrderStatusUpdater';
import { formatPKR, formatDate, formatDateTime } from '@/lib/utils';

function buyerInfo(order: Order): { name: string; phone: string; role: 'Shopkeeper' | 'Customer' | 'Unknown' } {
  const shop = order.buyer?.shopkeepers;
  const cust = order.buyer?.customers;
  if (shop) return { name: shop.shop_name || shop.name, phone: shop.phone, role: 'Shopkeeper' };
  if (cust) return { name: cust.name, phone: cust.phone, role: 'Customer' };
  return { name: '—', phone: '', role: 'Unknown' };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('orders')
      .select(
        `*,
         buyer:profiles!orders_buyer_id_fkey(shopkeepers(name, shop_name, phone, area), customers(name, phone)),
         pickup_location:pickup_locations(*),
         items:order_items(*, product:products(name_en, name_ur, image_url)),
         status_history:order_status_history(*)`
      )
      .order('created_at', { ascending: false });
    if (error) setLoadError(error.message);
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<Order>[] = [
    {
      key: 'num',
      header: 'Order',
      render: (o) => (
        <div>
          <div className="text-white font-mono font-semibold">{o.order_number ?? `#${o.id.slice(0, 8)}`}</div>
          <div className="text-[11px] text-muted">{formatDate(o.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      render: (o) => {
        const b = buyerInfo(o);
        return (
          <div>
            <div className="text-white flex items-center gap-1.5">
              {b.name}
              <span className="text-[9px] uppercase font-bold text-brand bg-brand/10 border border-brand/30 rounded px-1.5 py-0.5">
                {b.role}
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono">{b.phone}</div>
          </div>
        );
      },
    },
    {
      key: 'ful',
      header: 'Fulfilment',
      render: (o) => <span className="capitalize">{o.fulfillment_type}</span>,
    },
    { key: 'total', header: 'Total', render: (o) => <span className="font-mono text-white">{formatPKR(o.total)}</span> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'act',
      header: '',
      className: 'text-right',
      render: (o) => (
        <button
          onClick={() => setSelected(o)}
          className="inline-flex items-center gap-1.5 bg-brand/10 text-brand border border-brand/30 text-xs px-3 py-1.5 rounded-md font-semibold"
        >
          <Eye className="w-3.5 h-3.5" /> Manage
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Orders</h1>
        <p className="text-xs text-subtle mt-1">Process orders and move them through fulfilment.</p>
      </div>

      {loadError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs text-danger">
          Failed to load orders: {loadError}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={orders}
        loading={loading}
        rowKey={(o) => o.id}
        searchable={(o) => `${o.order_number ?? ''} ${buyerInfo(o).name} ${buyerInfo(o).phone}`}
        searchPlaceholder="Search order #, buyer, phone…"
        emptyText="No orders yet."
      />

      {selected && (
        <Modal
          wide
          open
          onClose={() => setSelected(null)}
          title={`Order ${selected.order_number ?? ''}`}
          subtitle={buyerInfo(selected).name}
        >
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-bg border border-border rounded-lg p-4">
              <div>
                <p className="text-muted">Buyer ({buyerInfo(selected).role})</p>
                <p className="text-white font-medium">{buyerInfo(selected).name}</p>
                <p className="text-subtle font-mono">{buyerInfo(selected).phone}</p>
              </div>
              <div>
                <p className="text-muted">Fulfilment</p>
                <p className="text-white capitalize">{selected.fulfillment_type}</p>
                {selected.delivery_address ? (
                  <p className="text-subtle mt-1">Landmark: {selected.delivery_address}</p>
                ) : null}
              </div>
            </div>

            {/* Delivery / Collection Location */}
            {selected.location_snapshot ? (
              <div className="bg-bg border border-border rounded-lg p-4">
                <p className="font-semibold text-white mb-2">Delivery / Collection Location</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted block">Division</span>
                    {selected.location_snapshot.division}
                  </div>
                  <div>
                    <span className="text-muted block">District</span>
                    {selected.location_snapshot.district}
                  </div>
                  <div>
                    <span className="text-muted block">Tehsil</span>
                    {selected.location_snapshot.tehsil}
                  </div>
                  <div>
                    <span className="text-muted block">Area</span>
                    {selected.location_snapshot.area}
                  </div>
                </div>
                <div className="mt-3 bg-brand/10 border border-brand/30 rounded p-2 flex items-center justify-between">
                  <div>
                    <p className="text-brand font-bold text-[11px]">SELECTED ADA / BUS STATION</p>
                    <p className="text-white mt-0.5">{selected.location_snapshot.station?.name}</p>
                    {selected.location_snapshot.station?.address ? (
                      <p className="text-subtle text-[11px]">{selected.location_snapshot.station.address}</p>
                    ) : null}
                  </div>
                  {selected.location_snapshot.distance_km != null ? (
                    <span className="text-brand font-mono font-bold">
                      {selected.location_snapshot.distance_km} km
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="bg-bg border border-border rounded-lg p-4 text-muted">
                No structured location — legacy order.
              </div>
            )}

            <div>
              <p className="font-semibold text-white mb-2">Items</p>
              <div className="space-y-2">
                {selected.items?.map((it) => (
                  <div key={it.id} className="bg-bg border border-border rounded-lg p-3">
                    <div className="flex justify-between">
                      <span className="text-white">
                        {it.qty} × {it.product?.name_en}
                      </span>
                      <span className="font-mono text-white">{formatPKR(it.price * it.qty)}</span>
                    </div>
                    {it.customer_note?.trim() && (
                      <div className="mt-2 bg-brand/10 border border-brand/30 rounded p-2">
                        <p className="text-brand font-bold text-[11px]">★ CUSTOMER NOTE</p>
                        <p className="text-white mt-0.5">{it.customer_note}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border mt-3 pt-2">
                <span className="text-muted font-semibold">Total</span>
                <span className="font-mono text-brand font-bold">{formatPKR(selected.total)}</span>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-semibold text-white mb-2">Update status</p>
              <OrderStatusUpdater
                orderId={selected.id}
                current={selected.status}
                onUpdated={() => {
                  setSelected(null);
                  load();
                }}
              />
            </div>

            {selected.status_history && selected.status_history.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="font-semibold text-white mb-2">History</p>
                {[...selected.status_history]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((h) => (
                    <div key={h.id} className="flex justify-between py-1 text-subtle">
                      <span className="capitalize">{h.status.replace(/_/g, ' ')}</span>
                      <span className="text-muted">{formatDateTime(h.created_at)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
