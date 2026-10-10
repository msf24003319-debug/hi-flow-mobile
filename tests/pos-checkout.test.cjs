const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const snapshot = () => ({ id: 'invoice-1', buyerId: 'admin-1', accountId: null, accountType: 'customer',
  accountName: 'Walk-in Customer', subtotal: 100, discount: 10, net: 90, payment: 'cash',
  paid_amount: 40, remaining_amount: 50, customer_address: '12 Main Street',
  items: [{ id: 'item-1', product_id: 'product-1', qty: 2, price: 50, product_title_snapshot: 'Pump' }] });

function setup(rpcError = { code: 'PGRST202', message: 'Missing function' }) {
  const db = { orders: [], order_items: [] };
  const state = { failItems: false, calls: [], aliases: [], rpcError, rpcArgs: null };
  const client = {
    async rpc(name, args) { state.rpcArgs = { name, args }; return { data: state.rpcError ? null : ('rpcData' in state ? state.rpcData : args.p_request_id ?? args.p_order_id), error: state.rpcError }; },
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
  vm.runInNewContext(compiled, { exports: exportsObject, console: { warn() {}, error() {} }, require: name => {
    if (name === './supabase-client') return { supabase: client };
    if (name === './pos') return { errorMessage: e => e.message };
    if (name === './order-payment') return require('./helpers/order-payment.cjs');
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
  assert.equal(s.db.orders[0].paid_amount, 40);
  assert.equal(s.db.orders[0].remaining_amount, 50);
  assert.equal(s.db.orders[0].customer_address, '12 Main Street');
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
  assert.equal(s.state.rpcArgs.args.p_paid_amount, 40);
  assert.equal(s.state.rpcArgs.args.p_remaining_amount, 50);
  assert.equal(s.state.rpcArgs.args.p_customer_address, '12 Main Street');
});
test('unpaid and fully paid invoices retain balances through fallback retries', async () => {
  for (const paid of [0, 90]) {
    const s = setup();
    const invoice = { ...snapshot(), paid_amount: paid, remaining_amount: 90 - paid, customer_address: null };
    s.state.failItems = true;
    await assert.rejects(s.completeCheckout(invoice));
    s.state.failItems = false;
    await s.completeCheckout(invoice);
    assert.equal(s.db.orders.length, 1);
    assert.equal(s.db.orders[0].paid_amount, paid);
    assert.equal(s.db.orders[0].remaining_amount, 90 - paid);
    assert.equal(s.db.orders[0].customer_address, null);
  }
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


test('quotation checkout sends document metadata through the atomic RPC', async () => {
  const s = setup(null);
  await s.completeCheckout({ ...snapshot(), document_type: 'quotation', fulfillment_source: 'factory' });
  assert.equal(s.state.rpcArgs.args.p_document_type, 'quotation');
  assert.equal(s.state.rpcArgs.args.p_account_name_snapshot, 'Walk-in Customer');
  assert.equal(s.state.rpcArgs.args.p_fulfillment_source, 'factory');
  assert.equal(s.state.rpcArgs.args.p_paid_amount, 0);
  assert.equal(s.state.rpcArgs.args.p_remaining_amount, 90);
  assert.equal(s.state.rpcArgs.args.p_bill_status, 'quotation');
  assert.equal(s.state.rpcArgs.args.p_status, 'quotation');
  assert.equal(s.state.rpcArgs.args.p_customer_address, '12 Main Street');
  assert.equal(s.state.calls.length, 0);
});

test('checkout accepts scalar, object and single-row responses only for the requested invoice', async () => {
  for (const rpcData of ['invoice-1', { id: 'invoice-1' }, { order_id: 'invoice-1' }, [{ pos_complete_checkout: 'invoice-1' }]]) {
    const s = setup(null);
    s.state.rpcData = rpcData;
    assert.equal(await s.completeCheckout(snapshot()), 'invoice-1');
    assert.equal(s.state.calls.length, 0);
  }
});

test('unknown or mismatched responses expose the response and never create another invoice', async () => {
  for (const rpcData of [null, [], 'other-invoice', { id: 'invoice-1', order_id: 'other-invoice' }, [{ id: 'invoice-1' }, { id: 'other-invoice' }]]) {
    const s = setup(null);
    s.state.rpcData = rpcData;
    await assert.rejects(s.completeCheckout(snapshot()), error => {
      assert.match(error.message, /unexpected invoice ID/);
      assert.ok(error.details.includes(JSON.stringify(rpcData)));
      return true;
    });
    assert.equal(s.state.calls.length, 0);
  }
});

test('document invoices persist paid, partial and unpaid statuses alongside balances', async () => {
  for (const [paid_amount, remaining_amount, status] of [[90, 0, 'paid'], [40, 50, 'partial'], [0, 90, 'unpaid']]) {
    const s = setup(null);
    await s.completeCheckout({ ...snapshot(), document_type: 'invoice', paid_amount, remaining_amount });
    assert.equal(s.state.rpcArgs.args.p_paid_amount, paid_amount);
    assert.equal(s.state.rpcArgs.args.p_remaining_amount, remaining_amount);
    assert.equal(s.state.rpcArgs.args.p_bill_status, status);
    assert.equal(s.state.rpcArgs.args.p_status, status);
  }
});

test('new document workflows never fall back to nontransactional inserts', async () => {
  for (const document_type of ['invoice', 'quotation']) {
    for (const code of ['PGRST202', 'PZ001']) {
      const s = setup({ code, message: 'Unavailable' });
      await assert.rejects(s.completeCheckout({ ...snapshot(), document_type, fulfillment_source: 'shop' }), /Unavailable/);
      assert.equal(s.state.calls.length, 0);
    }
  }
});

test('checkout preserves exact Supabase message, details, code and hint', async () => {
  const error = { code: 'PGRST202', message: 'Could not find the function', details: 'Searched for the supplied parameter signature.', hint: 'Check schema cache' };
  const s = setup(error);
  await assert.rejects(s.completeCheckout({ ...snapshot(), document_type: 'invoice' }), caught => {
    assert.equal(caught.message, error.message);
    assert.equal(caught.details, error.details);
    assert.equal(caught.code, error.code);
    assert.equal(caught.hint, error.hint);
    return true;
  });
  assert.equal(s.state.calls.length, 0);
});

test('quotation conversion calls only the conversion RPC and surfaces stock failures', async () => {
  const success = setup(null);
  await success.convertQuotation('quotation-1');
  assert.equal(success.state.rpcArgs.name, 'pos_confirm_quotation');
  assert.equal(success.state.rpcArgs.args.p_order_id, 'quotation-1');
  assert.equal(success.state.calls.length, 0);
  const failure = setup({ code: 'P0001', message: 'Insufficient stock' });
  await assert.rejects(failure.convertQuotation('quotation-1'), /Insufficient stock/);
  assert.equal(failure.state.calls.length, 0);
});
