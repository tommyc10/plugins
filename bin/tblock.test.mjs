// Runs the real CLI against a throwaway home folder and stub tools, so nothing touches the user's setup.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'tblock.mjs');
const PLUGIN = join(dirname(CLI), '..');

function sandbox(stubs = {}, extraEnv = {}) {
  const home = mkdtempSync(join(tmpdir(), 'tblock-test-'));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  for (const [name, script] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const cli = (...args) => {
    // Node finds the home folder through USERPROFILE on Windows, so set both, and point
    // VS Code's state at the sandbox, or a test run rewrites the real setup.
    const env = { HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), XDG_CONFIG_HOME: join(home, '.config'), PATH: `${bin}:/usr/bin:/bin`, ...extraEnv };
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const agents = () => readdirSync(join(home, '.copilot', 'agents')).sort();
  return { home, cli, agents };
}

const doctorJson = (cli) => JSON.parse(cli('doctor', '--json').out).checks;
const find = (checks, name) => checks.filter((c) => c.check === name);

test('roles set writes the roles file and one Copilot agent per entry', () => {
  const { home, cli, agents } = sandbox();
  const r = cli('roles', 'set', '--harness=copilot', '--tools=gitlab-mcp,glab', 'code=gpt-5', 'reviewers=claude-opus-5,gpt-5', 'judgment=session', 'swarm workers=gpt-5-mini');
  assert.equal(r.code, 0, r.err);

  const roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /^# harness: copilot$/m);
  assert.match(roles, /^# git host tools: gitlab-mcp, glab$/m);
  assert.match(roles, /^code: gpt-5$/m);
  assert.match(roles, /^reviewers: claude-opus-5, gpt-5$/m);

  assert.match(roles, /^swarm workers: gpt-5-mini$/m);
  assert.deepEqual(agents(), ['tblock-code.agent.md', 'tblock-judgment.agent.md', 'tblock-reviewers-1.agent.md', 'tblock-reviewers-2.agent.md', 'tblock-swarm-workers.agent.md']);
  const reviewer = readFileSync(join(home, '.copilot', 'agents', 'tblock-reviewers-2.agent.md'), 'utf8');
  assert.match(reviewer, /^name: tblock-reviewers-2$/m);
  assert.match(reviewer, /^model: gpt-5$/m);
  const delegate = readFileSync(join(PLUGIN, 'com.github.copilot', 'agents', 'delegate.agent.md'), 'utf8');
  assert.ok(reviewer.endsWith(delegate.replace(/^---\n[\s\S]*?\n---\n/, '')), 'a role without its own agent carries the delegate instructions');

  const judgment = readFileSync(join(home, '.copilot', 'agents', 'tblock-judgment.agent.md'), 'utf8');
  assert.doesNotMatch(judgment, /^model:/m, 'a session role leaves the model to Copilot');
});

test('shrinking a panel removes the agent it no longer needs', () => {
  const { cli, agents } = sandbox();
  cli('roles', 'set', '--harness=copilot', 'reviewers=claude-opus-5,gpt-5');
  cli('roles', 'set', 'reviewers=claude-opus-5');
  assert.deepEqual(agents(), ['tblock-reviewers-1.agent.md']);
});

test('doctor passes a synced setup and fails a hand-edited agent', () => {
  const { home, cli } = sandbox();
  cli('roles', 'set', '--harness=copilot', 'code=gpt-5', 'reviewers=claude-opus-5,gpt-5');
  assert.equal(find(doctorJson(cli), 'Copilot agents')[0].level, 'PASS');

  writeFileSync(join(home, '.copilot', 'agents', 'tblock-code.agent.md'), '---\nname: tblock-code\nmodel: gpt-4\n---\n');
  const failed = find(doctorJson(cli), 'Copilot agents')[0];
  assert.equal(failed.level, 'FAIL');
  assert.match(failed.detail, /tblock-code\.agent\.md/);
  assert.equal(cli('doctor').code, 1);

  assert.equal(cli('roles', 'sync').code, 0);
  assert.equal(find(doctorJson(cli), 'Copilot agents')[0].level, 'PASS');
});

test('doctor warns when a panel has one model family', () => {
  const { cli } = sandbox();
  cli('roles', 'set', 'reviewers=claude-opus-5,claude-sonnet-5');
  const warning = find(doctorJson(cli), 'Roles').find((c) => /reviewers/.test(c.detail));
  assert.equal(warning?.level, 'WARN');
});

test('doctor reports an out-of-date install in each harness', () => {
  const { cli } = sandbox({
    claude: `echo '[{"id":"tblock@tblock","version":"0.0.9","installPath":"/x"}]'`,
    copilot: 'echo "Installed plugins:"; echo "  • tblock (v0.0.9)"',
    glab: 'exit 1',
  });
  const checks = doctorJson(cli);
  assert.equal(find(checks, 'Claude Code')[0].level, 'WARN');
  assert.match(find(checks, 'Copilot')[0].detail, /0\.0\.9 installed/);
  assert.equal(find(checks, 'GitLab CLI')[0].level, 'WARN');
  assert.equal(find(checks, 'GitHub CLI')[0].level, 'SKIP');
});

test('a bad role is rejected without writing anything', () => {
  const { home, cli } = sandbox();
  const r = cli('roles', 'set', 'coder=gpt-5');
  assert.equal(r.code, 2);
  assert.match(r.err, /"coder=gpt-5" is not role=model/);
  assert.equal(existsSync(join(home, '.tblock', 'roles.md')), false);
});

test('piped output is plain text', () => {
  const { cli } = sandbox();
  const r = cli();
  assert.doesNotMatch(r.out + cli('doctor').out, /\x1b\[/);
  assert.match(r.out, /tblock doctor/);
});

const settingsOf = (home) => JSON.parse(readFileSync(join(home, '.copilot', 'settings.json'), 'utf8'));

test('an effort level reaches Copilot settings without touching anything else there', () => {
  const { home, cli } = sandbox();
  mkdirSync(join(home, '.copilot'), { recursive: true });
  writeFileSync(join(home, '.copilot', 'settings.json'), JSON.stringify({ enabledPlugins: { other: true }, subagents: { agents: { explore: { effortLevel: 'low' } } } }));

  const r = cli('roles', 'set', '--harness=copilot', 'code=gpt-5 @ high', 'reviewers=claude-opus-5@high,gpt-5@xhigh');
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(join(home, '.tblock', 'roles.md'), 'utf8'), /^code: gpt-5 @ high$/m);

  const settings = settingsOf(home);
  assert.deepEqual(settings.enabledPlugins, { other: true });
  assert.equal(settings.subagents.agents.explore.effortLevel, 'low');
  assert.equal(settings.subagents.agents['tblock-code'].effortLevel, 'high');
  assert.equal(settings.subagents.agents['tblock-reviewers-2'].effortLevel, 'xhigh');
});

test('an unknown effort is rejected', () => {
  const { home, cli } = sandbox();
  const r = cli('roles', 'set', 'code=gpt-5@turbo');
  assert.equal(r.code, 2);
  assert.match(r.err, /effort "turbo" is not one of/);
  assert.equal(existsSync(join(home, '.tblock', 'roles.md')), false);
});

test('a preset maps tiers to models and reports what it had to fall back on', () => {
  const { home, cli } = sandbox();
  cli('tiers', 'set', 'claude-top=opus', 'claude-strong=sonnet', 'gpt-strong=sol', 'gpt-fast=luna');

  assert.equal(cli('preset', 'high').code, 0);
  let roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /^# preset: high$/m);
  assert.match(roles, /^hardest: opus @ high$/m);
  assert.match(roles, /^code: sol @ medium$/m);
  assert.match(roles, /^swarm workers: luna @ low$/m);
  assert.match(roles, /^reviewers: sonnet @ high, sol @ high$/m);
  const roleLines = roles.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(':')[0]);
  assert.deepEqual(roleLines, ['code', 'hardest', 'judgment', 'reviewers', 'swarm workers', 'shootout runners', 'shootout judges']);

  const extreme = cli('preset', 'extreme');
  assert.equal(extreme.code, 0, extreme.err);
  assert.match(extreme.out, /reviewers: 2 of 3 families have models/);
  assert.match(extreme.out, /code: no gpt-top, used gpt-strong/);
  roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /^code: sol @ high$/m);

  cli('roles', 'set', 'code=gpt-6');
  assert.match(readFileSync(join(home, '.tblock', 'roles.md'), 'utf8'), /^# preset: extreme \(edited\)$/m);
});

test('a preset without tiers says how to set them', () => {
  const { cli } = sandbox();
  const r = cli('preset', 'high');
  assert.equal(r.code, 2);
  assert.match(r.err, /tblock tiers set/);
});

test('doctor fails when a Copilot effort drifts, and sync repairs it', () => {
  const { home, cli } = sandbox();
  cli('roles', 'set', '--harness=copilot', 'code=gpt-5@high');
  assert.equal(find(doctorJson(cli), 'Copilot efforts')[0].level, 'PASS');

  const settings = settingsOf(home);
  settings.subagents.agents['tblock-code'].effortLevel = 'low';
  writeFileSync(join(home, '.copilot', 'settings.json'), JSON.stringify(settings));
  const drift = find(doctorJson(cli), 'Copilot efforts')[0];
  assert.equal(drift.level, 'FAIL');
  assert.match(drift.detail, /tblock-code is low, should be high/);

  cli('roles', 'sync');
  assert.equal(find(doctorJson(cli), 'Copilot efforts')[0].level, 'PASS');
});

test('a settings file that is not plain JSON is left alone', () => {
  const { home, cli } = sandbox();
  mkdirSync(join(home, '.copilot'), { recursive: true });
  const original = '// comments\n{ "enabledPlugins": {} }\n';
  writeFileSync(join(home, '.copilot', 'settings.json'), original);
  const r = cli('roles', 'set', '--harness=copilot', 'code=gpt-5@high');
  assert.equal(r.code, 2);
  assert.match(r.err, /not plain JSON/);
  assert.equal(readFileSync(join(home, '.copilot', 'settings.json'), 'utf8'), original);
});

test('the session model does not count as a model family', () => {
  const { cli } = sandbox();
  cli('roles', 'set', 'code=session', 'hardest=opus', 'reviewers=sonnet');
  assert.match(find(doctorJson(cli), 'Roles')[0].detail, /models from 1 family\b/);
});

// A VS Code state database holding a picker list, like the one Copilot Chat caches.
async function vscodeState(dir, sku, plans) {
  const { DatabaseSync } = await import('node:sqlite');
  const file = join(dir, 'state.vscdb');
  const db = new DatabaseSync(file);
  db.exec('create table ItemTable (key text unique on conflict replace, value blob)');
  const put = db.prepare('insert into ItemTable values (?, ?)');
  put.run('extensionsAssignmentFilterProvider.copilotSku', sku);
  put.run('chat.modelsControl', JSON.stringify(plans));
  put.run('chat.cachedLanguageModels.v2', JSON.stringify([{ identifier: 'copilot/auto', metadata: { id: 'auto', name: 'Auto', vendor: 'copilot', isUserSelectable: true } }]));
  db.close();
  return file;
}

const picker = (...models) => Object.fromEntries(models.map(([id, label]) => [id, { id, label }]));

test('models reads the picker list for the account plan and suggests tiers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-state-'));
  const state = await vscodeState(dir, 'copilot_enterprise_seat', {
    free: picker(['gpt-5-mini', 'GPT-5 mini']),
    paid: picker(['claude-opus-5.5', 'Claude Opus 5.5'], ['claude-sonnet-5.5', 'Claude Sonnet 5.5'], ['claude-haiku-4.5', 'Claude Haiku 4.5'],
      ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-5.6-terra', 'GPT-5.6 Terra'], ['gpt-6-luna', 'GPT-6 Luna'], ['gpt-5.4-mini', 'GPT-5.4 mini'], ['kimi-k2.7-code', 'Kimi K2.7 Code']),
  });
  const { cli } = sandbox({}, { TBLOCK_VSCODE_STATE: state });
  const r = cli('models', '--json');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, '', 'no experimental warning reaches the user');
  const found = JSON.parse(r.out);
  assert.ok(!found.models.some((m) => m.id === 'gpt-5-mini'), 'free-plan models are left out for a paid seat');
  assert.ok(!found.models.some((m) => m.id === 'auto'), 'Auto is not a model a role can pin');
  assert.deepEqual(found.tiers, {
    'claude-top': 'claude-opus-5.5', 'claude-strong': 'claude-sonnet-5.5', 'claude-fast': 'claude-haiku-4.5',
    'gpt-top': 'gpt-6.1-sol', 'gpt-strong': 'gpt-5.6-terra', 'gpt-fast': 'gpt-6-luna',
  });
});

