import { test } from 'node:test';
import assert from 'node:assert/strict';
import { board, SEED } from './helper-dom.js';

test('three filter buttons show their counts, and All starts selected', async () => {
  const b = await board();
  assert.deepEqual(b.labels(), ['All (3)', 'Active (2)', 'Done (1)']);
  assert.deepEqual(b.pressed(), ['All']);
  for (const name of ['Active', 'Done']) assert.equal(b.button(name).getAttribute('aria-pressed'), 'false');
  assert.deepEqual(b.titles(), ['Write report', 'Book flights', 'Call plumber']);
});

test('Active shows only tasks that are not done', async () => {
  const b = await board();
  await b.filter('Active');
  assert.deepEqual(b.titles(), ['Write report', 'Call plumber']);
  assert.deepEqual(b.pressed(), ['Active']);
});

test('Done shows only finished tasks, and All brings everything back', async () => {
  const b = await board();
  await b.filter('Done');
  assert.deepEqual(b.titles(), ['Book flights']);
  assert.deepEqual(b.pressed(), ['Done']);
  await b.filter('All');
  assert.deepEqual(b.titles(), ['Write report', 'Book flights', 'Call plumber']);
});

test('an empty filter says Nothing here, and a filter with tasks does not', async () => {
  const b = await board(SEED.map((t) => ({ ...t, done: false })));
  assert.ok(!b.text().includes('Nothing here.'));
  await b.filter('Done');
  assert.equal(b.el.querySelectorAll('li').length, 0);
  assert.ok(b.text().includes('Nothing here.'));
  await b.filter('Active');
  assert.ok(!b.text().includes('Nothing here.'));
});

test('a board with no tasks says Nothing here under every filter', async () => {
  const b = await board([]);
  assert.deepEqual(b.labels(), ['All (0)', 'Active (0)', 'Done (0)']);
  assert.ok(b.text().includes('Nothing here.'));
});

test('ticking a task under Active drops it from the list and moves the counts', async () => {
  const b = await board();
  await b.filter('Active');
  await b.tick('Write report');
  assert.deepEqual(b.titles(), ['Call plumber']);
  assert.deepEqual(b.labels(), ['All (3)', 'Active (1)', 'Done (2)']);
  assert.deepEqual(b.pressed(), ['Active']);
});

test('adding a task under Done keeps the filter and counts the new task', async () => {
  const b = await board();
  await b.filter('Done');
  await b.add('Renew passport');
  assert.deepEqual(b.pressed(), ['Done']);
  assert.deepEqual(b.titles(), ['Book flights']);
  assert.deepEqual(b.labels(), ['All (4)', 'Active (3)', 'Done (1)']);
  await b.filter('Active');
  assert.deepEqual(b.titles(), ['Write report', 'Call plumber', 'Renew passport']);
});

test('removing the last task under a filter leaves the filter and the empty message', async () => {
  const b = await board();
  await b.filter('Done');
  await b.remove('Book flights');
  assert.deepEqual(b.pressed(), ['Done']);
  assert.ok(b.text().includes('Nothing here.'));
  assert.deepEqual(b.labels(), ['All (2)', 'Active (2)', 'Done (0)']);
});
