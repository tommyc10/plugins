import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.ts';

const fresh = (tasks) => {
  const file = join(mkdtempSync(join(tmpdir(), 'tasks-')), 'tasks.json');
  if (tasks) writeFileSync(file, JSON.stringify(tasks));
  return file;
};

test('tasks without due dates print exactly as before', () => {
  const file = fresh();
  run(['add', 'Buy milk'], file);
  run(['add', '  Walk dog  '], file);
  assert.equal(run(['done', '1'], file), '[x] 1. Buy milk\n[ ] 2. Walk dog');
  assert.equal(run(['list'], file), '[x] 1. Buy milk\n[ ] 2. Walk dog');
});

test('list --pending still hides done tasks', () => {
  const file = fresh([{ id: 1, title: 'a', done: true }, { id: 2, title: 'b', done: false }]);
  assert.equal(run(['list', '--pending'], file), '[ ] 2. b');
});

test('an empty list still says so', () => {
  assert.equal(run(['list'], fresh()), 'No tasks.');
});

test('stats still counts', () => {
  const file = fresh([{ id: 1, title: 'a', done: true }, { id: 2, title: 'b', done: false }, { id: 3, title: 'c', done: false }]);
  assert.equal(run(['stats'], file), '3 tasks, 1 done, 2 to do');
});

test('ids still continue from the highest', () => {
  const file = fresh([{ id: 7, title: 'a', done: false }]);
  run(['add', 'b'], file);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((t) => t.id), [7, 8]);
});

test('done on a missing id and add without a title still fail', () => {
  const file = fresh([{ id: 1, title: 'a', done: false }]);
  assert.throws(() => run(['done', '9'], file), /No task 9/);
  assert.throws(() => run(['add', '   '], file), /title/);
});

test('an unknown command still prints usage that names the old commands', () => {
  const out = run(['nope'], fresh());
  for (const word of ['add', 'done', 'list', '--pending', 'stats']) assert.ok(out.includes(word), word);
});
