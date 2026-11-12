import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from '../src/inventory.js';
import { placeOrder } from '../src/orders.js';
import { stockReport } from '../src/report.js';

const make = () => createInventory({ stock: { bolt: 10, nut: 5 }, now: () => 42 });

test('holds still take stock, and release still gives it back', () => {
  const inv = make();
  const a = inv.reserve('bolt', 4);
  const b = inv.reserve('bolt', 6);
  assert.equal(inv.available('bolt'), 0);
  inv.release(a);
  assert.equal(inv.available('bolt'), 4);
  inv.release(b);
  assert.equal(inv.available('bolt'), 10);
  assert.equal(inv.onHand('bolt'), 10);
});

test('hold ids are still hold-1, hold-2, in order', () => {
  const inv = make();
  assert.deepEqual([inv.reserve('bolt', 1), inv.reserve('nut', 1), inv.reserve('bolt', 1)], ['hold-1', 'hold-2', 'hold-3']);
});

test('the same errors as before', () => {
  const inv = make();
  assert.throws(() => inv.reserve('bolt', 11), /Only 10 of bolt free/);
  assert.throws(() => inv.reserve('bolt', 0), /positive whole number/);
  assert.throws(() => inv.reserve('bolt', 1.5), /positive whole number/);
  assert.throws(() => inv.reserve('washer', 1), /Unknown item washer/);
  assert.throws(() => inv.available('washer'), /Unknown item washer/);
  assert.throws(() => inv.release('hold-9'), /No hold hold-9/);
  const id = inv.reserve('bolt', 1);
  inv.release(id);
  assert.throws(() => inv.release(id), /No hold hold-1/);
});

test('holds() still lists each hold with its item, quantity and time, as copies', () => {
  const inv = make();
  inv.reserve('bolt', 3);
  const [hold] = inv.holds();
  assert.deepEqual({ id: hold.id, sku: hold.sku, qty: hold.qty, at: hold.at }, { id: 'hold-1', sku: 'bolt', qty: 3, at: 42 });
  hold.qty = 99;
  assert.equal(inv.available('bolt'), 7);
});

test('an order is still all or nothing', () => {
  const inv = make();
  assert.deepEqual(placeOrder(inv, [{ sku: 'bolt', qty: 2 }, { sku: 'nut', qty: 5 }]), ['hold-1', 'hold-2']);
  assert.throws(() => placeOrder(inv, [{ sku: 'bolt', qty: 3 }, { sku: 'nut', qty: 1 }]), /Only 0 of nut free/);
  assert.equal(inv.available('bolt'), 8);
  assert.equal(inv.holds().length, 2);
});

test('the report is laid out as before', () => {
  const inv = make();
  inv.reserve('bolt', 4);
  assert.equal(stockReport(inv, ['bolt', 'nut']), 'bolt         10 on hand    4 reserved    6 free\nnut           5 on hand    0 reserved    5 free');
});
