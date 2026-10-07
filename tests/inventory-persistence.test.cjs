const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports: output, console: { debug() {}, log() {}, error() {} }, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  } });
  return output;
}
const types = load('src/types/admin.types.ts');
const inventory = load('src/lib/inventory.ts', { '@/types/admin.types': types });
const persistence = load('src/lib/inventory-persistence.ts', { '@/lib/inventory': inventory });
const product = stock => ({ id: 'pump', stock_quantity: stock, stock, stock_qty: 999, price: 100 });
const overview = (stock, ordered = 5) => ({ id: 'pump', stock_quantity: stock, stock, ordered, available_quantity: Math.max(0, stock - ordered) });

test('confirmed quantities ignore unrelated legacy stock_qty and recompute available', () => {
  for (const stock of [30, 25, 100, 0]) {
    const row = persistence.mergeInventoryRow(overview(stock, 20), product(stock));
    assert.equal(row.stock_quantity, stock);
    assert.equal(row.stock, stock);
    assert.equal(row.available_quantity, Math.max(0, stock - 20));
  }
});

test('a stale overview, disagreeing aliases, missing canonical stock, and stale availability are exposed', () => {
  assert.throws(() => persistence.mergeInventoryRow(overview(20), product(30)), /overview stock/);
  assert.throws(() => persistence.mergeInventoryRow(overview(30), { ...product(30), stock: 20 }), /synchronization trigger/);
  assert.throws(() => persistence.mergeInventoryRow(overview(30), { ...product(30), stock_quantity: null }), /canonical stock_quantity/);
  assert.throws(() => persistence.mergeInventoryRow({ ...overview(30), available_quantity: 15 }, product(30)), /availability/);
  assert.throws(() => persistence.mergeInventoryRow(overview(30), undefined), /missing/);
});

function client(stock, rpcStock = stock) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      return { select: () => ({ eq: () => ({ single: async () => ({ data: product(stock), error: null }) }) }) };
    },
    async rpc(name) { calls.push(name); return { data: [overview(rpcStock)], error: null }; },
  };
}

test('verification returns the database row and performs no adjustment writes', async () => {
  const db = client(100);
  const confirmed = await persistence.verifySavedInventory(db, 'pump');
  assert.equal(confirmed.stockQuantity, 100);
  assert.equal(confirmed.inventoryRow.available_quantity, 95);
  assert.deepEqual(db.calls, ['products', 'get_inventory_overview']);
  await persistence.verifySavedInventory(db, 'pump');
  assert.equal(db.calls.includes('admin_adjust_inventory'), false);
});

test('verification rejects an overview that disagrees with the saved table row', async () => {
  await assert.rejects(persistence.verifySavedInventory(client(100, 20), 'pump'), /overview stock/);
});

function pageHarness(db) {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const callbacks = [];
  const react = {
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useMemo(fn) { return fn(); },
    useCallback(fn) { callbacks.push(fn); return fn; },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const modal = () => {};
  const page = load('src/app/dashboard/inventory/page.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': {},
    '@/lib/supabase-client': { supabase: db },
    '@/components/ui/DataTable': {},
    '@/components/ui/StatusBadge': {},
    '@/components/product/InventoryAdjustModal': { InventoryAdjustModal: modal },
    '@/lib/utils': { formatPKR: String },
    '@/lib/inventory': inventory,
    '@/lib/inventory-persistence': persistence,
    '@/lib/pos': { errorMessage: error => error.message },
  }).default;
  function findModal(element) {
    if (!element || typeof element !== 'object') return null;
    if (element.type === modal) return element.props;
    const children = element.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findModal(child);
      if (found) return found;
    }
    return null;
  }
  return {
    states,
    render() { stateIndex = 0; refIndex = 0; return findModal(page()); },
    load: async () => callbacks[0](),
  };
}

test('an actual InventoryPage load started before saving cannot overwrite the confirmed row', async () => {
  let finish;
  const oldRead = new Promise(resolve => { finish = resolve; });
  let productReads = 0;
  const db = {
    rpc: async () => ({ data: [overview(20)], error: null }),
    from: () => ({ select: () => ({ order: () => ({ range: () => { productReads++; return oldRead; } }) }) }),
  };
  const harness = pageHarness(db);
  harness.render();
  harness.states[0] = [inventory.normalizeInventory(overview(20))];
  harness.states[3] = harness.states[0][0];
  const modal = harness.render();
  const pendingLoad = harness.load();
  modal.onSaveStart();
  await harness.load(); // A load requested during saving must not query.
  assert.equal(productReads, 1);
  modal.onSaved({ productId: 'pump', stockQuantity: 100, inventoryRow: inventory.normalizeInventory(overview(100)) });
  finish({ data: [product(20)], error: null });
  await pendingLoad;
  assert.equal(harness.states[0][0].stock_quantity, 100);
  assert.equal(harness.states[0][0].available_quantity, 95);
  assert.equal(harness.states[3], null);
});

