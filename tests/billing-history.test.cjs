const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/order/BillingHistory.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject });
const { matchesBillingFilter: matches } = exportsObject;

test('billing filters distinguish quotations, confirmed bills, and fulfillment sources', () => {
  const quote = { document_type: 'quotation', status: 'quotation', fulfillment_source: 'factory' };
  assert.equal(matches(quote, 'All'), true);
  assert.equal(matches(quote, 'Quotations'), true);
  assert.equal(matches(quote, 'Confirmed Bills'), false);
  assert.equal(matches(quote, 'Factory Direct'), true);
  assert.equal(matches(quote, 'Shop Direct'), false);
  const bill = { document_type: 'invoice', status: 'confirmed', fulfillment_source: 'shop' };
  assert.equal(matches(bill, 'Confirmed Bills'), true);
  assert.equal(matches(bill, 'Quotations'), false);
  assert.equal(matches(bill, 'Shop Direct'), true);
  assert.equal(matches({ status: 'completed' }, 'Confirmed Bills'), true);
  for (const status of ['paid', 'partial', 'unpaid']) assert.equal(matches({ document_type: 'invoice', status }, 'Confirmed Bills'), true);
  assert.equal(matches({ status: 'pending' }, 'Confirmed Bills'), false);
  assert.equal(matches({ status: 'cancelled' }, 'Confirmed Bills'), false);
  assert.equal(matches({ status: 'completed' }, 'Shop Direct'), true);
});
