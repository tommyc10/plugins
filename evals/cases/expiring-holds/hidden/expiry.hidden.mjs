import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from '../src/inventory.js';
import { stockReport } from '../src/report.js';

const setup = (stock = { bolt: 10, nut: 5 }) => {
  const clock = { t: 1_000_000 };
  return { clock, inv: createInventory({ stock, now: () => clock.t }) };
};

test('a hold with a ttl frees its stock once the time has passed', () => {
  const { clock, inv } = setup();
  inv.reserve('bolt', 4, { ttlMs: 5000 });
  assert.equal(inv.available('bolt'), 6);
  clock.t += 4999;
  assert.equal(inv.available('bolt'), 6);
  clock.t += 2;
  assert.equal(inv.available('bolt'), 10);
});

test('a hold without a ttl never expires', () => {
  const { clock, inv } = setup();
  const id = inv.reserve('bolt', 4);
  clock.t += 10 * 365 * 86_400_000;
  assert.equal(inv.available('bolt'), 6);
  assert.deepEqual(inv.sweep(), []);
  inv.release(id);
  assert.equal(inv.available('bolt'), 10);
});

test('expired stock can be held again without a sweep', () => {
  const { clock, inv } = setup();
  inv.reserve('bolt', 10, { ttlMs: 1000 });
  assert.throws(() => inv.reserve('bolt', 1), /Only 0 of bolt free/);
  clock.t += 1001;
  inv.reserve('bolt', 10);
  assert.equal(inv.available('bolt'), 0);
});

test('sweep drops the expired holds and returns their ids, once', () => {
  const { clock, inv } = setup();
  const short = inv.reserve('bolt', 2, { ttlMs: 1000 });
  const long = inv.reserve('bolt', 3, { ttlMs: 60_000 });
  const forever = inv.reserve('nut', 1);
  const other = inv.reserve('nut', 2, { ttlMs: 500 });
  assert.deepEqual(inv.sweep(), []);
  clock.t += 1001;
  assert.deepEqual(inv.sweep().sort(), [short, other].sort());
  assert.deepEqual(inv.sweep(), []);
  assert.deepEqual(inv.holds().map((h) => h.id).sort(), [long, forever].sort());
  assert.equal(inv.available('bolt'), 7);
  assert.equal(inv.available('nut'), 4);
});

test('releasing an expired hold is an error, before a sweep and after one', () => {
  const { clock, inv } = setup();
  const a = inv.reserve('bolt', 2, { ttlMs: 1000 });
  const b = inv.reserve('bolt', 2, { ttlMs: 1000 });
  clock.t += 1001;
  assert.throws(() => inv.release(a), new RegExp(`No hold ${a}`));
  inv.sweep();
  assert.throws(() => inv.release(b), new RegExp(`No hold ${b}`));
  assert.equal(inv.available('bolt'), 10);
});

test('a hold can still be released before it expires', () => {
  const { clock, inv } = setup();
  const id = inv.reserve('bolt', 2, { ttlMs: 1000 });
  clock.t += 500;
  inv.release(id);
  assert.equal(inv.available('bolt'), 10);
  clock.t += 1000;
  assert.deepEqual(inv.sweep(), []);
});

test('the report leaves expired holds out of the reserved column', () => {
  const { clock, inv } = setup();
  inv.reserve('bolt', 4, { ttlMs: 1000 });
  inv.reserve('bolt', 1);
  assert.equal(stockReport(inv, ['bolt']), 'bolt         10 on hand    5 reserved    5 free');
  clock.t += 1001;
  assert.equal(stockReport(inv, ['bolt']), 'bolt         10 on hand    1 reserved    9 free');
});
