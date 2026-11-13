#!/usr/bin/env node
// Runs the eval suite through `claude plugin eval`, then scores every run with the tblock rules,
// the hidden tests, and the diff against the fixture, and appends one row to evals/history.jsonl.
// Usage: node evals/run.mjs [--label <text>] [any claude plugin eval flag, e.g. --model sonnet --runs 5 --case fix-*]
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkRules, checkScope, diffDirs, parseTrace, principleNames, runHidden } from './rules.mjs';
import { attributeSession, median } from './attribute.mjs';
import { loadPrices } from '../bin/usage.mjs';

const evals = dirname(fileURLToPath(import.meta.url));
const root = resolve(evals, '..');
const argv = process.argv.slice(2);
const labelAt = argv.indexOf('--label');
const label = labelAt >= 0 ? argv.splice(labelAt, 2)[1] : null;
// --rescore <results folder> scores a finished batch again from what it kept, without running anything.
const rescoreAt = argv.indexOf('--rescore');
const rescore = rescoreAt >= 0 ? resolve(argv.splice(rescoreAt, 2)[1]) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = rescore || join(evals, 'results', stamp);
mkdirSync(out, { recursive: true });

// A run cannot reach the npm registry, so a case with a lockfile gets its packages installed here, once, for scaffold.sh to copy in.
// They live outside evals/, because claude plugin eval refuses an eval directory that holds hard-linked files, as npm installs do.
for (const name of readdirSync(join(evals, 'cases'))) {
  const fixture = join(evals, 'cases', name, 'fixture');
  const deps = join(root, '.eval-deps', name);
  if (!existsSync(join(fixture, 'package-lock.json')) || existsSync(join(deps, 'node_modules'))) continue;
  mkdirSync(deps, { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) cpSync(join(fixture, file), join(deps, file));
  const npm = spawnSync('npm', ['ci', '--silent', '--no-audit', '--no-fund'], { cwd: deps, stdio: 'inherit', shell: process.platform === 'win32' });
  if (npm.status !== 0) { console.error(`npm ci failed for the ${name} case.`); process.exit(1); }
}

const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();
// claude plugin eval refuses any run granted a shell it cannot sandbox, which on Windows is every run, so only shell-free cases run there.
const grants = process.platform === 'win32' ? ['Edit', 'Write'] : ['Bash', 'Edit', 'Write'];
if (process.platform === 'win32') console.log('Windows has no sandbox for Bash, so cases that need it will be refused. Run those on Linux, macOS, or WSL.\n');
const args = ['plugin', 'eval', root, '--keep-temp', '--scaffold', '--allow-tools', ...grants,
  '--json', join(out, 'eval.json'), '--output-dir', out, ...(argv.includes('--publish-report') ? [] : ['--no-publish']), ...argv];
if (!rescore) console.log(`claude ${args.join(' ')}\n`);
const run = rescore ? { status: 0 } : spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (!existsSync(join(out, 'eval.json'))) { console.error(`No eval.json in ${out}; claude exited ${run.status}.`); process.exit(run.status || 1); }

const result = JSON.parse(readFileSync(join(out, 'eval.json'), 'utf8'));
const principles = principleNames(root);
const prices = loadPrices(root, homedir());
const scored = [];

// A kept run holds the agent's files under home/cwd, sealed read-only under sealed/ on newer CLIs, and its transcript under config/.
function openKept(temp) {
  for (const dir of [temp, join(temp, 'sealed')]) { try { chmodSync(dir, 0o700); } catch { /* not sealed */ } }
  const cwd = [join(temp, 'sealed', 'home', 'cwd'), join(temp, 'home', 'cwd')].find((d) => existsSync(d));
  const projects = join(temp, 'config', 'projects');
  const folders = existsSync(projects) ? readdirSync(projects).map((d) => join(projects, d)) : [];
  const transcript = folders.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.jsonl')).map((f) => join(d, f)))[0];
  return { cwd, transcript };
}
const KEPT = /[\\/](claude-eval-[^\\/]+|e-[A-Za-z0-9]{6})$/;

// Copies a run's final files, trace and transcript into results/ before anything is scored, so every score can be
// recomputed with --rescore, and blind pairwise judging has something to read. True when the copy is there.
function keep(temp, tracePath, kept) {
  if (temp && tracePath && existsSync(tracePath)) {
    const { cwd, transcript } = openKept(temp);
    cpSync(cwd, join(kept, 'files'), { recursive: true, filter: (src) => !/[\\/](\.git|\.origin\.git|node_modules)$/.test(src) });
    cpSync(tracePath, join(kept, 'trace.jsonl'));
    if (transcript) {
      cpSync(transcript, join(kept, 'transcript.jsonl'));
      const subagents = join(transcript.replace(/\.jsonl$/, ''), 'subagents');
      if (existsSync(subagents)) cpSync(subagents, join(kept, 'transcript', 'subagents'), { recursive: true });
    }
  }
  return existsSync(join(kept, 'files'));
}

for (const c of result.cases) {
  const caseDir = resolve(root, c.dir);
  const expect = existsSync(join(caseDir, 'expect.json')) ? JSON.parse(readFileSync(join(caseDir, 'expect.json'), 'utf8')) : {};
  // Held-out cases carry the heldout tag. No tuning decision may read their scores.
  const split = /^tags:.*\bheldout\b/m.test(readFileSync(join(caseDir, 'case.yaml'), 'utf8')) ? 'heldout' : 'tune';
  for (const [arm, runs] of Object.entries(c.arms || {})) {
    runs.forEach((r, i) => {
      const row = { case: c.name, split, arm, run: i + 1, native: r.score, error: r.error, cost: r.costUsd, seconds: r.durationSeconds, checks: [] };
      const kept = join(out, 'runs', `${c.name}-${arm}-${i + 1}`);
      const temp = r.tracePath ? dirname(dirname(r.tracePath)) : null;
      // A run that never started still passes every "must not" grader, so it can't count toward any score.
      if (r.error || !r.turns) row.invalid = String(r.error || 'the agent took no turns').split(' · ')[0];
      else if (keep(temp, r.tracePath, kept)) {
        const cwd = join(kept, 'files');
        const transcript = [join(kept, 'transcript.jsonl')].find((f) => existsSync(f));
        const trace = parseTrace(readFileSync([join(kept, 'trace.jsonl'), transcript].find((f) => f && existsSync(f)), 'utf8'));
        row.checks.push(...checkRules(trace, { principles, plugin: arm === 'with' }));
        const diff = diffDirs(join(caseDir, 'fixture'), cwd);
        row.diff = { files: diff.changed.length, added: diff.added, removed: diff.removed };
        if (expect.touch) row.checks.push(checkScope(diff.changed, expect.touch));
        if (existsSync(join(caseDir, 'hidden'))) {
          const modules = join(root, '.eval-deps', c.name, 'node_modules');
          for (const collateral of [false, true]) row.checks.push(runHidden(join(caseDir, 'hidden'), cwd, { collateral, modules, args: expect.hiddenArgs }));
        }
        row.tools = trace.tools.length;
        row.reply = trace.reply;
        if (transcript) {
          const a = attributeSession(transcript, { prices });
          row.tokens = a.usage;
          row.cacheHit = a.cacheHitRate;
          row.subagents = a.subagents;
          row.buckets = Object.fromEntries(a.rows.slice(0, 12).map((b) => [b.bucket, Number(b.cost.toFixed(5))]));
        }
      } else {
        row.checks.push({ name: 'trace-found', pass: false, detail: 'no trace kept for this run' });
      }
      if (temp && KEPT.test(temp) && existsSync(temp)) {
        // The kept folder is read-only in places. A folder that will not go is left behind, never a reason to lose the scores.
        spawnSync('chmod', ['-R', 'u+rwx', temp]);
        try { rmSync(temp, { recursive: true, force: true }); } catch { console.error(`Could not remove ${temp}.`); }
      }
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

const spread = (xs) => (xs.length ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) } : null);
const passRate = (rows, name) => mean(rows.flatMap((r) => r.checks.filter((x) => x.name === name && x.pass !== null).map((x) => (x.pass ? 1 : 0))));
const metered = (rows) => rows.filter((r) => r.tokens);
const summary = Object.fromEntries(Object.entries(byCase).map(([name, arms]) => [name, Object.fromEntries(Object.entries(arms).map(([arm, rows]) => [arm, {
  runs: rows.length,
  split: rows[0].split,
  native: mean(rows.map((r) => r.native ?? 0)),
  checks: ruleRate(rows),
  hidden: passRate(rows, 'hidden-tests-pass'),
  collateral: passRate(rows, 'collateral-tests-pass'),
  lines: mean(rows.filter((r) => r.diff).map((r) => r.diff.added + r.diff.removed)),
  cost: mean(rows.map((r) => r.cost ?? 0)),
  costSpread: spread(rows.map((r) => r.cost ?? 0)),
  seconds: spread(rows.map((r) => r.seconds ?? 0)),
  tokens: metered(rows).length ? Object.fromEntries(['input', 'cacheWrite', 'cacheRead', 'output'].map((k) => [k, median(metered(rows).map((r) => r.tokens[k]))])) : null,
  cacheHit: metered(rows).length ? median(metered(rows).map((r) => r.cacheHit)) : null,
  subagents: mean(rows.map((r) => r.subagents ?? 0)),
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
console.log(`\n${'CASE'.padEnd(22)} ARM      NATIVE  RULES HIDDEN NEARBY LINES    COST SECS CACHE  (COST and SECS are medians)`);
for (const [name, arms] of Object.entries(summary)) {
  for (const [arm, s] of Object.entries(arms)) {
    const was = prior?.cases?.[name]?.[arm];
    console.log(`${name.padEnd(22)} ${arm.padEnd(8)} ${pct(s.native)}${trend(s.native, was?.native).padEnd(2)} ${pct(s.checks)}${trend(s.checks, was?.checks).padEnd(2)}${pct(s.hidden)}  ${pct(s.collateral)} ${num(s.lines)}  $${(s.costSpread?.median ?? 0).toFixed(3)} ${num(s.seconds?.median)} ${pct(s.cacheHit)}`);
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