test('a later inconsistent reconciliation exposes an error and retains the confirmed row', async () => {
  const db = {
    rpc: async () => ({ data: [overview(20)], error: null }),
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [product(100)], error: null }) }) }) }),
  };
  const harness = pageHarness(db);
  harness.render();
  harness.states[0] = [inventory.normalizeInventory(overview(100))];
  await harness.load();
  assert.equal(harness.states[0][0].stock_quantity, 100);
  assert.match(harness.states[2], /overview stock/);
  assert.equal(harness.states[1], false);
});

function modalHarness({ baseline, rpcStock, confirmedStock, adjustmentType = 'increase', quantity = 10, customerPrice = '100', wholesalePrice = '0', rpcError = null }) {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let writes = 0;
  let verificationReads = 0;
  const rpcCalls = [];
  const saved = [];
  const react = {
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const component = load('src/components/product/InventoryAdjustModal.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': {},
    '@/lib/supabase-client': { supabase: {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: product(baseline), error: null }) }) }) }),
      rpc: async (name, args) => { writes++; rpcCalls.push({ name, args }); return { data: rpcStock, error: rpcError }; },
    } },
    '@/lib/inventory-persistence': { verifySavedInventory: async () => {
      verificationReads++;
      return { productId: 'pump', stockQuantity: confirmedStock, inventoryRow: inventory.normalizeInventory({ ...overview(confirmedStock), price: Number(customerPrice), wholesale_price: Number(wholesalePrice) }) };
    } },
    '@/components/ui/Modal': {},
    '@/lib/utils': { resolveProductName: () => 'Pump' },
  }).InventoryAdjustModal;
  function render() {
    stateIndex = 0; refIndex = 0;
    return component({ product: product(20), onClose() {}, onSaved: update => saved.push(update) });
  }
  render();
  states[0] = adjustmentType;
  states[1] = customerPrice;
  states[2] = wholesalePrice;
  states[3] = quantity;
  return {
    states, saved, rpcCalls,
    writes: () => writes,
    reads: () => verificationReads,
    save: () => render().props.footer.props.children[1].props.onClick(),
    saveLabel: () => render().props.footer.props.children[1].props.children[1],
  };
}

test('actual modal confirms Increase, Decrease, and Set Exact from database values', async () => {
  for (const [baseline, adjustmentType, quantity, result] of [
    [20, 'increase', 10, 30], [30, 'decrease', 5, 25], [25, 'set', 100, 100],
  ]) {
    const modal = modalHarness({ baseline, adjustmentType, quantity, rpcStock: result, confirmedStock: result });
    await modal.save();
    assert.equal(modal.saved[0].stockQuantity, result);
    assert.equal(modal.writes(), 1);
  }
});

test('actual modal detects a successful legacy-only write and retries verification without replaying it', async () => {
  const modal = modalHarness({ baseline: 20, rpcStock: null, confirmedStock: 20 });
  await modal.save();
  assert.equal(modal.saved.length, 0);
  assert.match(modal.states[7], /legacy column/);
  assert.equal(modal.saveLabel(), 'Verify Saved Inventory');
  await modal.save();
  assert.equal(modal.writes(), 1);
  assert.equal(modal.reads(), 2);
  assert.equal(modal.saved.length, 0);
});

test('actual modal accepts a row-locked RPC result after a concurrent stock edit', async () => {
  const modal = modalHarness({ baseline: 20, rpcStock: 40, confirmedStock: 40 });
  await modal.save();
  assert.equal(modal.saved[0].stockQuantity, 40);
});


test('price-only modal save skips stock adjustment and confirms saved prices', async () => {
  const modal = modalHarness({ baseline: 20, rpcStock: 20, confirmedStock: 20,
    quantity: 0, customerPrice: '125.50', wholesalePrice: '90' });
  await modal.save();
  assert.equal(modal.saved[0].inventoryRow.price, 125.5);
  assert.equal(modal.saved[0].inventoryRow.wholesale_price, 90);
  assert.equal(modal.rpcCalls[0].name, 'admin_update_inventory_and_prices');
  assert.equal(modal.rpcCalls[0].args.p_adjustment_type, null);
  assert.equal(modal.rpcCalls[0].args.p_customer_price, 125.5);
});

test('combined save sends stock and prices in one RPC', async () => {
  const modal = modalHarness({ baseline: 20, rpcStock: 30, confirmedStock: 30,
    customerPrice: '150', wholesalePrice: '100' });
  await modal.save();
  assert.equal(modal.writes(), 1);
  assert.equal(modal.rpcCalls[0].args.p_adjustment_type, 'increase');
  assert.equal(modal.rpcCalls[0].args.p_wholesale_price, 100);
  assert.equal(modal.saved[0].stockQuantity, 30);
});

test('invalid prices prevent any write and RPC errors do not report success', async () => {
  for (const customerPrice of ['', '-1', 'Infinity', 'abc']) {
    const modal = modalHarness({ baseline: 20, customerPrice });
    await modal.save();
    assert.equal(modal.writes(), 0);
  }
  const modal = modalHarness({ baseline: 20, rpcError: { message: 'Admin access required' } });
  await modal.save();
  assert.equal(modal.saved.length, 0);
  assert.match(modal.states[7], /Admin access required/);
});
