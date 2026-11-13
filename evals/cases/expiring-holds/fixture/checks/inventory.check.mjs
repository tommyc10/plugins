import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from '../src/inventory.js';
import { stockReport } from '../src/report.js';

test('a hold takes stock out of what is free', () => {
  const inv = createInventory({ stock: { bolt: 10 } });
  inv.reserve('bolt', 4);
  assert.equal(inv.available('bolt'), 6);
});

test('the report lines up', () => {
  const inv = createInventory({ stock: { bolt: 10 } });
  inv.reserve('bolt', 4);
  assert.equal(stockReport(inv, ['bolt']), 'bolt         10 on hand    4 reserved    6 free');
});
