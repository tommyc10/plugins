#!/usr/bin/env node
// Evals on real GitHub Copilot work: score past sessions, turn them into cases, and replay each case with and
// without tblock through the Copilot CLI. Cases and results live in ~/.tblock/evals, never in this repo.
//   node evals/copilot.mjs score    [--since 14d] [--repo <text>] [--json]
//   node evals/copilot.mjs harvest  [--since 30d] [--repo <text>] [--session <id prefix>] [--all]
//   node evals/copilot.mjs validate [--case <glob>]
//   node evals/copilot.mjs replay   [--case <glob>] [--runs 3] [--model <id>] [--arms with,without] [--keep] [--dry-run]
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseSince } from '../bin/log.mjs';
import { createReader, listSessions, sessionsDir } from '../bin/watch.mjs';
import { checkRules, checkScope, globToRegExp, principleNames } from './rules.mjs';
import { baseCommitFor, cliEventsToRun, readAllSessions } from './sessions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env.TBLOCK_EVALS || join(homedir(), '.tblock', 'evals');
const copilotHome = process.env.COPILOT_HOME || join(homedir(), '.copilot');
const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i += 1) {
  const m = rest[i].match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!m) continue;
  flags[m[1]] = m[2] ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : true);
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '----------');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t.padEnd(n); };
const repoName = (run) => (run.repo || run.cwd || '?').split(/[\\/]/).filter(Boolean).pop();
const slug = (s) => String(s).toLowerCase().replace(/^\/\S+\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
const stripMode = (p) => String(p).replace(/^\/(?:tblock:)?tblock-mode\b\s*/, '');
const PUSH_ASKED = /\b(push|ship|publish|deploy|merge|open (?:a |an )?(?:pr|mr|pull request|merge request))\b/i;

function scoreSession(run, principles) {
  const checks = checkRules(run, { principles, plugin: run.tblock });
  const outward = checks.find((c) => c.name === 'no-outward-action');
  if (outward && outward.pass === false && run.messages.some((m) => PUSH_ASKED.test(m))) Object.assign(outward, { pass: null, detail: `${outward.detail} (the user asked for it)` });
  return checks;
}

function sessions() {
  const since = parseSince(String(flags.since || (command === 'score' ? '14d' : '30d')));
  return readAllSessions({ since, copilotHome }).filter((r) => !flags.repo || `${r.repo} ${r.cwd}`.toLowerCase().includes(String(flags.repo).toLowerCase()));
}

function score() {
  const principles = principleNames(root);
  const rows = sessions().map((run) => ({ run, checks: scoreSession(run, principles) }));
  if (flags.json) { console.log(JSON.stringify(rows.map(({ run, checks }) => ({ ...run, skills: [...run.skills], models: [...run.models], tools: run.tools.length, texts: undefined, checks })), null, 2)); return; }
  console.log(`${'DATE'.padEnd(10)} ${'WHERE'.padEnd(11)} ${'REPO'.padEnd(18)} TB  RULES  ASKS EDITS PREM  TASK`);
  for (const { run, checks } of rows) {
    const applied = checks.filter((c) => c.pass !== null);
    console.log(`${day(run.started)} ${run.harness.replace('vscode-', '').padEnd(11)} ${clip(repoName(run), 18)} ${run.tblock ? 'yes' : ' - '} ${`${applied.filter((c) => c.pass).length}/${applied.length}`.padStart(5)} ${String(run.followUps).padStart(5)} ${String(run.edits).padStart(5)} ${String(run.premium ?? '-').padStart(4)}  ${clip(run.title || run.prompt, 50)}`);
  }
  const group = (tb) => rows.filter((r) => r.run.tblock === tb);
  const mean = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
  for (const [label, g] of [['with tblock', group(true)], ['without', group(false)]]) {
    console.log(`\n${label}: ${g.length} sessions, ${mean(g.map((r) => r.run.followUps))} follow-ups and ${mean(g.map((r) => r.run.premium || 0))} premium requests each`);
  }
  const failed = rows.flatMap(({ run, checks }) => checks.filter((c) => c.pass === false).map((c) => `${day(run.started)} ${clip(repoName(run), 18)} ${c.name}: ${c.detail}`));
  if (failed.length) console.log(`\nFailed rules:\n  ${failed.join('\n  ')}`);
  console.log('\nThese are different tasks, so the two groups describe your work, not tblock\'s effect. Replay cases for that.');
}

function harvest() {
  const out = join(home, 'cases');
  mkdirSync(out, { recursive: true });
  const picked = sessions().filter((r) => (flags.session ? r.id.startsWith(String(flags.session)) : flags.all || r.edits > 0));
  for (const run of picked) {
    const { commit, estimated } = baseCommitFor(run);
    const name = `${day(run.started)}-${slug(run.title || run.prompt)}`;
    const dir = join(out, name);
    if (existsSync(dir)) { console.log(`skip  ${name} (exists)`); continue; }
    if (!commit) { console.log(`skip  ${name} (no base commit: ${run.cwd || 'unknown folder'} is gone or not a git repo)`); continue; }
    const files = [...new Set(run.tools.filter((t) => t.name === 'Edit' || t.name === 'Write').map((t) => t.input.file_path).filter(Boolean))];
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'case.json'), `${JSON.stringify({
      name,
      prompt: stripMode(run.prompt),
      repo: run.cwd,
      base: commit,
      baseEstimated: estimated,
      setup: null,
      check: null,
      touch: null,
      timeoutMinutes: 30,
      source: { harness: run.harness, session: run.id, started: run.started && new Date(run.started).toISOString(), model: run.model, tblock: run.tblock, premium: run.premium },
      laterMessages: run.messages.slice(1),
      filesTheSessionChanged: files,
    }, null, 2)}\n`);
    console.log(`wrote ${name}${estimated ? ' (base commit estimated from the session time)' : ''}${run.followUps ? `, ${run.followUps} later message(s) to review` : ''}`);
  }
  console.log(`\nCases in ${out}. In each case.json, set "check" to a command that fails before the fix and passes after it, and "setup" if the repo needs installing. Fold any later message that changed the task into "prompt". Then run validate.`);
}

