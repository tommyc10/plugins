import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board } from './helper-dom.js';

test('adding a task appends it and clears the box', async () => {
  const b = await board();
  await b.add('  Renew passport  ');
  assert.deepEqual(b.titles(), ['Write report', 'Book flights', 'Call plumber', 'Renew passport']);
  assert.equal(b.el.querySelector('input[aria-label="New task"]').value, '');
});

test('a blank title adds nothing', async () => {
  const b = await board();
  await b.add('   ');
  assert.equal(b.titles().length, 3);
});

test('ticking and unticking a task flips its checkbox and its class', async () => {
  const b = await board();
  await b.tick('Write report');
  assert.equal(b.item('Write report').querySelector('input[type=checkbox]').checked, true);
  assert.equal(b.item('Write report').className, 'task done');
  await b.tick('Write report');
  assert.equal(b.item('Write report').querySelector('input[type=checkbox]').checked, false);
  assert.equal(b.item('Write report').className, 'task');
});

test('removing a task takes only that one away', async () => {
  const b = await board();
  await b.remove('Book flights');
  assert.deepEqual(b.titles(), ['Write report', 'Call plumber']);
});

test('the footer still counts every task', async () => {
  const b = await board();
  assert.equal(b.el.querySelector('p.count').textContent.replace(/\s+/g, ' ').trim(), '3 tasks');
  await b.remove('Book flights');
  await b.remove('Call plumber');
  assert.equal(b.el.querySelector('p.count').textContent.replace(/\s+/g, ' ').trim(), '1 task');
});

test('a task added after a removal gets its own row', async () => {
  const b = await board();
  await b.remove('Call plumber');
  await b.add('Renew passport');
  await b.add('Water plants');
  assert.deepEqual(b.titles(), ['Write report', 'Book flights', 'Renew passport', 'Water plants']);
  await b.tick('Renew passport');
  assert.equal(b.item('Water plants').className, 'task');
});

test('the heading and the add box are still there', async () => {
  const b = await board([]);
  assert.equal(b.el.querySelector('h1').textContent, 'Tasks');
  assert.ok(b.button('Add'));
});
