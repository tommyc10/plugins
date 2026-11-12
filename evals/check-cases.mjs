#!/usr/bin/env node
// Proves each case's hidden tests can tell a good change from a bad one, before any run is scored by them:
// the task tests fail on the fixture, the collateral tests pass on it, both pass on the case's solution/,
// and small mutations of the solved code are caught. Spends nothing: no model is called.
// Usage: node evals/check-cases.mjs [case ...] [--min 0.8] [--max-mutants 80] [--survivors]
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runHidden } from './rules.mjs';

const evals = dirname(fileURLToPath(import.meta.url));

// Each rule rewrites one occurrence on one line. A mutant the tests still pass is a behaviour nothing checks.
export const MUTATIONS = [
  [/===/, '!=='], [/!==/, '==='], [/<=/, '<'], [/>=/, '>'], [/(?<![<=>-])<(?![=<>/a-zA-Z!])/, '<='], [/(?<![=>-])>(?![=>])/, '>='],
  [/&&/, '||'], [/\|\|/, '&&'], [/ \+ /, ' - '], [/ - /, ' + '], [/ \* /, ' / '], [/\btrue\b/, 'false'], [/\bfalse\b/, 'true'],
  [/!(?=[a-zA-Z(])/, ''], [/\b0\b/, '1'], [/\b1\b/, '2'], [/\.filter\(/, '.map('], [/\? /, '? !'],
];

const isSource = (file) => /\.(m?js|tsx?)$/.test(file) && !/(^|\/)(checks?|tests?|hidden)\//.test(file) && !/\.(check|test|hidden)\./.test(file);
const isCode = (line) => line.trim() && !/^\s*(\/\/|\*|import |export \{|export type|type |\}|\))/.test(line);

export function mutantsOf(text) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (!isCode(line)) return;
    // In markup an angle bracket is a tag, not a comparison, and changing it only adds stray text.
    const markup = /<\/?[A-Za-z][^<>]*>|\/>/.test(line);
    for (const [pattern, to] of MUTATIONS) {
      if (markup && /[<>]/.test(to)) continue;
      const mutated = line.replace(pattern, to);
      if (mutated !== line) out.push({ line: i + 1, from: line.trim(), to: mutated.trim(), text: [...lines.slice(0, i), mutated, ...lines.slice(i + 1)].join('\n') });
    }
  });
  return out;
}

function filesUnder(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '.git') return [];
    return statSync(p).isDirectory() ? filesUnder(p, base) : [relative(base, p).replaceAll('\\', '/')];
  });
}

// An evenly spaced sample, so a cap still covers every file.
const sample = (xs, n) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]));

export function checkCase(caseDir, { maxMutants = 80 } = {}) {
  const hidden = join(caseDir, 'hidden');
  const expect = existsSync(join(caseDir, 'expect.json')) ? JSON.parse(readFileSync(join(caseDir, 'expect.json'), 'utf8')) : {};
  const result = { problems: [], mutants: 0, killed: 0, survivors: [] };
  if (!existsSync(hidden)) return { ...result, skipped: 'no hidden tests' };
  const work = mkdtempSync(join(tmpdir(), 'tblock-case-'));
  try {
    const base = join(work, 'fixture');
    cpSync(join(caseDir, 'fixture'), base, { recursive: true });
    if (existsSync(join(base, 'package-lock.json'))) {
      const npm = spawnSync('npm', ['ci', '--silent', '--no-audit', '--no-fund'], { cwd: base, encoding: 'utf8', shell: process.platform === 'win32' });
      if (npm.status !== 0) return { ...result, problems: [`npm ci failed: ${(npm.stderr || '').slice(0, 200)}`] };
    }
    const options = { modules: join(base, 'node_modules'), args: expect.hiddenArgs };
    const run = (dir) => ({ task: runHidden(hidden, dir, options), nearby: runHidden(hidden, dir, { ...options, collateral: true }) });
    const passes = (r) => r.task.pass !== false && r.nearby.pass !== false;

    const before = run(base);
    if (before.task.pass !== false) result.problems.push(`the task tests do not fail on the fixture (${before.task.detail})`);
    if (before.nearby.pass === false) result.problems.push(`the collateral tests fail on the fixture (${before.nearby.detail})`);
    if (before.nearby.pass === null) result.note = 'no collateral tests';
    if (!existsSync(join(caseDir, 'solution'))) return { ...result, problems: [...result.problems, 'no solution/ to check the tests against'] };

    const solved = join(work, 'solved');
    cpSync(base, solved, { recursive: true, filter: (src) => !src.endsWith('node_modules') });
    cpSync(join(caseDir, 'solution'), solved, { recursive: true });
    for (const gone of expect.solutionDeletes || []) rmSync(join(solved, gone), { force: true });
    const after = run(solved);
    if (after.task.pass !== true) result.problems.push(`the task tests fail on the solution (${after.task.detail})`);
    if (after.nearby.pass === false) result.problems.push(`the collateral tests fail on the solution (${after.nearby.detail})`);
    if (result.problems.length) return result;

    const all = filesUnder(solved).filter(isSource).flatMap((file) => mutantsOf(readFileSync(join(solved, file), 'utf8')).map((m) => ({ ...m, file })));
    for (const m of sample(all, maxMutants)) {
      const original = readFileSync(join(solved, m.file), 'utf8');
      writeFileSync(join(solved, m.file), m.text);
      result.mutants += 1;
      if (passes(run(solved))) result.survivors.push(`${m.file}:${m.line}  ${m.from}  =>  ${m.to}`);
      else result.killed += 1;
      writeFileSync(join(solved, m.file), original);
    }
    result.possible = all.length;
    return result;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const take = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv.splice(i, 2)[1]) : fallback; };
  const min = take('--min', 0.8);
  const maxMutants = take('--max-mutants', 80);
  const showSurvivors = argv.includes('--survivors');
  const names = argv.filter((a) => !a.startsWith('--'));
  const cases = (names.length ? names : readdirSync(join(evals, 'cases'))).filter((n) => existsSync(join(evals, 'cases', n, 'case.yaml')));
  let failed = false;
  for (const name of cases) {
    const r = checkCase(join(evals, 'cases', name), { maxMutants });
    if (r.skipped) { console.log(`${name.padEnd(22)} skipped: ${r.skipped}`); continue; }
    const score = r.mutants ? r.killed / r.mutants : null;
    const bad = r.problems.length > 0 || (score !== null && score < min);
    failed ||= bad;
    console.log(`${name.padEnd(22)} ${bad ? 'FAIL' : 'ok  '} ${r.problems.length ? r.problems.join('; ') : `fails on fixture, passes on solution, killed ${r.killed} of ${r.mutants} mutants (${Math.round(score * 100)}%, ${r.possible} possible)`}${r.note ? `. Note: ${r.note}` : ''}`);
    if (showSurvivors || bad) for (const s of r.survivors) console.log(`    survived  ${s}`);
  }
  process.exit(failed ? 1 : 0);
}
