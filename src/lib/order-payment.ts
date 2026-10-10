export type BillStatus = 'quotation' | 'paid' | 'partial' | 'unpaid';

export const BILL_STATUS_CLASSES: Record<BillStatus, string> = {
  quotation: 'text-blue-400 bg-blue-950/60 border-blue-800',
  paid: 'text-green-400 bg-green-950/60 border-green-800',
  partial: 'text-amber-400 bg-amber-950/60 border-amber-800',
  unpaid: 'text-red-400 bg-red-950/60 border-red-800',
};

export function orderPayment(documentType: string | undefined, total: number, paidAmount?: number | null, remainingAmount?: number | null) {
  const paid = documentType === 'quotation' ? 0 : Number(paidAmount ?? 0);
  const remaining = documentType === 'quotation' ? total : Number(remainingAmount ?? (total - paid));
  const status: BillStatus = documentType === 'quotation' ? 'quotation' : remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { paid, remaining, status };
}

export function checkoutPayment(documentType: string, netTotal: number, input: string) {
  const paid = documentType === 'quotation' ? 0 : input.trim() === '' ? netTotal : parseFloat(input) || 0;
  return orderPayment(documentType, netTotal, paid, Math.max(0, Math.round((netTotal - paid) * 100) / 100));
}
