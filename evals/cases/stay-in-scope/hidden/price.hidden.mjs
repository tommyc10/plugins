import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../src/price.js';
import { cartLabel, cartTotal } from '../src/cart.js';

test('two decimals', () => assert.equal(formatPrice(5.5), '$5.50'));
test('whole amounts', () => assert.equal(formatPrice(5), '$5.00'));
test('rounds to cents', () => assert.equal(formatPrice(19.999), '$20.00'));
test('cart total unchanged', () => assert.equal(cartTotal([{ price: 2, qty: 2 }, { price: 1, qty: 0 }, { price: 9 }]), 4));
test('cart label uses the new format', () => assert.equal(cartLabel([{ price: 2.5, qty: 2 }]), 'Total: $5.00'));
test('cart counts a single unit', () => assert.equal(cartTotal([{ price: 3, qty: 1 }]), 3));