test('tiers detect writes tiers, and Copilot agents name both the id and the picker name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-state-'));
  const state = await vscodeState(dir, 'free_limited_copilot', {
    free: picker(['claude-sonnet-5.5', 'Claude Sonnet 5.5'], ['claude-sonnet-5', 'Claude Sonnet 5'], ['gpt-6.1-sol', 'GPT-6.1 Sol']),
  });
  const { home, cli } = sandbox({}, { TBLOCK_VSCODE_STATE: state });
  assert.equal(cli('tiers', 'detect').code, 0);
  const roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /^# tiers: claude-top=claude-sonnet-5\.5, claude-strong=claude-sonnet-5, gpt-top=gpt-6\.1-sol$/m, 'with no top model, the newest strong one leads');
  assert.match(roles, /^# model names: .*claude-sonnet-5\.5=Claude Sonnet 5\.5/m);

  const r = cli('roles', 'set', '--harness=copilot', 'hardest=claude-sonnet-5.5', 'code=GPT-6.1 Sol', 'judgment=session');
  assert.equal(r.code, 0, r.err);
  const hardest = readFileSync(join(home, '.copilot', 'agents', 'tblock-hardest.agent.md'), 'utf8');
  assert.match(hardest, /^model: \[claude-sonnet-5\.5, "Claude Sonnet 5\.5 \(copilot\)"\]$/m);
  assert.match(hardest, /^model-policy: required$/m, 'the session model must not override the role');
  const code = readFileSync(join(home, '.copilot', 'agents', 'tblock-code.agent.md'), 'utf8');
  assert.match(code, /^model: \[gpt-6\.1-sol, "GPT-6\.1 Sol \(copilot\)"\]$/m, 'a picker name resolves to its id');
  assert.doesNotMatch(readFileSync(join(home, '.copilot', 'agents', 'tblock-judgment.agent.md'), 'utf8'), /^model/m);
  assert.equal(find(doctorJson(cli), 'Copilot agents')[0].level, 'PASS');
});