function loadCases() {
  const dir = join(home, 'cases');
  if (!existsSync(dir)) return [];
  const match = flags.case ? globToRegExp(String(flags.case)) : null;
  return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'case.json')) && (!match || match.test(n))).map((n) => ({ dir: join(dir, n), ...JSON.parse(readFileSync(join(dir, n, 'case.json'), 'utf8')) }));
}

const sh = (cmd, cwd, minutes = 15) => spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: minutes * 60_000, maxBuffer: 64 * 1024 * 1024 });
const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// A clone with no remotes, so nothing the agent runs can push anywhere.
function workspace(c, label) {
  const dir = mkdtempSync(join(tmpdir(), `tblock-replay-${label}-`));
  const steps = [['clone', '--quiet', '--no-checkout', c.repo, dir], ['-C', dir, 'checkout', '--quiet', '--detach', c.base]];
  for (const s of steps) { const r = spawnSync('git', s, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${s.join(' ')}: ${r.stderr.trim()}`); }
  for (const remote of git(dir, 'remote').stdout.split('\n').filter(Boolean)) git(dir, 'remote', 'remove', remote);
  return dir;
}

function validate() {
  const cases = loadCases();
  if (!cases.length) { console.log(`No cases in ${join(home, 'cases')}. Run harvest first.`); return; }
  for (const c of cases) {
    if (!c.check) { console.log(`${c.name}: no "check" yet. Replay will score rules and cost only.`); continue; }
    const dir = workspace(c, 'validate');
    try {
      const setup = c.setup ? sh(c.setup, dir) : { status: 0 };
      if (setup.status !== 0) { console.log(`${c.name}: setup failed (exit ${setup.status}). ${clip(setup.stderr || setup.stdout, 160)}`); continue; }
      const r = sh(c.check, dir);
      console.log(`${c.name}: check ${r.status === 0 ? 'PASSES on the base commit, so it cannot show the fix. Tighten it.' : `fails on the base commit (exit ${r.status}), as it should.`}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// The Copilot CLI's launcher. On Windows an npm .cmd shim can't take a prompt with quotes safely, so run its script with node.
function copilotCommand() {
  const custom = process.env.TBLOCK_COPILOT;
  if (custom) return /\.m?js$/i.test(custom) ? { cmd: process.execPath, pre: [custom] } : { cmd: custom, pre: [] };
  if (process.platform !== 'win32') return { cmd: 'copilot', pre: [] };
  const found = spawnSync('where', ['copilot'], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  const exe = found.find((p) => /\.exe$/i.test(p));
  if (exe) return { cmd: exe, pre: [] };
  for (const shim of found.filter((p) => /\.cmd$/i.test(p))) {
    const script = readFileSync(shim, 'utf8').match(/"%(?:dp0|~dp0)%\\?([^"]+\.(?:m?js))"/i);
    if (script) return { cmd: process.execPath, pre: [join(dirname(shim), script[1])] };
  }
  throw new Error('Copilot CLI not found. Install it, or set TBLOCK_COPILOT to its executable or its .js entry script.');
}

const REQUIRED_FLAGS = ['--prompt', '--allow-all-tools', '--deny-tool'];
function preflight(copilot) {
  const help = spawnSync(copilot.cmd, [...copilot.pre, '--help'], { encoding: 'utf8' });
  const text = `${help.stdout}${help.stderr}`;
  const missing = REQUIRED_FLAGS.filter((f) => !text.includes(f));
  if (missing.length) throw new Error(`This Copilot CLI's --help does not list ${missing.join(', ')}. Replay needs them. Help output starts:\n${text.slice(0, 600)}`);
  return { model: text.includes('--model') };
}

const sameDir = (a, b) => String(a || '').replace(/[\\/]+$/, '').toLowerCase().replaceAll('\\', '/') === String(b || '').replace(/[\\/]+$/, '').toLowerCase().replaceAll('\\', '/');
function sessionFor(dir, since) {
  for (const s of listSessions(sessionsDir(copilotHome)).filter((x) => x.mtime >= since)) {
    const events = createReader(s.log)();
    const start = events.find((e) => e.type === 'session.start');
    if (start && sameDir(start.data?.context?.cwd, dir)) return cliEventsToRun(events, s.id);
  }
  return null;
}

function diffOf(dir, base) {
  git(dir, 'add', '-A');
  const rows = git(dir, 'diff', '--cached', '--numstat', base).stdout.split('\n').filter(Boolean).map((l) => l.split('\t'));
  return { changed: rows.map((r) => r[2]), added: rows.reduce((a, r) => a + (Number(r[0]) || 0), 0), removed: rows.reduce((a, r) => a + (Number(r[1]) || 0), 0) };
}

function replay() {
  const cases = loadCases();
  if (!cases.length) { console.log(`No cases in ${join(home, 'cases')}. Run harvest first.`); return; }
  const arms = String(flags.arms || 'with,without').split(',');
  const runs = Number(flags.runs || 3);
  const copilot = flags['dry-run'] ? { cmd: 'copilot', pre: [] } : copilotCommand();
  const can = flags['dry-run'] ? { model: true } : preflight(copilot);
  const principles = principleNames(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(home, 'results', stamp);
  mkdirSync(out, { recursive: true });
  const rows = [];

  for (const c of cases) {
    for (let n = 1; n <= runs; n += 1) {
      for (const arm of arms) {
        const prompt = arm === 'with' ? `/tblock:tblock-mode ${stripMode(c.prompt)}` : stripMode(c.prompt);
        const args = [...copilot.pre, '--prompt', prompt, '--allow-all-tools', '--deny-tool', 'shell(git push)', '--deny-tool', 'shell(gh)', '--deny-tool', 'shell(glab)',
          ...(flags.model && can.model ? ['--model', String(flags.model)] : [])];
        if (flags['dry-run']) { console.log(`${c.name} #${n} ${arm}: clone ${c.repo} at ${c.base.slice(0, 9)}, ${c.setup ? `run "${c.setup}", ` : ''}copilot ${args.slice(copilot.pre.length).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}${c.check ? `, then check "${c.check}"` : ''}`); continue; }
        const row = { case: c.name, arm, run: n, checks: [] };
        let dir;
        try {
          dir = workspace(c, arm);
          if (c.setup && sh(c.setup, dir).status !== 0) throw new Error(`setup "${c.setup}" failed`);
          const started = Date.now();
          const agent = spawnSync(copilot.cmd, args, { cwd: dir, encoding: 'utf8', timeout: (c.timeoutMinutes || 30) * 60_000, maxBuffer: 64 * 1024 * 1024 });
          writeFileSync(join(out, `${c.name}.${arm}.${n}.log`), `${agent.stdout || ''}\n${agent.stderr || ''}`);
          row.minutes = Number(((Date.now() - started) / 60_000).toFixed(1));
          row.timedOut = agent.error?.code === 'ETIMEDOUT';
          const session = sessionFor(dir, started - 5000);
          if (session) {
            Object.assign(row, { premium: session.premium, aiCredits: session.aiCredits, tokens: session.tokens.input + session.tokens.output, model: session.model, models: [...session.models], reply: session.reply });
            row.subagents = session.tools.filter((t) => t.name === 'Agent').length;
            row.checks.push(...scoreSession(session, principles).filter((x) => arm === 'with' || x.name === 'no-outward-action'));
            if (arm === 'with' && !session.skills.has('tblock-mode')) row.invalid = 'tblock-mode never loaded, so this run did not test tblock';
            if (arm === 'without' && [...session.skills].some((s) => s !== 'tblock-mode' && existsSync(join(root, 'skills', s)))) row.note = `used tblock skill(s) ${[...session.skills].join(', ')} without tblock-mode`;
          } else row.note = 'no session log found for this run, so rules are unscored';
          const diff = diffOf(dir, c.base);
          row.diff = { files: diff.changed.length, added: diff.added, removed: diff.removed };
          if (c.touch) row.checks.push(checkScope(diff.changed, c.touch));
          if (c.check) { const r = sh(c.check, dir); row.checks.push({ name: 'check-passes', pass: r.status === 0, detail: `exit ${r.status}` }); }
          if (agent.status !== 0 && !row.timedOut && !session) row.invalid = `copilot exited ${agent.status}: ${clip(agent.stderr, 200)}`;
        } catch (e) {
          row.invalid = e.message;
        } finally {
          if (dir && !flags.keep) rmSync(dir, { recursive: true, force: true });
          else if (dir) row.workspace = dir;
        }
        rows.push(row);
        const passed = row.checks.filter((x) => x.pass === true).length;
        console.log(`${c.name} #${n} ${arm.padEnd(7)} ${row.invalid ? `INVALID ${row.invalid}` : `check ${row.checks.find((x) => x.name === 'check-passes')?.pass ?? '-'}  rules ${passed}/${row.checks.filter((x) => x.pass !== null).length}  ${row.diff?.added ?? 0}+/${row.diff?.removed ?? 0}-  ${row.tokens ?? '?'} tokens  ${row.aiCredits?.toFixed(2) ?? '?'} credits  ${row.minutes}m  ${row.model ?? '?'}${row.note ? `  (${row.note})` : ''}`}`);
      }
    }
  }
  if (flags['dry-run']) return;

  const valid = rows.filter((r) => !r.invalid);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // Cost swings a lot between runs of one task, so the middle run says more than the average.
  const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const summary = {};
  for (const r of valid) ((summary[r.case] ||= {})[r.arm] ||= []).push(r);
  const cases2 = Object.fromEntries(Object.entries(summary).map(([name, byArm]) => [name, Object.fromEntries(Object.entries(byArm).map(([arm, rs]) => [arm, {
    runs: rs.length,
    check: mean(rs.flatMap((r) => r.checks.filter((x) => x.name === 'check-passes').map((x) => (x.pass ? 1 : 0)))),
    rules: mean(rs.flatMap((r) => r.checks.filter((x) => x.pass !== null && x.name !== 'check-passes').map((x) => (x.pass ? 1 : 0)))),
    lines: median(rs.map((r) => (r.diff ? r.diff.added + r.diff.removed : 0))),
    tokens: median(rs.map((r) => r.tokens)),
    aiCredits: median(rs.map((r) => r.aiCredits)),
    premium: median(rs.map((r) => r.premium)),
    minutes: median(rs.map((r) => r.minutes)),
    subagents: median(rs.map((r) => r.subagents)),
    models: [...new Set(rs.map((r) => r.model).filter(Boolean))],
  }]))]));
  const version = existsSync(join(root, 'plugin.json')) ? JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).version : null;
  const entry = { at: new Date().toISOString(), label: flags.label || null, harness: 'copilot-cli', model: flags.model || 'auto', tblock: version, tblockCommit: git(root, 'rev-parse', '--short', 'HEAD').stdout.trim() || null, invalid: rows.length - valid.length, cases: cases2 };
  writeFileSync(join(out, 'scorecard.json'), JSON.stringify({ entry, runs: rows }, null, 2));
  if (valid.length) appendFileSync(join(home, 'history.jsonl'), `${JSON.stringify(entry)}\n`);

  const pct = (x) => (x === null ? '  - ' : `${Math.round(x * 100)}%`.padStart(4));
  const num = (x, digits = 0) => (x == null ? '-' : x.toFixed(digits));
  console.log(`\n${'CASE'.padEnd(34)} ARM      CHECK RULES LINES   TOKENS CREDITS MINUTES  MODEL`);
  for (const [name, byArm] of Object.entries(cases2)) for (const [arm, s] of Object.entries(byArm)) {
    console.log(`${clip(name, 34)} ${arm.padEnd(8)} ${pct(s.check)}  ${pct(s.rules)} ${num(s.lines).padStart(5)} ${num(s.tokens).padStart(8)} ${num(s.aiCredits, 2).padStart(7)} ${num(s.minutes, 1).padStart(7)}  ${s.models.join(', ') || '?'}`);
  }
  console.log('\nLINES, TOKENS, CREDITS and MINUTES are medians across runs. CHECK and RULES are pass rates.');
  const mixed = Object.entries(cases2).filter(([, byArm]) => new Set(Object.values(byArm).flatMap((s) => s.models)).size > 1);
  if (mixed.length) console.log(`\nWarning: the arms ran on different models in ${mixed.map(([n]) => n).join(', ')}, so cost and quality aren't comparable. Pass --model to pin one.`);
  else if (!flags.model) console.log('\nNo --model was given, so Copilot picked the model. Pass --model to make sure every run uses the same one.');
  const invalid = rows.filter((r) => r.invalid);
  if (invalid.length) console.log(`\n${invalid.length} invalid run(s), left out of every score:\n  ${[...new Set(invalid.map((r) => r.invalid))].join('\n  ')}`);
  console.log(`\nScorecard ${join(out, 'scorecard.json')}. ${valid.length ? `History ${join(home, 'history.jsonl')}.` : 'No valid runs, so history is unchanged.'}`);
}

const commands = { score, harvest, validate, replay };
if (!commands[command]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 7).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(command ? 1 : 0);
}
try { commands[command](); } catch (e) { console.error(e.message); process.exit(1); }
