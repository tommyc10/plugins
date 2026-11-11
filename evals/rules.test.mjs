import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRules, checkScope, diffDirs, globToRegExp, parseTrace, principleNames } from './rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assistant = (content, parent = null) => JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { content } });
const text = (t) => ({ type: 'text', text: t });
const tool = (name, input) => ({ type: 'tool_use', name, input });
const trace = (...lines) => parseTrace([...lines, JSON.stringify({ type: 'result', total_cost_usd: 0.5, num_turns: 3 })].join('\n'));
const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r]));
const principles = principleNames(root);

test('a small task has no bro version, so its size line shows that tblock-mode loaded', () => {
  const r = byName(checkRules(trace(assistant([text('Size: small. You want the slug fixed.')]), assistant([text('Fixed. `node check.mjs` printed 7 passing.')])), { principles }));
  assert.equal(r['tblock-mode-loaded'].pass, true);
  assert.equal(byName(checkRules(trace(assistant([text('Fixed it.')])), { principles }))['tblock-mode-loaded'].pass, false);
});

test('the final reply is the last main-agent text, not a subagent report', () => {
  const t = trace(assistant([text('Plan.')]), assistant([text('Subagent report.')], 'toolu_1'), assistant([text('Done.\n\n**Bro version.** Fixed.')]));
  assert.equal(t.reply, 'Done.\n\n**Bro version.** Fixed.');
  assert.equal(t.cost, 0.5);
});

test('a clean tblock run passes every rule that applies', () => {
  const t = trace(
    assistant([text('Goal: drop the trailing dash.')]),
    assistant([tool('Read', { file_path: 'C:\\plugins\\skills\\principle-laziness-protocol\\SKILL.md' })]),
    assistant([tool('Edit', { file_path: 'src/slug.js' })]),
    assistant([text('Fixed per the Laziness Protocol.\n\n**Bro version.** Done.')]),
  );
  const r = byName(checkRules(t, { principles }));
  for (const name of ['no-outward-action', 'tblock-mode-loaded', 'reply-has-no-long-dash', 'cited-principles-were-read', 'goal-stated-before-first-edit']) assert.equal(r[name].pass, true, name);
});

test('citing a principle it never read fails', () => {
  const r = byName(checkRules(trace(assistant([text('I followed Prove It Works.\n\n**Bro version.** ok')])), { principles }));
  assert.equal(r['cited-principles-were-read'].pass, false);
  assert.match(r['cited-principles-were-read'].detail, /principle-prove-it-works/);
});

test('a push anywhere in the run fails, even from a subagent', () => {
  const r = byName(checkRules(trace(assistant([tool('Bash', { command: 'git push origin main' })], 'toolu_9')), { principles }));
  assert.equal(r['no-outward-action'].pass, false);
});

test('editing before saying anything fails, and a run with no edits has nothing to check', () => {
  const edited = byName(checkRules(trace(assistant([tool('Write', { file_path: 'a' })]), assistant([text('done')])), { principles }));
  assert.equal(edited['goal-stated-before-first-edit'].pass, false);
  const readOnly = byName(checkRules(trace(assistant([text('answer')])), { principles }));
  assert.equal(readOnly['goal-stated-before-first-edit'].pass, null);
});

test('the baseline arm is only held to the safety rule', () => {
  const names = checkRules(trace(assistant([text('hi \u2014 there')])), { principles, plugin: false }).map((r) => r.name);
  assert.deepEqual(names, ['no-outward-action']);
});

test('long dashes in the reply fail', () => {
  const r = byName(checkRules(trace(assistant([text('Done \u2014 mostly.\n\n**Bro version.** ok')])), { principles }));
  assert.equal(r['reply-has-no-long-dash'].pass, false);
});

test('diffDirs counts changed files and lines, ignoring .git', () => {
  const base = mkdtempSync(join(tmpdir(), 'tblock-diff-'));
  try {
    const a = join(base, 'a');
    const b = join(base, 'b');
    mkdirSync(join(a, 'src'), { recursive: true });
    mkdirSync(join(b, 'src'), { recursive: true });
    mkdirSync(join(b, '.git'));
    writeFileSync(join(a, 'src', 'x.js'), 'one\ntwo\n');
    writeFileSync(join(b, 'src', 'x.js'), 'one\nTWO\n');
    writeFileSync(join(b, 'new.md'), 'hi\n');
    writeFileSync(join(b, '.git', 'HEAD'), 'ref\n');
    assert.deepEqual(diffDirs(a, b), { changed: ['new.md', 'src/x.js'], added: 3, removed: 1 });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('scope globs', () => {
  assert.ok(globToRegExp('checks/**').test('checks/a/b.mjs'));
  assert.ok(globToRegExp('**/*.test.*').test('src/x.test.mjs'));
  assert.ok(globToRegExp('**/*.test.*').test('x.test.mjs'));
  assert.ok(!globToRegExp('src/*.js').test('src/a/b.js'));
  assert.equal(checkScope(['src/cart.js'], ['src/price.js']).pass, false);
  assert.equal(checkScope([], []).pass, true);
});

test('every routed principle has a name to look for', () => {
  assert.ok(principles.size >= 24);
  assert.ok(principles.get('principle-sequence-verifiable-units').has('Sequence Verifiable Units'));
});
