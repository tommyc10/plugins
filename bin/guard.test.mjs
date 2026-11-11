// The guard hooks: silent until switched on, then an ask before anything outward and a roles line at session start.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandOf, preTool, sessionStart } from './hook.mjs';
import { outwardAction } from './outward.mjs';
import { parseRoles } from './roles.mjs';

const BIN = dirname(fileURLToPath(import.meta.url));
const on = parseRoles('# guard: on\n# preset: high\n\n## claude-code\ncode: sonnet @ medium\nreviewers: sonnet @ high, opus @ high\n');
const off = parseRoles('## claude-code\ncode: sonnet @ medium\n');
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('the guard names every command that leaves the machine, and nothing local', () => {
  for (const cmd of ['git push -u origin fix', 'cd repo && git push --force', 'gh pr create --fill', 'gh pr merge 12', 'glab mr create --yes', 'glab mr note 4 -m hi', 'gh issue create --title x', 'npm publish', 'gh release create v1']) {
    assert.ok(outwardAction(cmd), cmd);
  }
  for (const cmd of ['git commit -m "tidy the fix"', 'git status', 'gh pr view 12 --json state', 'glab mr list', 'gh issue list', 'npm test', 'git pushd']) {
    assert.equal(outwardAction(cmd), null, cmd);
  }
});

test('with the guard on, a push becomes an ask; with it off or for a local command, the hook says nothing', () => {
  const asked = preTool(bash('git add -A && git push origin main'), on);
  assert.equal(asked.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(asked.hookSpecificOutput.permissionDecisionReason, /"git push" leaves this machine/);
  assert.equal(preTool(bash('git push'), off), null);
  assert.equal(preTool(bash('npm test'), on), null);
  assert.equal(preTool(bash('git push'), null), null, 'no roles file means no guard');
  assert.equal(commandOf({ toolInput: { command: 'git push' } }), 'git push', 'a harness that spells its fields differently still matches');
});

test('session start tells the session its roles for this harness and what the repo has set up', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tblock-guard-'));
  mkdirSync(join(repo, '.tblock'));
  writeFileSync(join(repo, '.tblock', 'probe.json'), '{}');
  const text = sessionStart({ cwd: repo }, on, 'claude-code').hookSpecificOutput.additionalContext;
  assert.match(text, /tblock roles for this harness \(preset high\)\. code: sonnet @ medium\. reviewers: sonnet @ high, opus @ high\./);
  assert.match(text, /sets up logs, and not ticket labels or Grafana/);
  assert.match(sessionStart({ cwd: repo }, on, 'copilot').hookSpecificOutput.additionalContext, /no roles for this harness/);
  assert.equal(sessionStart({ cwd: repo }, off, 'claude-code'), null);
});

test('the hook script and the guard switch work end to end', () => {
  const home = mkdtempSync(join(tmpdir(), 'tblock-guard-'));
  const env = { HOME: home, USERPROFILE: home, PATH: '' };
  const hook = (event) => spawnSync(process.execPath, [join(BIN, 'hook.mjs'), event, 'claude-code'], { env, input: JSON.stringify(bash('git push')), encoding: 'utf8' });
  const cli = (...args) => spawnSync(process.execPath, [join(BIN, 'tblock.mjs'), ...args], { env, encoding: 'utf8' });

  assert.equal(hook('pre-tool').stdout, '', 'silent before the guard is on');
  assert.equal(cli('guard', 'on').status, 0);
  assert.match(readFileSync(join(home, '.tblock', 'roles.md'), 'utf8'), /^# guard: on$/m);
  assert.equal(JSON.parse(hook('pre-tool').stdout).hookSpecificOutput.permissionDecision, 'ask');
  assert.match(JSON.parse(hook('session-start').stdout).hookSpecificOutput.additionalContext, /tblock guard is on/);
  cli('guard', 'off');
  assert.equal(hook('pre-tool').stdout, '');
  assert.equal(hook('pre-tool').status, 0);
});
