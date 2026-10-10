const test = require('node:test');
const assert = require('node:assert/strict');
const { checkoutPayment, orderPayment } = require('./helpers/order-payment.cjs');

test('checkout distinguishes empty payment, explicit zero, partial payment and full payment', () => {
  for (const [input, paid, remaining, status] of [['', 90, 0, 'paid'], ['  ', 90, 0, 'paid'], ['0', 0, 90, 'unpaid'], ['40', 40, 50, 'partial'], ['90', 90, 0, 'paid']]) {
    const actual = checkoutPayment('invoice', 90, input);
    assert.equal(actual.paid, paid);
    assert.equal(actual.remaining, remaining);
    assert.equal(actual.status, status);
  }
});
test('quotation overrides typed payments and clamps checkout balances', () => {
  const quote = checkoutPayment('quotation', 90, '40');
  assert.equal(quote.paid, 0);
  assert.equal(quote.remaining, 90);
  assert.equal(quote.status, 'quotation');
  assert.equal(checkoutPayment('invoice', 90, '100').remaining, 0);
  assert.equal(checkoutPayment('invoice', 0.3, '0.1').remaining, 0.2);
});
test('display preserves stored balance and handles absent payments as zero', () => {
  assert.equal(orderPayment('invoice', 90, null, null).status, 'unpaid');
  assert.equal(orderPayment('invoice', 90, 40, null).remaining, 50);
  assert.equal(orderPayment('invoice', 90, 40, 30).remaining, 30);
});
