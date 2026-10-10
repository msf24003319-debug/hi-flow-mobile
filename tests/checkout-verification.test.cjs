const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const snapshot = { id: 'invoice-1', accountId: 'shopkeeper-1', accountType: 'shopkeeper', accountName: 'Naveed',
  subtotal: 22000, discount: 350, net: 21650, paid_amount: 0, remaining_amount: 21650,
  customer_address: 'Vehari', document_type: 'quotation', fulfillment_source: 'factory', payment: 'card' };
const saved = { id: snapshot.id, account_id: snapshot.accountId, account_type: snapshot.accountType,
  account_name_snapshot: snapshot.accountName, total_amount: '22000', discount: '350', net_amount: '21650',
  paid_amount: 0, remaining_amount: '21650', customer_address: 'Vehari', document_type: 'quotation', fulfillment_source: 'factory', payment_method: 'card' };
function setup(data) {
  const output = {};
  const query = { select() { return this; }, eq() { return this; }, async single() { return { data, error: null }; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/checkout-verification.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: output, console: { error() {} }, require: () => ({ supabase: { from: () => query } }) });
  return output.verifySavedCheckout;
}
test('saved quotation matches its selected shopkeeper and discounted totals', async () => {
  await setup(saved)(snapshot);
});

test('walk-in aliases and trimmed customer names verify without false discrepancies', async () => {
  for (const name of ['Walk-in', ' Walk-in Customer ', null, '']) {
    await setup({ ...saved, account_id: null, account_type: 'customer', account_name_snapshot: name })(
      { ...snapshot, accountId: null, accountType: 'customer', accountName: 'Walk-in Customer' });
  }
  await setup({ ...saved, account_name_snapshot: ' Naveed ' })(snapshot);
});
test('wrong buyer and subtotal expose exact differences instead of reporting success', async () => {
  await assert.rejects(setup({ ...saved, account_id: null, account_name_snapshot: 'Walk-in Customer', total_amount: 21650 })(snapshot), error => {
    assert.match(error.details, /account_id/);
    assert.match(error.details, /account_name_snapshot/);
    assert.match(error.details, /total_amount: checkout=22000, saved=21650/);
    return true;
  });
});
