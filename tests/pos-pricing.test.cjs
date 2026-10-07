const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual TypeScript utilities without opening a Supabase connection.
const exportsObject = {};
const compiled = ts.transpileModule(fs.readFileSync('src/lib/pos.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(compiled, {
  exports: exportsObject,
  require: name => { assert.equal(name, './supabase-client'); return { supabase: {} }; },
});
const { priceFor, normalizeProduct, cartTotals } = exportsObject;

test('numeric strings and joined price arrays work for both buyer types', () => {
  const product = { product_prices: [{ customer_price: '1200.50', wholesale_price: '950' }] };
  assert.equal(priceFor(product, false), 1200.5);
  assert.equal(priceFor(product, true), 950);
});
test('zero, empty, malformed and negative placeholders fall through to a usable price', () => {
  const product = { customer_price: '0', wholesale_price: null, price: '', unit_price: 'bad', sale_price: '1500' };
  assert.equal(priceFor(product, false), 1500);
  assert.equal(priceFor(product, true), 1500);
  assert.equal(priceFor({ customer_price: -20, price: '200' }, false), 200);
});
test('customer and shopkeeper precedence remains distinct after normalization', () => {
  const product = { customer_price: '0', wholesale_price: '800', price: '1000' };
  const normalized = normalizeProduct(product);
  assert.equal(priceFor(normalized, false), 1000);
  assert.equal(priceFor(normalized, true), 800);
  assert.equal(priceFor({ price: '1500', product_prices: { customer_price: '1200', wholesale_price: '900' } }, false), 1200);
});
test('unusable prices are unavailable rather than free', () => {
  for (const value of [null, undefined, '', ' ', 0, '0', -1, 'NaN', Infinity, 'Infinity', false, {}]) {
    assert.equal(priceFor({ customer_price: value }, false), null);
  }
});
test('discount on an empty or underpriced cart never makes the displayed net negative', () => {
  assert.equal(cartTotals([], '1500').netTotal, 0);
  assert.equal(cartTotals([{ total_price: 500 }], '1500').netTotal, 0);
  const totals = cartTotals([{ total_price: 1200.5 }, { total_price: 900 }], '100');
  assert.equal(totals.subtotal, 2100.5);
  assert.equal(totals.netTotal, 2000.5);
  assert.equal(cartTotals([{ total_price: 500 }], 'invalid').netTotal, 500);
});
