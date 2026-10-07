const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/order/OrderDetailsModal.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: output, require: name => {
  if (name === '@/components/ui/Modal') return { Modal: ({ title, children }) => React.createElement('div', null, title, children) };
  if (name === '@/lib/utils') return { formatPKR: n => `Rs ${n}` };
  return require(name);
} });
const order = { id: '45048f53-abcd', order_number: '1', total: 90, total_amount: 100, discount: 10,
  account_id: 'customer-1', account_type: 'customer', account_name_snapshot: 'Buyer',
  account: { name: 'Buyer', type: 'customer', phone: '03001234567', email: 'buyer@example.com', address: 'New address' },
  customer_address: 'Invoice address', paid_amount: 40, remaining_amount: 50 };
const render = data => renderToStaticMarkup(React.createElement(output.OrderDetailsModal, { order: data, invoiceReady: false }));

test('sequential numbers and short uppercase fallback hide raw UUIDs', () => {
  assert.equal(output.formatOrderNumber(order), '#1 (POS-0001)');
  assert.equal(output.formatOrderNumber({ ...order, order_number: undefined }), 'POS-45048F53');
});
test('customer contacts, historical address and partial payment appear', () => {
  const html = render(order);
  for (const value of ['Buyer', 'customer', '03001234567', 'buyer@example.com', 'Invoice address', 'Paid Amount: Rs 40', 'Remaining Amount: Rs 50', 'text-red-400']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('New address'));
});
test('fully paid balances are green and legacy unknown payments stay unknown', () => {
  const paid = render({ ...order, paid_amount: 90, remaining_amount: 0 });
  assert.ok(paid.includes('Remaining Amount: Rs 0'));
  assert.ok(!paid.includes('text-red-400'));
  const legacy = render({ ...order, paid_amount: null, remaining_amount: null });
  assert.ok(legacy.includes('Paid Amount: Not recorded'));
  assert.ok(legacy.includes('Remaining Amount: Not recorded'));
});
