import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkCase, mutantsOf } from './check-cases.mjs';
import { runHidden } from './rules.mjs';

const HEAD = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { isAdult, label } from '../src/age.js';\n";
const BROKEN = "export const isAdult = (age) => age > 21;\nexport const label = (age) => (isAdult(age) ? 'adult' : 'minor');\n";
const SOLVED = BROKEN.replace('age > 21', 'age >= 18');

function makeCase(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-check-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const withCase = (files, fn) => { const dir = makeCase(files); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

const strong = `${HEAD}test('18 is an adult', () => assert.equal(isAdult(18), true));\ntest('17 is not', () => assert.equal(isAdult(17), false));\n`;
const weak = `${HEAD}test('19 is an adult', () => assert.equal(isAdult(19), true));\n`;
const nearby = `${HEAD}test('labels', () => { assert.equal(label(40), 'adult'); assert.equal(label(3), 'minor'); });\n`;

test('a case whose tests pin the boundary passes, and one that leaves it open shows the surviving mutant', () => {
  const base = { 'fixture/src/age.js': BROKEN, 'solution/src/age.js': SOLVED, 'hidden/collateral.hidden.mjs': nearby };
  withCase({ ...base, 'hidden/age.hidden.mjs': strong }, (dir) => {
    const r = checkCase(dir);
    assert.deepEqual(r.problems, []);
    assert.ok(r.mutants > 0);
    assert.ok(!r.survivors.some((s) => s.includes('age > 18')), 'the off-by-one mutant is caught');
  });
  withCase({ ...base, 'hidden/age.hidden.mjs': weak }, (dir) => {
    assert.ok(checkCase(dir).survivors.some((s) => s.includes('age > 18')), 'nothing checks 18 itself');
  });
});

test('hidden tests that already pass on the fixture, or fail on the solution, are reported', () => {
  const base = { 'fixture/src/age.js': BROKEN, 'solution/src/age.js': SOLVED, 'hidden/collateral.hidden.mjs': nearby };
  withCase({ ...base, 'hidden/age.hidden.mjs': `${HEAD}test('40 is an adult', () => assert.equal(isAdult(40), true));\n` }, (dir) => {
    assert.match(checkCase(dir).problems.join(), /do not fail on the fixture/);
  });
  withCase({ ...base, 'hidden/age.hidden.mjs': `${HEAD}test('impossible', () => assert.equal(isAdult(18), 'yes'));\n` }, (dir) => {
    assert.match(checkCase(dir).problems.join(), /fail on the solution/);
  });
  withCase({ ...base, 'hidden/age.hidden.mjs': strong, 'hidden/collateral.hidden.mjs': `${HEAD}test('wrong', () => assert.equal(label(40), 'minor'));\n` }, (dir) => {
    assert.match(checkCase(dir).problems.join(), /collateral tests fail on the fixture/);
  });
});

test('collateral tests score apart from the task tests', () => withCase({ 'src/age.js': BROKEN, 'hidden/age.hidden.mjs': strong, 'hidden/collateral.hidden.mjs': nearby }, (dir) => {
  assert.deepEqual([runHidden(join(dir, 'hidden'), dir).pass, runHidden(join(dir, 'hidden'), dir, { collateral: true }).pass], [false, true]);
  assert.equal(runHidden(join(dir, 'hidden'), dir).name, 'hidden-tests-pass');
  assert.equal(runHidden(join(dir, 'hidden'), dir, { collateral: true }).name, 'collateral-tests-pass');
}));

test('mutants change code and leave comments, imports and markup tags alone', () => {
  const lines = (text) => mutantsOf(text).map((m) => m.to);
  assert.ok(lines('const ok = a >= b && c;').includes('const ok = a > b && c;'));
  assert.deepEqual(lines("// a >= b\nimport { a } from './a.js';"), []);
  assert.ok(!lines('<ul className="x">').some((l) => /[<>]=/.test(l)));
});
