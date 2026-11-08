import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chatSessionToRun, cliEventsToRun, normalizeTool, replayChatLog } from './sessions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });

test('a Chat panel log replays snapshots, sets, and splices into the final session', () => {
  const lines = [
    { kind: 0, v: { sessionId: 's1', requests: [] } },
    { kind: 2, k: ['requests'], v: [{ message: { text: 'fix the bug' }, timestamp: 1000, modelId: 'copilot/claude-sonnet-4.5' }] },
    { kind: 1, k: ['requests', 0, 'result'], v: { details: 'Claude Sonnet 4.5 • 1x', metadata: { promptTokens: 10, outputTokens: 5, toolCallRounds: [
      { response: 'Reading first.', toolCalls: [{ name: 'read_file', arguments: '{"filePath":"c:\\\\r\\\\skills\\\\principle-prove-it-works\\\\SKILL.md"}' }] },
      { response: '', toolCalls: [{ name: 'run_in_terminal', arguments: '{"command":"npm test"}' }, { name: 'replace_string_in_file', arguments: '{"filePath":"a.js"}' }] },
      { response: 'Done per Prove It Works.', toolCalls: [] },
    ] } } },
    { kind: 2, k: ['requests'], v: [{ message: { text: 'also push it' }, timestamp: 2000 }] },
  ];
  const run = chatSessionToRun(replayChatLog(lines.map((l) => JSON.stringify(l)).join('\n')), { folder: 'c:\\r' });
  assert.equal(run.prompt, 'fix the bug');
  assert.equal(run.followUps, 1);
  assert.deepEqual(run.messages, ['fix the bug', 'also push it']);
  assert.equal(run.model, 'claude-sonnet-4.5');
  assert.equal(run.premium, 1);
  assert.deepEqual(run.tools.map((t) => t.name), ['Read', 'Bash', 'Edit']);
  assert.equal(run.tools[1].input.command, 'npm test');
  assert.equal(run.reply, 'Done per Prove It Works.');
  assert.equal(run.edits, 1);
  assert.ok(run.skills.has('principle-prove-it-works'));
});

test('a CLI log keeps the base commit, the skills invoked, and subagent calls apart from the main agent', () => {
  const run = cliEventsToRun([
    { type: 'session.start', data: { context: { cwd: 'C:\\w', headCommit: 'abc', repository: 'me/w' } } },
    { type: 'user.message', data: { content: '/tblock:tblock-mode tidy up' } },
    { type: 'skill.invoked', data: { name: 'tblock-mode' } },
    { type: 'assistant.message', data: { content: '', toolRequests: [{ name: 'task', arguments: {} }] } },
    { type: 'assistant.message', agentId: 'sub1', data: { content: 'sub report', toolRequests: [{ name: 'edit', arguments: { path: 'x' } }] } },
    { type: 'assistant.message', data: { content: 'All done.', toolRequests: [] } },
    { type: 'session.shutdown', data: { accountingSnapshot: { totalPremiumRequestCost: 3 } } },
  ], 'id1');
  assert.equal(run.headCommit, 'abc');
  assert.ok(run.tblock);
  assert.equal(run.reply, 'All done.');
  assert.equal(run.edits, 0, 'subagent edits are not the main agent\'s');
  assert.deepEqual(run.tools.map((t) => [t.name, t.main]), [['Agent', true], ['Edit', false]]);
  assert.equal(run.premium, 3);
});

test('tool names map across both Copilot surfaces', () => {
  assert.equal(normalizeTool('powershell', { command: 'ls' }).name, 'Bash');
  assert.equal(normalizeTool('view', { path: 'a' }).input.file_path, 'a');
  assert.equal(normalizeTool('create_file', {}).name, 'Write');
  assert.equal(normalizeTool('apply_patch', {}).name, 'Edit');
  assert.equal(normalizeTool('rg', {}).name, 'rg');
});

test('replay clones without remotes, runs both arms, and scores them', () => {
  const base = mkdtempSync(join(tmpdir(), 'tblock-replay-test-'));
  try {
    const repo = join(base, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'app.py'), 'print(1)\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'start');
    git(repo, 'remote', 'add', 'origin', 'https://example.com/never.git');
    const evals = join(base, 'evals');
    mkdirSync(join(evals, 'cases', 'tidy'), { recursive: true });
    writeFileSync(join(evals, 'cases', 'tidy', 'case.json'), JSON.stringify({
      name: 'tidy', prompt: 'organise the files', repo, base: git(repo, 'rev-parse', 'HEAD').stdout.trim(),
      check: 'node -e "process.exit(require(\'fs\').existsSync(\'src\') ? 0 : 1)"', touch: ['src/**'],
    }));
    const env = { ...process.env, TBLOCK_EVALS: evals, COPILOT_HOME: join(base, 'copilot'), TBLOCK_COPILOT: join(here, 'fake-copilot.mjs') };
    const r = spawnSync(process.execPath, [join(here, 'copilot.mjs'), 'replay', '--runs', '1'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const [stamp] = readdirSync(join(evals, 'results'));
    const { runs, entry } = JSON.parse(readFileSync(join(evals, 'results', stamp, 'scorecard.json'), 'utf8'));
    const by = Object.fromEntries(runs.map((x) => [x.arm, x]));
    for (const arm of ['with', 'without']) {
      assert.equal(by[arm].invalid, undefined, `${arm}: ${by[arm].invalid}`);
      assert.match(by[arm].reply, /Remotes: none\./, `${arm} clone had a remote`);
      assert.equal(by[arm].checks.find((c) => c.name === 'check-passes').pass, true);
      assert.equal(by[arm].checks.find((c) => c.name === 'stayed-in-scope').pass, true);
      assert.deepEqual(by[arm].diff, { files: 1, added: 1, removed: 0 });
    }
    assert.equal(by.with.checks.find((c) => c.name === 'tblock-mode-loaded').pass, true);
    assert.equal(by.without.checks.some((c) => c.name === 'tblock-mode-loaded'), false);
    assert.deepEqual([by.with.premium, by.without.premium], [2, 1]);
    assert.equal(entry.cases.tidy.with.check, 1);
    assert.equal(readFileSync(join(evals, 'history.jsonl'), 'utf8').trim().split('\n').length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
