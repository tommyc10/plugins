import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interval, question, stripFingerprints, tally } from './judge.mjs';

const reply = `Size: small

**Goal.** You want two decimals on every price.

**Fix.** I added \`toFixed(2)\`.

**Verification.** \`node --test\` reported 5 passing.

Principles applied:
- **Fix Root Causes.** I fixed the formatter, not its callers.

**Bro version.** Prices show two decimals now. Tests pass.`;

test('a judge cannot tell a tblock reply by its size line, goal label, principles or bro version', () => {
  const clean = stripFingerprints(reply, ['Fix Root Causes']);
  for (const mark of ['Size:', 'Bro version', 'Principles applied', 'Fix Root Causes', '**Goal.**']) assert.ok(!clean.includes(mark), mark);
  assert.ok(clean.includes('You want two decimals on every price.'), 'the goal sentence stays');
  assert.ok(clean.includes('`node --test` reported 5 passing.'), 'the evidence stays');
});

test('a plain reply passes through unchanged', () => {
  const plain = 'Fixed the formatter.\n\nTests pass: 5 of 5.';
  assert.equal(stripFingerprints(plain, ['Fix Root Causes']), plain);
});

test('an inline size line is cut without taking the sentence after it', () => {
  assert.equal(stripFingerprints('Size: small (a few files). Tasks now take due dates.'), 'Tasks now take due dates.');
});

test('the tally counts a tie as half, and reports how often the first-shown side won', () => {
  const j = (winner, shownFirst, pair = 'p') => ({ winner, shownFirst, pair });
  const t = tally([j('B', 'A'), j('B', 'B'), j('tie', 'A'), j('A', 'A')]);
  assert.deepEqual([t.a, t.b, t.ties], [1, 2, 1]);
  assert.equal(t.preferB, 2.5 / 4);
  assert.equal(t.firstShownWon, 2 / 4);
});

test('the interval is narrow when every pair agrees and wide when pairs split', () => {
  const all = (winner, n) => Array.from({ length: n }, (_, i) => ({ winner, shownFirst: 'A', pair: `p${i}` }));
  assert.deepEqual(interval(all('B', 10)), [1, 1]);
  const [low, high] = interval([...all('B', 5), ...all('A', 5).map((x, i) => ({ ...x, pair: `q${i}` }))]);
  assert.ok(low < 0.35 && high > 0.65, `${low} to ${high}`);
});

test('the question shows both sides the same way and never names the variant', () => {
  const x = { task: 'Fix the price.', diff: '+a', reply };
  const y = { task: 'Fix the price.', diff: '+b', reply: 'Done. Tests pass.' };
  const q = question(x, y, ['Fix Root Causes']);
  assert.ok(q.indexOf('## Engineer A') < q.indexOf('## Engineer B'));
  assert.doesNotMatch(q, /tblock|Bro version|Size:/);
});
