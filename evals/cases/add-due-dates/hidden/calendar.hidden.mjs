import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.ts';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'cal-')), 'tasks.json');
// Two days either side of now, so the answer is the same in local time and in UTC.
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test('a task due two days ago is overdue, and one due in two days is not', () => {
  const file = fresh();
  run(['add', 'soon', '--due', day(2)], file);
  run(['add', 'missed', '--due', day(-2)], file);
  const out = run(['list'], file).split('\n');
  assert.ok(out[0].includes('missed') && out[0].startsWith('!'), out[0]);
  assert.ok(!out[1].startsWith('!'), out[1]);
  assert.equal(run(['list', '--overdue'], file).split('\n').length, 1);
});

test('29 February is a date only in a leap year', () => {
  const file = fresh();
  assert.throws(() => run(['add', 'never', '--due', '2025-02-29'], file));
  assert.ok(run(['add', 'leap day', '--due', '2028-02-29'], file).includes('2028-02-29'));
});
