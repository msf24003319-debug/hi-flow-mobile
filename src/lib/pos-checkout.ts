import { supabase } from './supabase-client';
import { errorMessage } from './pos';
import { BillStatus, orderPayment } from './order-payment';

export interface CheckoutSnapshot {
  bill_status?: BillStatus; status?: BillStatus;
  document_type?: 'invoice' | 'quotation'; fulfillment_source?: 'shop' | 'factory';
  id: string; buyerId: string; accountId: string | null;
  accountType: 'customer' | 'shopkeeper'; accountName: string;
  subtotal: number; discount: number; net: number; payment: string;
  paid_amount: number; remaining_amount: number; customer_address: string | null;
  items: { id: string; product_id: string; qty: number; price: number; product_title_snapshot: string }[];
}

function rpcInvoiceId(response: unknown): string | null {
  if (typeof response === 'string') return response;
  if (Array.isArray(response)) return response.length === 1 ? rpcInvoiceId(response[0]) : null;
  if (response && typeof response === 'object') {
    const row = response as Record<string, unknown>;
    const ids = [row.id, row.order_id, row.pos_complete_checkout, row.pos_confirm_quotation]
      .filter((value): value is string => typeof value === 'string');
    if (ids.length && ids.every(id => id === ids[0])) return ids[0];
  }
  return null;
}

function verifyRpcInvoice(response: unknown, expectedId: string): string {
  if (rpcInvoiceId(response) === expectedId) return expectedId;
  console.error('Unexpected POS RPC response:', { expectedId, response });
  throw Object.assign(new Error('Checkout returned an unexpected invoice ID. Review Billing History before retrying.'), {
    details: `Expected invoice ID: ${expectedId}. RPC response: ${JSON.stringify(response) ?? 'undefined'}`,
  });
}

/** Used only when PostgREST reports an absent RPC, never for RPC execution errors. */
export async function insertCheckout(snapshot: CheckoutSnapshot): Promise<string> {
  const s = snapshot;
  if (s.document_type) throw new Error('Document workflows require transactional checkout.');
  const existing = await supabase.from('orders').select('id,status,invoice_number').eq('id', s.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const { error } = await supabase.from('orders').insert({
      id: s.id, buyer_id: s.buyerId, fulfillment_type: 'pickup', status: 'pending',
      invoice_number: `POS-${s.id}`, account_id: s.accountId, account_type: s.accountType,
      account_name_snapshot: s.accountName?.trim() === 'Walk-in' ? 'Walk-in Customer' : s.accountName?.trim() || 'Walk-in Customer', total: s.net, total_amount: s.subtotal,
      discount: s.discount, net_amount: s.net, payment_method: s.payment, image_urls: [],
      paid_amount: s.paid_amount, remaining_amount: s.remaining_amount, customer_address: s.customer_address,
    });
    if (error && error.code !== '23505') {
      console.error('POS order insert failed:', error.message, error.details, error);
      throw error;
    }
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
      if (error.code !== '23502' || !alias || !['quantity', 'unit_price', 'total_price', 'product_title'].includes(alias) || attempt === 4) {
        console.error('POS order items insert failed:', error.message, error.details, error);
        throw error;
      }
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
  const payment = orderPayment(s.document_type, s.net, s.paid_amount, s.remaining_amount);
  const { data, error } = await supabase.rpc('pos_complete_checkout', {
    ...(s.document_type ? { p_document_type: s.document_type, p_fulfillment_source: s.fulfillment_source ?? 'shop' } : {}),
    ...(s.document_type ? { p_bill_status: payment.status, p_status: payment.status } : {}),
    p_account_name_snapshot: s.accountName?.trim() === 'Walk-in' ? 'Walk-in Customer' : s.accountName?.trim() || 'Walk-in Customer',
    p_request_id: s.id, p_account_id: s.accountId, p_account_type: s.accountType,
    p_total_amount: s.subtotal, p_discount: s.discount, p_net_amount: s.net,
    p_payment_method: s.payment, p_image_urls: [],
    p_paid_amount: payment.paid, p_remaining_amount: payment.remaining, p_customer_address: s.customer_address,
    p_cart: s.items.map(item => ({ product_id: item.product_id, qty: item.qty })),
  });
  if (!s.document_type && (error?.code === 'PGRST202' || error?.code === 'PZ001')) {
    console.warn('Using resumable table inserts for an unavailable RPC or a pending fallback invoice.');
    return insertCheckout(s);
  }
  if (error) {
    console.error('POS checkout RPC failed:', error.message, error.details, error);
    throw Object.assign(new Error(error.message), {
    code: error.code, details: error.details, hint: error.hint,
    // A PostgreSQL error rolls back the RPC transaction; its cart can be edited.
    canEdit: /^[0-9A-Z]{5}$/.test(error.code ?? '') && !error.code.startsWith('PGRST'),
    });
  }
  return verifyRpcInvoice(data, s.id);
}

export async function convertQuotation(orderId: string): Promise<void> {
  const { data, error } = await supabase.rpc('pos_confirm_quotation', { p_order_id: orderId });
  if (error) throw new Error(errorMessage(error));
  verifyRpcInvoice(data, orderId);
}
