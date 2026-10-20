// Runs the real probe script in a throwaway project whose log command prints a sample log.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PROBE = join(dirname(fileURLToPath(import.meta.url)), 'probe.mjs');

const SAMPLE = [
  '2026-10-20T09:00:00Z INFO server started on port 8081',
  '{"time":"2026-10-20T09:00:01Z","level":"info","msg":"loaded 214 orders at 1729440000000"}',
  '2026-10-20T09:00:02Z ERROR sync failed for order 4f1c2a7e-1b2c-4d5e-8f90-123456789abc: total is undefined',
  '    at orderTotal (src/orders/total.ts:42:13)',
  '    at handler (src/api/orders.ts:88:5)',
  '2026-10-20T09:00:03Z WARN slow query took 1800ms',
  '2026-10-20T09:00:04Z ERROR sync failed for order 9a8b7c6d-1111-2222-3333-444455556666: total is undefined',
  '    at orderTotal (src/orders/total.ts:42:13)',
  '2026-10-20T09:00:05Z INFO request from jane.doe@example.com with Authorization: Bearer abc.def-123 password=hunter2',
  '2026-10-20T09:00:06Z INFO card 4111 1111 1111 1111 seen',
].join('\n');

function project(sources, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'probe-test-'));
  mkdirSync(join(dir, '.tblock'));
  writeFileSync(join(dir, 'app.log'), SAMPLE);
  writeFileSync(join(dir, '.tblock', 'probe.json'), JSON.stringify({ sources, ...extra }));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [PROBE, ...args], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { dir, run };
}

const json = (r) => JSON.parse(r.out);

test('the summary finds the first error, groups repeats, and points at the code', () => {
  const { run } = project({ api: { command: 'cat app.log' } });
  const r = json(run('--json'));
  assert.match(r.firstError, /sync failed for order .*: total is undefined/);
  assert.equal(r.topErrors[0].count, 2, 'two errors that differ only by order id group together');
  assert.deepEqual(r.codePointers[0], { at: 'src/orders/total.ts:42', count: 2 });
  assert.equal(r.levels.error, 2);
  assert.equal(r.levels.warn, 1);
});

test('secrets are masked, and ordinary numbers are not', () => {
  const { run } = project({ api: { command: 'cat app.log' } });
  const out = run('--raw').out;
  assert.doesNotMatch(out, /jane\.doe@example\.com|abc\.def-123|hunter2|4111 1111 1111 1111/);
  assert.match(out, /\[masked-email\]/);
  assert.match(out, /Bearer \[masked\]/);
  assert.match(out, /password=\[masked\]/);
  assert.match(out, /\[masked-number\]/);
  assert.match(out, /1729440000000/, 'an epoch timestamp is not a card number');
});

test('a level filter keeps a stack trace with its error line', () => {
  const { run } = project({ api: { command: 'cat app.log' } });
  const lines = run('--raw', '--level', 'error').out.trim().split('\n');
  assert.equal(lines.length, 5);
  assert.ok(lines.every((l) => /ERROR|\s+at /.test(l)), lines.join('\n'));
});

test('grep and tail narrow the slice', () => {
  const { run } = project({ api: { command: 'cat app.log' } });
  assert.equal(run('--raw', '--grep', 'slow query').out.trim().split('\n').length, 1);
  assert.equal(run('--raw', '--tail', '2').out.trim().split('\n').length, 2);
});

test('--since reaches the command, and the source can be chosen', () => {
  const { run } = project({ api: { command: 'cat app.log' }, clock: { command: 'echo "INFO since={since}"' } });
  assert.match(run('--source', 'clock', '--since', '2h', '--raw').out, /since=2h/);
  assert.equal(run('--source', 'nope').code, 2);
});

test('a source marked confirm runs only with --yes', () => {
  const { run } = project({ prod: { command: 'cat app.log', confirm: true } });
  const refused = run('--source', 'prod');
  assert.equal(refused.code, 2);
  assert.match(refused.err, /confirm: true/);
  assert.equal(run('--source', 'prod', '--yes', '--json').code, 0);
});

test('a missing config and a failing command both explain themselves', () => {
  const empty = mkdtempSync(join(tmpdir(), 'probe-empty-'));
  const missing = spawnSync(process.execPath, [PROBE], { cwd: empty, encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no \.tblock\/probe\.json/);

  const { run } = project({ broken: { command: 'command-that-does-not-exist-xyz' } });
  const r = run('--source', 'broken');
  assert.equal(r.code, 2);
  assert.match(r.err, /command failed/);
});

test('bad options are rejected before anything runs', () => {
  const { run } = project({ api: { command: 'cat app.log' } });
  assert.match(run('--since', 'yesterday').err, /--since must look like/);
  assert.match(run('--level', 'loud').err, /--level must be one of/);
});
