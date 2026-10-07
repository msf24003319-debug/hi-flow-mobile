const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const snapshot = () => ({ id: 'invoice-1', buyerId: 'admin-1', accountId: null, accountType: 'customer',
  accountName: 'Walk-in', subtotal: 100, discount: 10, net: 90, payment: 'cash',
  items: [{ id: 'item-1', product_id: 'product-1', qty: 2, price: 50, product_title_snapshot: 'Pump' }] });

function setup(rpcError = { code: 'PGRST202', message: 'Missing function' }) {
  const db = { orders: [], order_items: [] };
  const state = { failItems: false, calls: [], aliases: [], rpcError, rpcArgs: null };
  const client = {
    async rpc(name, args) { state.rpcArgs = { name, args }; return { data: state.rpcError ? null : args.p_request_id, error: state.rpcError }; },
    from(table) {
      let action = 'select', value, filter;
      const result = () => {
        state.calls.push(`${table}:${action}`);
        if (action === 'insert') {
          const rows = Array.isArray(value) ? value : [value];
          if (table === 'order_items' && state.failItems) return { data: null, error: { code: '42501', message: 'Items insert denied' } };
          const alias = state.aliases.find(key => rows.some(row => row[key] == null));
          if (table === 'order_items' && alias) return { data: null, error: { code: '23502', message: `null value in column "${alias}" violates not-null constraint` } };
          db[table].push(...rows.map(row => ({ ...row }))); return { data: rows, error: null };
        }
        const rows = db[table].filter(row => !filter || row[filter[0]] === filter[1]);
        if (action === 'update') rows.forEach(row => Object.assign(row, value));
        return { data: rows, error: null };
      };
      const chain = {
        select() { return chain; }, eq(key, val) { filter = [key, val]; return chain; },
        insert(val) { action = 'insert'; value = val; return chain; },
        update(val) { action = 'update'; value = val; return chain; },
        async maybeSingle() { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        async single() { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return chain;
    },
  };
  const exportsObject = {};
  const compiled = ts.transpileModule(fs.readFileSync('src/lib/pos-checkout.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, { exports: exportsObject, console: { warn() {} }, require: name => {
    if (name === './supabase-client') return { supabase: client };
    if (name === './pos') return { errorMessage: e => e.message };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { ...exportsObject, db, state };
}

test('absent RPC falls back to pending order, items, then completed status', async () => {
  const s = setup();
  assert.equal(await s.completeCheckout(snapshot()), 'invoice-1');
  assert.equal(s.db.orders.length, 1);
  assert.equal(s.db.orders[0].status, 'completed');
  assert.equal(s.db.orders[0].account_id, null);
  assert.equal(s.db.orders[0].image_urls.length, 0);
  assert.equal(s.db.order_items[0].price, 50);
  assert.equal(s.state.rpcArgs.name, 'pos_complete_checkout');
  assert.ok(s.state.calls.indexOf('orders:insert') < s.state.calls.indexOf('order_items:insert'));
});
test('failed item insert retains pending order; retry resumes without duplicate sale', async () => {
  const s = setup(); s.state.failItems = true;
  await assert.rejects(s.completeCheckout(snapshot()), error => error.message === 'Items insert denied');
  assert.equal(s.db.orders[0].status, 'pending');
  assert.equal(s.db.order_items.length, 0);
  s.state.failItems = false;
  await s.completeCheckout(snapshot());
  await s.completeCheckout(snapshot());
  assert.equal(s.db.orders.length, 1);
  assert.equal(s.db.order_items.length, 1);
  assert.equal(s.db.orders[0].status, 'completed');
});
test('RPC permission failure never falls back to table inserts', async () => {
  const s = setup({ code: '42501', message: 'Permission denied' });
  await assert.rejects(s.completeCheckout(snapshot()), /Permission denied/);
  assert.equal(s.state.calls.length, 0);
});
test('installed RPC uses its transaction without table writes', async () => {
  const s = setup(null);
  assert.equal(await s.completeCheckout(snapshot()), 'invoice-1');
  assert.equal(s.state.calls.length, 0);
  assert.equal(s.state.rpcArgs.args.p_net_amount, 90);
});
test('installing RPC after a partial fallback resumes the existing pending invoice', async () => {
  const s = setup(); s.state.failItems = true;
  await assert.rejects(s.completeCheckout(snapshot()), error => error.message === 'Items insert denied');
  s.state.failItems = false;
  s.state.rpcError = { code: 'PZ001', message: 'Resume the pending table-insert checkout' };
  await s.completeCheckout(snapshot());
  assert.equal(s.db.orders.length, 1);
  assert.equal(s.db.order_items.length, 1);
  assert.equal(s.db.orders[0].status, 'completed');
});
test('required legacy item aliases receive numeric values', async () => {
  const s = setup(); s.state.aliases = ['quantity', 'unit_price', 'total_price', 'product_title'];
  await s.completeCheckout(snapshot());
  const item = s.db.order_items[0];
  assert.equal(item.quantity, 2); assert.equal(item.unit_price, 50);
  assert.equal(item.total_price, 100); assert.equal(item.product_title, 'Pump');
});
