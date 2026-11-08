#!/usr/bin/env node
// Runs the eval suite through `claude plugin eval`, then scores every run with the tblock rules,
// the hidden tests, and the diff against the fixture, and appends one row to evals/history.jsonl.
// Usage: node evals/run.mjs [--label <text>] [any claude plugin eval flag, e.g. --model sonnet --runs 5 --case fix-*]
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkRules, checkScope, diffDirs, parseTrace, principleNames, runHidden } from './rules.mjs';

const evals = dirname(fileURLToPath(import.meta.url));
const root = resolve(evals, '..');
const argv = process.argv.slice(2);
const labelAt = argv.indexOf('--label');
const label = labelAt >= 0 ? argv.splice(labelAt, 2)[1] : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(evals, 'results', stamp);
mkdirSync(out, { recursive: true });

const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();
// claude plugin eval refuses any run granted a shell it cannot sandbox, which on Windows is every run, so only shell-free cases run there.
const grants = process.platform === 'win32' ? ['Edit', 'Write'] : ['Bash', 'Edit', 'Write'];
if (process.platform === 'win32') console.log('Windows has no sandbox for Bash, so cases that need it will be refused. Run those on Linux, macOS, or WSL.\n');
const args = ['plugin', 'eval', root, '--keep-temp', '--scaffold', '--allow-tools', ...grants,
  '--json', join(out, 'eval.json'), '--output-dir', out, ...(argv.includes('--publish-report') ? [] : ['--no-publish']), ...argv];
console.log(`claude ${args.join(' ')}\n`);
const run = spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (!existsSync(join(out, 'eval.json'))) { console.error(`No eval.json in ${out}; claude exited ${run.status}.`); process.exit(run.status || 1); }

const result = JSON.parse(readFileSync(join(out, 'eval.json'), 'utf8'));
const principles = principleNames(root);
const scored = [];

for (const c of result.cases) {
  const caseDir = resolve(root, c.dir);
  const expect = existsSync(join(caseDir, 'expect.json')) ? JSON.parse(readFileSync(join(caseDir, 'expect.json'), 'utf8')) : {};
  for (const [arm, runs] of Object.entries(c.arms || {})) {
    runs.forEach((r, i) => {
      const row = { case: c.name, arm, run: i + 1, native: r.score, error: r.error, cost: r.costUsd, seconds: r.durationSeconds, checks: [] };
      const temp = r.tracePath ? dirname(dirname(r.tracePath)) : null;
      // A run that never started still passes every "must not" grader, so it can't count toward any score.
      if (r.error || !r.turns) row.invalid = String(r.error || 'the agent took no turns').split(' · ')[0];
      else if (temp && existsSync(r.tracePath)) {
        const trace = parseTrace(readFileSync(r.tracePath, 'utf8'));
        const cwd = join(temp, 'home', 'cwd');
        row.checks.push(...checkRules(trace, { principles, plugin: arm === 'with' }));
        const diff = diffDirs(join(caseDir, 'fixture'), cwd);
        row.diff = { files: diff.changed.length, added: diff.added, removed: diff.removed };
        if (expect.touch) row.checks.push(checkScope(diff.changed, expect.touch));
        if (existsSync(join(caseDir, 'hidden'))) row.checks.push(runHidden(join(caseDir, 'hidden'), cwd));
        row.tools = trace.tools.length;
        row.reply = trace.reply;
      } else {
        row.checks.push({ name: 'trace-found', pass: false, detail: 'no trace kept for this run' });
      }
      if (temp && temp.includes('claude-eval-')) rmSync(temp, { recursive: true, force: true });
      scored.push(row);
    });
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ruleRate = (rows) => {
  const checks = rows.flatMap((r) => r.checks).filter((x) => x.pass !== null);
  return checks.length ? checks.filter((x) => x.pass).length / checks.length : null;
};
const valid = scored.filter((r) => !r.invalid);
const invalid = scored.filter((r) => r.invalid);
const byCase = {};
for (const row of valid) ((byCase[row.case] ||= {})[row.arm] ||= []).push(row);

const summary = Object.fromEntries(Object.entries(byCase).map(([name, arms]) => [name, Object.fromEntries(Object.entries(arms).map(([arm, rows]) => [arm, {
  runs: rows.length,
  native: mean(rows.map((r) => r.native ?? 0)),
  checks: ruleRate(rows),
  hidden: mean(rows.flatMap((r) => r.checks.filter((x) => x.name === 'hidden-tests-pass').map((x) => (x.pass ? 1 : 0)))),
  lines: mean(rows.filter((r) => r.diff).map((r) => r.diff.added + r.diff.removed)),
  cost: mean(rows.map((r) => r.cost ?? 0)),
}]))]));

const history = join(evals, 'history.jsonl');
const previous = existsSync(history) ? readFileSync(history, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const entry = {
  at: result.startedAt, label, commit: git('rev-parse', '--short', 'HEAD'), dirty: git('status', '--porcelain', '--', 'skills', 'agents').length > 0,
  model: result.suite?.modelOverride || 'default', claude: result.claudeVersion, ablation: result.suite?.ablation, cost: result.costUsd,
  invalid: invalid.length, cases: summary,
};
const prior = previous.filter((p) => p.model === entry.model).at(-1);
if (valid.length) appendFileSync(history, `${JSON.stringify(entry)}\n`);
writeFileSync(join(out, 'scorecard.json'), JSON.stringify({ entry, runs: scored }, null, 2));

const pct = (n) => (n === null || n === undefined ? '  -  ' : `${Math.round(n * 100)}%`.padStart(5));
const num = (n) => (n === null || n === undefined ? '  -' : String(Math.round(n)).padStart(4));
const trend = (now, then) => (now === null || then === null || then === undefined ? '' : now > then ? ' ↑' : now < then ? ' ↓' : ' =');
console.log(`\n${'CASE'.padEnd(22)} ARM      NATIVE  RULES HIDDEN LINES   COST`);
for (const [name, arms] of Object.entries(summary)) {
  for (const [arm, s] of Object.entries(arms)) {
    const was = prior?.cases?.[name]?.[arm];
    console.log(`${name.padEnd(22)} ${arm.padEnd(8)} ${pct(s.native)}${trend(s.native, was?.native).padEnd(2)} ${pct(s.checks)}${trend(s.checks, was?.checks).padEnd(2)}${pct(s.hidden)} ${num(s.lines)}  $${(s.cost ?? 0).toFixed(2)}`);
  }
}
const failing = scored.filter((r) => r.arm === 'with').flatMap((r) => r.checks.filter((x) => x.pass === false).map((x) => `${r.case} #${r.run} ${x.name}: ${x.detail}`));
if (failing.length) console.log(`\nFailed checks on the tblock arm:\n  ${failing.join('\n  ')}`);
if (invalid.length) {
  const reasons = [...new Set(invalid.map((r) => r.invalid))];
  console.log(`\n${invalid.length} run(s) never ran and are left out of every score (${[...new Set(invalid.map((r) => r.case))].join(', ')}):\n  ${reasons.join('\n  ')}`);
}
console.log(`\nTotal $${(result.costUsd ?? 0).toFixed(2)}. Scorecard ${join(out, 'scorecard.json')}. ${valid.length ? `History ${history}${prior ? `, compared with ${prior.commit} (${prior.at.slice(0, 10)})` : ''}.` : 'No valid runs, so history is unchanged.'}`);
process.exit(valid.length ? run.status ?? 0 : 1);
