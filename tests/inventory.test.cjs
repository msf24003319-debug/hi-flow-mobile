const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, dependencies = {}) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports: output, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  } });
  return output;
}
const types = load('src/types/admin.types.ts');
const { normalizeInventory, inventoryStatus, inventorySummary } = load('src/lib/inventory.ts', { '@/types/admin.types': types });
const row = (stock, threshold = 10) => normalizeInventory({ id: 'pump', stock_quantity: stock, ordered: '5', available: 999, price: '100', low_stock_threshold: threshold });

test('saved stock recomputes availability instead of retaining stale RPC aliases', () => {
  const increased = row('28');
  assert.equal(increased.stock_quantity, 28);
  assert.equal(increased.available_quantity, 23);
  assert.equal(increased.available, 23);
  assert.equal(row(0).available_quantity, 0);
});
test('filters use stock on hand, custom thresholds and a default of ten', () => {
  assert.equal(inventoryStatus(row(10)), 'low_stock');
  assert.equal(inventoryStatus(row(11)), 'in_stock');
  assert.equal(inventoryStatus(row(0)), 'out_of_stock');
  assert.equal(inventoryStatus(row(-1)), 'out_of_stock');
  assert.equal(inventoryStatus(row(4, 3)), 'in_stock');
  assert.equal(inventoryStatus(row(8, null)), 'low_stock');
  assert.equal(inventoryStatus(row(4)), 'low_stock'); // All four units reserved: still stock on hand.
});
test('all KPI values change from the same edited rows independently of the selected tab', () => {
  const products = [row(20), row(5), row(0)];
  const before = inventorySummary(products);
  assert.equal(before.total_products, 3);
  assert.equal(before.in_stock_count, 1);
  assert.equal(before.low_stock_count, 1);
  assert.equal(before.out_of_stock_count, 1);
  assert.equal(before.total_inventory_value, 2500);
  products[1] = row(25);
  const after = inventorySummary(products);
  assert.equal(after.in_stock_count, 2);
  assert.equal(after.low_stock_count, 0);
  assert.equal(after.total_inventory_value, 4500);
});
