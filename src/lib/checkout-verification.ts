import { supabase } from './supabase-client';
import type { CheckoutSnapshot } from './pos-checkout';

export function normalizeName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return !trimmed || trimmed === 'Walk-in' ? 'Walk-in Customer' : trimmed;
}

export async function verifySavedCheckout(snapshot: CheckoutSnapshot): Promise<void> {
  const { data, error } = await supabase.from('orders')
    .select('id,account_id,account_type,account_name_snapshot,total_amount,discount,net_amount,paid_amount,remaining_amount,customer_address,document_type,fulfillment_source,payment_method')
    .eq('id', snapshot.id).single();
  if (error) throw error;
  if (!data) throw new Error('Saved invoice could not be verified. Review Billing History.');
  const expected = {
    account_id: snapshot.accountId, account_type: snapshot.accountType, account_name_snapshot: snapshot.accountName,
    total_amount: snapshot.subtotal, discount: snapshot.discount, net_amount: snapshot.net,
    paid_amount: snapshot.paid_amount, remaining_amount: snapshot.remaining_amount,
    customer_address: snapshot.customer_address, document_type: snapshot.document_type ?? 'invoice',
    fulfillment_source: snapshot.fulfillment_source ?? 'shop', payment_method: snapshot.payment,
  };
  const differences = Object.entries(expected).flatMap(([key, value]) => {
    const saved = data[key as keyof typeof expected];
    const matches = key === 'account_name_snapshot' ? normalizeName(saved) === normalizeName(value)
      : typeof value === 'number' ? saved != null && Number(saved) === value : (saved ?? null) === value;
    return matches ? [] : [`${key}: checkout=${JSON.stringify(value)}, saved=${JSON.stringify(saved)}`];
  });
  if (differences.length) {
    console.error('Saved POS invoice differs from checkout:', { invoiceId: snapshot.id, differences });
    throw Object.assign(new Error('The invoice was saved with different checkout data. Review Billing History before retrying.'), {
      details: differences.join('\n'),
    });
  }
}
