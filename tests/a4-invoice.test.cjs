const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/order/A4InvoiceTemplate.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: output, require });
const base = {
  company: { name: '', address: '', cityPostCode: '', location: '', senderName: '', telephone: '', email: '', vatNtnNumber: '' },
  customer: { name: 'Buyer', address: '', city: '', telephone: '', type: '' },
  invoice: { number: 'INV-1', date: '06 Oct 2026', orderNumber: '1', paymentTerms: 'Cash' },
  items: [{ id: '1', description: 'Pump', quantity: 2, unitPrice: 1234.5 }], discount: 10,
};
const render = props => renderToStaticMarkup(React.createElement(output.A4InvoiceTemplate, props));

test('sender fallbacks and shipping date render with consistent currency', () => {
  const html = render(base);
  for (const text of ['Hi Flow Pump Industries', '+92 300 1234567', 'info@hiflowpumps.com', 'NTN-7492018-9', '06 Oct 2026', 'PKR 1,234.50', 'PKR 2,469.00', 'PKR 10.00', 'PKR 2,459.00']) assert.ok(html.includes(text), text);
});

test('missing customer details omit labels and supplied details appear', () => {
  const customerSection = html => html.split('Send To')[1].split('Invoice number')[0];
  assert.ok(!customerSection(render(base)).includes('Telephone'));
  assert.ok(!customerSection(render(base)).includes('Customer type'));
  const html = customerSection(render({ ...base, customer: { ...base.customer, telephone: '03001234567', email: 'buyer@example.com', address: 'Street 1', type: 'shopkeeper' } }));
  assert.ok(html.includes('03001234567') && html.includes('Street 1') && html.includes('shopkeeper') && html.includes('buyer@example.com'));
});

test('sequential order number is padded and missing sequence preserves short fallback', () => {
  assert.ok(render(base).includes('POS-0001'));
  const html = render({ ...base, invoice: { ...base.invoice, number: 'POS-45048F53', orderNumber: 'POS-45048F53' } });
  assert.ok(html.includes('POS-45048F53'));
});
test('payment badge follows balances even when order status is completed', () => {
  for (const [paidAmount, remainingAmount, status] of [[2459, 0, 'PAID'], [1000, 1459, 'PARTIAL'], [0, 2459, 'UNPAID']]) {
    const html = render({ ...base, paidAmount, remainingAmount, invoice: { ...base.invoice, orderStatus: 'completed', paymentStatus: 'Paid' } });
    assert.ok(html.includes(`>${status}<`));
    assert.ok(html.includes('Paid Amount') && html.includes('Pending / Remaining Balance'));
    assert.ok(html.includes(`PKR ${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
    assert.ok(html.includes(`PKR ${remainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
  }
});
test('missing historical payment stays unknown and absent balance is calculated from paid amount', () => {
  assert.ok(render(base).includes('>NOT RECORDED<'));
  const html = render({ ...base, paidAmount: 1000 });
  assert.ok(html.includes('>PARTIAL<') && html.includes('PKR 1,459.00'));
});
