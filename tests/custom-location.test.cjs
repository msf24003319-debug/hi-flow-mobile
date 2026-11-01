const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const location = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/order-location.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: location });
test('custom snapshot takes priority over current account address', () => {
  const order = { account: { address: 'Current address' }, location_snapshot: {
    is_custom: true, city: 'New City', area: 'New Ada', district: 'New District', landmark: 'Near school',
  } };
  assert.equal(location.isCustomLocation(order), true);
  assert.equal(location.orderAddress(order), 'Custom Location: Ada New Ada, City New City, District New District, Near school');
});
test('historical text and legacy missing addresses remain safe', () => {
  assert.equal(location.isCustomLocation({ customer_address: 'Custom Location: City Test' }), true);
  assert.equal(location.orderAddress({ customer_address: ' Saved address ', account: { address: 'Changed' } }), 'Saved address');
  assert.equal(location.orderAddress({}), '');
  assert.equal(location.isCustomLocation({ location_snapshot: null }), false);
  assert.equal(location.orderAddress({ delivery_address: 'Legacy address' }), 'Legacy address');
});

test('complete manual snapshot preserves all fields and avoids duplicate default address', () => {
  const order = { location_snapshot: { is_manual: true, address_line: 'House 2, Street 5',
    area: 'Ada', tehsil: 'Tehsil', city: 'City', district: 'District', landmark: 'House 2, Street 5' } };
  assert.equal(location.isCustomLocation(order), true);
  assert.equal(location.orderAddress(order), 'Custom Location: House 2, Street 5, Ada Ada, Tehsil, City City, District District');
  assert.equal(location.orderAddress({ ...order, customer_address: 'Historic manual address' }), 'Historic manual address');
});

test('shopkeeper snapshot includes shop and every optional locality in exports and search text', () => {
  const address = location.orderAddress({ location_snapshot: { is_custom: true, is_manual: true,
    shop_name: 'Pump Shop', shop_number: '3', market: 'Market', village: 'Village', adda: 'Adda',
    station: { name: 'Bus stop' }, city: 'Vehari', address_line: 'Street 2' } });
  for (const value of ['Pump Shop', '3', 'Market', 'Village', 'Adda', 'Bus stop', 'City Vehari', 'Street 2']) {
    assert.ok(address.includes(value), value);
  }
});

test('city-only custom location, nullable fields and older text station snapshots are safe', () => {
  assert.equal(location.orderAddress({ location_snapshot: { is_custom: true, city: 'Vehari',
    area: null, district: null, station: null } }), 'Custom Location: City Vehari');
  assert.equal(location.orderAddress({ location_snapshot: { is_manual: true, city: 'Vehari',
    station: 'Old bus stop' } }), 'Custom Location: Old bus stop, City Vehari');
});

test('custom address CSV escapes quotes and line breaks and accepts null legacy fields', () => {
  const utils = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/utils.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: utils, require });
  const address = location.orderAddress({ location_snapshot: { is_custom: true,
    city: 'Vehari', area: 'Ada "Central"', landmark: 'School\nGate 2' } });
  const csv = utils.toCSV([{ address, custom_location: 'Yes' }, { address: null, custom_location: null }]);
  assert.ok(csv.includes('Ada ""Central""'));
  assert.ok(csv.includes('School\nGate 2'));
  assert.ok(csv.endsWith('"",""'));
  assert.ok(!csv.includes('undefined'));
});
