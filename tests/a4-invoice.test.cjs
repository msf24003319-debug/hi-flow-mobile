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
  const html = customerSection(render({ ...base, customer: { ...base.customer, telephone: '03001234567', address: 'Street 1', type: 'shopkeeper' } }));
  assert.ok(html.includes('03001234567') && html.includes('Street 1') && html.includes('shopkeeper'));
});

test('completed orders and unset payment statuses show Paid; explicit other statuses remain', () => {
  for (const invoice of [{ ...base.invoice }, { ...base.invoice, orderStatus: 'completed', paymentStatus: 'Unpaid' }]) assert.ok(render({ ...base, invoice }).includes('>Paid<'));
  assert.ok(render({ ...base, invoice: { ...base.invoice, orderStatus: 'pending', paymentStatus: 'Unpaid' } }).includes('>Unpaid<'));
});