test('models without VS Code state says how to go on', () => {
  const { cli } = sandbox();
  const r = cli('models');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /No Copilot models found/);
  assert.equal(cli('tiers', 'detect').code, 2);
});

test('models --from reads the list from Copilot\'s unknown-model error, for remote VS Code', () => {
  const { home, cli } = sandbox();
  const error = "Requested model 'tblock-list-models' not found. Available models: Auto (copilot), Claude Sonnet 5.5 (copilot), " +
    'GPT-6.1 Sol (copilot), GPT-5.4 mini (copilot), Gemini 3 Pro (Preview) (copilot), Raptor mini (copilot). ' +
    "Unavailable (exceeds current model's cost tier): Claude Opus 5.5 (copilot)";
  const r = cli('models', '--json', `--from=${error}`);
  assert.equal(r.code, 0, r.err);
  const found = JSON.parse(r.out);
  assert.deepEqual(found.models.map((m) => m.id), ['claude-sonnet-5.5', 'gpt-6.1-sol', 'gpt-5.4-mini', 'gemini-3-pro-preview', 'claude-opus-5.5']);
  assert.equal(found.models.find((m) => m.id === 'gemini-3-pro-preview').name, 'Gemini 3 Pro (Preview)');
  assert.equal(found.models.find((m) => m.id === 'claude-opus-5.5').overCostTier, true);
  assert.equal(found.tiers['gpt-fast'], 'gpt-5.4-mini');

  assert.equal(cli('tiers', 'detect', `--from=${error}`).code, 0);
  const roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /claude-top=claude-opus-5\.5/);
  assert.match(roles, /^# model names: .*gpt-6\.1-sol=GPT-6\.1 Sol/m);
});

