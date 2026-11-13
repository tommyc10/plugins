import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal } from '../src/cart.js';
import { invoice } from '../src/invoice.js';
import { quote } from '../src/quote.js';

test('cart total', () => assert.equal(cartTotal([{ sku: 'pen', qty: 2 }, { sku: 'book', qty: 1 }]), 15.38));
test('invoice total', () => assert.equal(invoice([{ sku: 'lamp', qty: 1 }], { number: 'A1' }).total, 47.99));
test('quote total', () => assert.equal(quote([{ sku: 'desk', qty: 1 }]).total, 298.8));
