import test from 'node:test';
import assert from 'node:assert/strict';
import { add, complete, pending } from '../src/tasks.ts';
import { list } from '../src/format.ts';

test('add assigns the next id', () => {
  assert.deepEqual(add(add([], 'a'), 'b').map((t) => t.id), [1, 2]);
});
test('complete marks one task done', () => {
  assert.deepEqual(pending(complete(add(add([], 'a'), 'b'), 1)).map((t) => t.title), ['b']);
});
test('list prints a line per task', () => {
  assert.equal(list(add([], 'a')), '[ ] 1. a');
});