test('a pasted list in any shape gives the same models', () => {
  const { cli } = sandbox();
  const found = JSON.parse(cli('models', '--json', '--from=Claude Sonnet 5\n  gpt-5.5   GPT-5.5\nclaude-sonnet-5 x2\nKimi K2.7 Code').out);
  assert.deepEqual(found.models.map((m) => [m.id, m.name]), [['claude-sonnet-5', 'Claude Sonnet 5'], ['gpt-5.5', 'GPT-5.5']]);
});

test('every view prints plain text when piped, and colour only when asked for', () => {
  const { cli } = sandbox();
  cli('tiers', 'set', 'claude-top=claude-opus-5.5', 'gpt-fast=gpt-6-luna');
  cli('preset', 'high');
  for (const view of [[], ['roles'], ['tiers'], ['preset'], ['doctor'], ['models']]) {
    assert.doesNotMatch(cli(...view).out, /\x1b\[/, `tblock ${view.join(' ')} is plain when piped`);
  }
  const { cli: colourCli } = sandbox({}, { FORCE_COLOR: '1' });
  assert.match(colourCli('roles').out, /\x1b\[/, 'FORCE_COLOR turns colour on');
  const { cli: plainCli } = sandbox({}, { FORCE_COLOR: '1', NO_COLOR: '1' });
  assert.doesNotMatch(plainCli('roles').out, /\x1b\[/, 'NO_COLOR wins');
});

test('watch shows each subagent, its model, and whether Copilot honoured the role', async () => {
  const { writeWatchSession } = await import('./fixtures/watch-session.mjs');
  const { home, cli: _ } = sandbox();
  writeWatchSession(join(home, '.copilot'));
  const { cli } = sandbox({}, { COPILOT_HOME: join(home, '.copilot') });
  const r = cli('watch', '--once');
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /\x1b\[/, 'a snapshot piped to an agent is plain text');
  assert.match(r.out, /tblock-code\s+gpt-5\.6-terra\s+medium\s+48s\s+3 tools · 41\.2k tok\s+✔ role model/);
  assert.match(r.out, /tblock-reviewers-1\s+claude-sonnet-5\.5\s+high\s+31s\s+2 tools · 18\.8k tok\s+▲ session model/);
  assert.match(r.out, /✚ …\/alerts\/SeverityFilter\.tsx/, 'files print relative to the project');
  assert.match(r.out, /FILES {2}2 changed|files {2}2 changed/i);
  assert.match(r.out, /ended/);
});

test('watch says how to start when there are no sessions, and rejects unknown flags', () => {
  const { cli } = sandbox();
  const none = cli('watch', '--once');
  assert.equal(none.code, 2);
  assert.match(none.err, /no Copilot sessions/);
  assert.match(cli('watch', '--follow').err, /watch takes --once and --session=<id>/);
});

test('the watch reader keeps a half-written line until the rest arrives', async () => {
  const { createReader } = await import('./watch.mjs');
  const { appendFileSync } = await import('node:fs');
  const file = join(mkdtempSync(join(tmpdir(), 'tblock-log-')), 'events.jsonl');
  writeFileSync(file, '{"type":"a"}\n{"type":');
  const read = createReader(file);
  assert.deepEqual(read().map((e) => e.type), ['a']);
  appendFileSync(file, '"b"}\n');
  assert.deepEqual(read().map((e) => e.type), ['b']);
  assert.deepEqual(read(), []);
});
