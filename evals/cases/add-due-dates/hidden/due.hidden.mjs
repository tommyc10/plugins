import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.ts';

const PAST = '2001-03-04';
const FUTURE = '2999-01-01';
const fresh = (tasks) => {
  const file = join(mkdtempSync(join(tmpdir(), 'due-')), 'tasks.json');
  if (tasks) writeFileSync(file, JSON.stringify(tasks));
  return file;
};
const lines = (out) => out.split('\n');
const lineFor = (out, title) => lines(out).find((l) => l.includes(title));

test('add --due stores the date and list shows it on that line', () => {
  const file = fresh();
  run(['add', 'Pay rent', '--due', FUTURE], file);
  assert.ok(readFileSync(file, 'utf8').includes(FUTURE), 'the date is in the file');
  const out = run(['list'], file);
  assert.ok(lineFor(out, 'Pay rent').includes(FUTURE));
});

test('the flag and its date stay out of the title', () => {
  const file = fresh();
  run(['add', 'Pay rent', '--due', FUTURE], file);
  const [task] = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(task.title, 'Pay rent');
});

test('a task without a due date shows no date', () => {
  const file = fresh();
  run(['add', 'Pay rent', '--due', FUTURE], file);
  run(['add', 'Buy milk'], file);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(lineFor(run(['list'], file), 'Buy milk')));
});

test('overdue pending tasks go first and start with !', () => {
  const file = fresh();
  run(['add', 'later', '--due', FUTURE], file);
  run(['add', 'plain'], file);
  run(['add', 'late', '--due', PAST], file);
  const out = lines(run(['list'], file));
  assert.equal(out.length, 3);
  assert.ok(out[0].includes('late') && out[0].startsWith('!'), out[0]);
  assert.ok(out.slice(1).every((l) => !l.startsWith('!')));
  assert.ok(out[1].includes('later') && out[2].includes('plain'), 'the rest keep their order');
});

test('a done task is never overdue', () => {
  const file = fresh();
  run(['add', 'late', '--due', PAST], file);
  run(['add', 'also late', '--due', PAST], file);
  run(['done', '1'], file);
  const out = run(['list'], file);
  assert.ok(!lineFor(out, '1. late').startsWith('!'));
  assert.ok(lines(out)[0].includes('also late'));
  assert.deepEqual(lines(run(['list', '--overdue'], file)).map((l) => l.includes('also late')), [true]);
});

test('list --overdue shows only overdue pending tasks', () => {
  const file = fresh();
  run(['add', 'later', '--due', FUTURE], file);
  run(['add', 'late', '--due', PAST], file);
  run(['add', 'plain'], file);
  const out = lines(run(['list', '--overdue'], file));
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('late') && out[0].includes(PAST));
});

test('list --overdue with nothing overdue says there are no tasks', () => {
  const file = fresh();
  run(['add', 'later', '--due', FUTURE], file);
  assert.equal(run(['list', '--overdue'], file), 'No tasks.');
});

for (const bad of ['tomorrow', '2026-02-30', '2026-13-01', '12/01/2026', '2026-1-5']) {
  test(`the date ${bad} is an error and saves nothing`, () => {
    const file = fresh();
    assert.throws(() => run(['add', 'Pay rent', '--due', bad], file));
    assert.ok(!existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).length === 0);
  });
}

test('an old file without due dates loads, lists, and takes a dated task', () => {
  const file = fresh([{ id: 1, title: 'old one', done: false }, { id: 2, title: 'old two', done: true }]);
  const before = lines(run(['list'], file));
  assert.equal(before.length, 2);
  assert.ok(before.every((l) => !l.startsWith('!')));
  const after = lines(run(['add', 'new', '--due', PAST], file));
  assert.equal(after.length, 3);
  assert.ok(after[0].includes('new'));
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((t) => t.id), [1, 2, 3]);
});
