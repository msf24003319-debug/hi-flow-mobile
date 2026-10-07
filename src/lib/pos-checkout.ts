import { supabase } from './supabase-client';
import { errorMessage } from './pos';

export interface CheckoutSnapshot {
  id: string; buyerId: string; accountId: string | null;
  accountType: 'customer' | 'shopkeeper'; accountName: string;
  subtotal: number; discount: number; net: number; payment: string;
  items: { id: string; product_id: string; qty: number; price: number; product_title_snapshot: string }[];
}

/** Used only when PostgREST reports an absent RPC, never for RPC execution errors. */
export async function insertCheckout(snapshot: CheckoutSnapshot): Promise<string> {
  const s = snapshot;
  const existing = await supabase.from('orders').select('id,status,invoice_number').eq('id', s.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const { error } = await supabase.from('orders').insert({
      id: s.id, buyer_id: s.buyerId, fulfillment_type: 'pickup', status: 'pending',
      invoice_number: `POS-${s.id}`, account_id: s.accountId, account_type: s.accountType,
      account_name_snapshot: s.accountName, total: s.net, total_amount: s.subtotal,
      discount: s.discount, net_amount: s.net, payment_method: s.payment, image_urls: [],
    });
    if (error && error.code !== '23505') throw error;
    if (error) {
      const check = await supabase.from('orders').select('invoice_number').eq('id', s.id).single();
      if (check.error || check.data.invoice_number !== `POS-${s.id}`) throw error;
    }
  } else if (existing.data.invoice_number !== `POS-${s.id}`) {
    throw new Error('Order ID belongs to a different invoice. Checkout stopped.');
  }

  const saved = await supabase.from('order_items').select('id,product_id,qty,price').eq('order_id', s.id);
  if (saved.error) throw saved.error;
  const expected = new Map(s.items.map(item => [item.id, item]));
  for (const row of saved.data ?? []) {
    const item = expected.get(row.id);
    if (!item || row.product_id !== item.product_id || Number(row.qty) !== item.qty || Number(row.price) !== item.price) {
      throw new Error('Invoice already contains different line items. Review it in Billing History.');
    }
  }
  const savedIds = new Set((saved.data ?? []).map(row => row.id));
  const missing = s.items.filter(item => !savedIds.has(item.id));
  if (missing.length) {
    // Canonical columns are retained. Required legacy aliases are filled only when
    // a failed (atomic) batch reports a NOT NULL alias; generated columns stay omitted.
    let payload = missing.map(item => ({ ...item, order_id: s.id, customer_note: '' } as Record<string, unknown>));
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('order_items').insert(payload);
      if (!error) break;
      const alias = /null value in column "([^"]+)"/.exec(error.message)?.[1];
      if (error.code !== '23502' || !alias || !['quantity', 'unit_price', 'total_price', 'product_title'].includes(alias) || attempt === 4) throw error;
      payload = payload.map(row => ({ ...row, [alias]: alias === 'quantity' ? row.qty
        : alias === 'unit_price' ? row.price : alias === 'product_title' ? row.product_title_snapshot
        : Number(row.qty) * Number(row.price) }));
    }
  }
  const { data, error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', s.id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Order was not finalized. Check administrator update permissions.');
  return data.id;
}

export async function completeCheckout(snapshot: CheckoutSnapshot): Promise<string> {
  const s = snapshot;
  const { data, error } = await supabase.rpc('pos_complete_checkout', {
    p_request_id: s.id, p_account_id: s.accountId, p_account_type: s.accountType,
    p_total_amount: s.subtotal, p_discount: s.discount, p_net_amount: s.net,
    p_payment_method: s.payment, p_image_urls: [],
    p_cart: s.items.map(item => ({ product_id: item.product_id, qty: item.qty })),
  });
  if (error?.code === 'PGRST202' || error?.code === 'PZ001') {
    console.warn('Using resumable table inserts for an unavailable RPC or a pending fallback invoice.');
    return insertCheckout(s);
  }
  if (error) throw Object.assign(new Error(errorMessage(error)), {
    // A PostgreSQL error rolls back the RPC transaction; its cart can be edited.
    canEdit: /^[0-9A-Z]{5}$/.test(error.code ?? '') && !error.code.startsWith('PGRST'),
  });
  if (data !== s.id) throw new Error('Checkout returned an unexpected invoice ID. Review Billing History before retrying.');
  return data;
}
