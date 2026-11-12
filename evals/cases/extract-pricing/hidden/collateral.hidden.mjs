import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartLines, cartSummary, cartTotal } from '../src/cart.js';
import { invoice } from '../src/invoice.js';
import { quote } from '../src/quote.js';
import { find } from '../src/catalog.js';

const e = (sku, qty) => ({ sku, qty });

test('cart lines, totals and summary are unchanged', () => {
  assert.deepEqual(cartLines([e('pen', 3), e('book', 2), e('lamp', 1)]), [{ sku: 'pen', qty: 3, total: 4.32 }, { sku: 'book', qty: 2, total: 25 }, { sku: 'lamp', qty: 1, total: 47.99 }]);
  assert.equal(cartTotal([e('pen', 3), e('book', 2), e('lamp', 1)]), 77.31);
  assert.equal(cartSummary([e('pen', 1)]), '1 item, $1.44');
  assert.equal(cartSummary([e('pen', 2), e('book', 1)]), '3 items, $15.38');
  assert.equal(cartTotal([]), 0);
});

test('the cart gives the bulk price at ten units', () => {
  assert.equal(cartTotal([e('pen', 9)]), 12.96);
  assert.equal(cartTotal([e('pen', 10)]), 12.96);
  assert.equal(cartTotal([e('lamp', 10)]), 431.89);
  assert.equal(cartTotal([e('book', 10)]), 112.5);
});

test('the invoice keeps net and tax apart and rounds tax per line', () => {
  assert.deepEqual(invoice([e('lamp', 3), e('pen', 7), e('book', 1)], { number: 'INV-7' }), {
    number: 'INV-7',
    lines: [{ description: '3 x Lamp', net: 119.97, tax: 23.99 }, { description: '7 x Pen', net: 8.4, tax: 1.68 }, { description: '1 x Book', net: 12.5, tax: 0 }],
    net: 140.87, tax: 25.67, total: 166.54,
  });
});

test('the invoice gives the bulk price at ten units', () => {
  const at = (qty) => invoice([e('lamp', qty)], { number: 'x' });
  assert.deepEqual([at(9).net, at(9).tax], [359.91, 71.98]);
  assert.deepEqual([at(10).net, at(10).tax, at(10).total], [359.91, 71.98, 431.89]);
  assert.deepEqual([at(11).net, at(11).tax], [395.9, 79.18]);
});

test('the quote gives the bulk price only above ten units', () => {
  assert.equal(quote([e('lamp', 10)]).total, 479.88);
  assert.equal(quote([e('lamp', 11)]).total, 475.08);
  assert.equal(quote([e('book', 10)]).total, 125);
  assert.equal(quote([e('book', 11)]).total, 123.75);
});

test('the quote rounds once at the end, not per line', () => {
  assert.equal(quote([e('pen', 1), e('pen', 1), e('pen', 1)]).total, 4.32);
  assert.equal(quote([e('lamp', 1), e('lamp', 1), e('lamp', 1)]).total, 143.96);
  assert.deepEqual(quote([e('desk', 1)], { validDays: 7 }), { validDays: 7, total: 298.8 });
  assert.equal(quote([]).validDays, 30);
});

test('unknown items still throw from every entry point', () => {
  assert.throws(() => find('sofa'), /Unknown item sofa/);
  assert.throws(() => cartTotal([e('sofa', 1)]), /Unknown item sofa/);
  assert.throws(() => invoice([e('sofa', 1)], { number: 'x' }), /Unknown item sofa/);
  assert.throws(() => quote([e('sofa', 1)]), /Unknown item sofa/);
});
