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
    const env = { HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), XDG_CONFIG_HOME: join(home, '.config'), PATH: bin, ...extraEnv };
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
  assert.match(roles, /^## copilot$/m);
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
  cli('roles', 'set', '--harness=copilot', 'reviewers=claude-opus-5,claude-sonnet-5');
  const warning = find(doctorJson(cli), 'Roles').find((c) => /reviewers/.test(c.detail));
  assert.equal(warning?.level, 'WARN');
});

test('doctor reports an out-of-date install in each harness', { skip: process.platform === 'win32' && 'the stub CLIs are POSIX shell scripts' }, () => {
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

test('a harness without tblock installed is skipped, not warned about', { skip: process.platform === 'win32' && 'the stub CLIs are POSIX shell scripts' }, () => {
  const { cli } = sandbox({ copilot: 'echo "No plugins installed."' });
  const check = find(doctorJson(cli), 'Copilot')[0];
  assert.equal(check.level, 'SKIP');
  assert.match(check.detail, /not installed there/);
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

test('a role model reaches Copilot settings, where it outranks the agent file', () => {
  const { home, cli } = sandbox();
  const r = cli('roles', 'set', '--harness=copilot', 'code=gpt-5 @ high', 'judgment=session', 'reviewers=claude-opus-5,gpt-5@xhigh');
  assert.equal(r.code, 0, r.err);
  const agents = settingsOf(home).subagents.agents;
  assert.equal(agents['tblock-code'].model, 'gpt-5');
  assert.equal(agents['tblock-reviewers-1'].model, 'claude-opus-5');
  assert.equal(agents['tblock-reviewers-2'].model, 'gpt-5');
  assert.equal(agents['tblock-judgment'], undefined, 'a session role leaves the model to Copilot');

  cli('roles', 'set', 'code=session');
  assert.equal(settingsOf(home).subagents.agents['tblock-code']?.model, undefined, 'moving a role to session clears its model');
});

test('doctor fails when a Copilot subagent model drifts, and sync repairs it', () => {
  const { home, cli } = sandbox();
  cli('roles', 'set', '--harness=copilot', 'code=gpt-5');
  assert.equal(find(doctorJson(cli), 'Copilot models')[0].level, 'PASS');

  const settings = settingsOf(home);
  settings.subagents.agents['tblock-code'].model = 'gpt-4.1';
  writeFileSync(join(home, '.copilot', 'settings.json'), JSON.stringify(settings));
  const drift = find(doctorJson(cli), 'Copilot models')[0];
  assert.equal(drift.level, 'FAIL');
  assert.match(drift.detail, /tblock-code is gpt-4\.1, should be gpt-5/);

  cli('roles', 'sync');
  assert.equal(find(doctorJson(cli), 'Copilot models')[0].level, 'PASS');
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
  cli('tiers', 'set', '--harness=copilot', 'claude-top=opus', 'claude-strong=sonnet', 'gpt-strong=sol', 'gpt-fast=luna');

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
  assert.match(extreme.out, /reviewers: 2 of 3 families have models, so sonnet fills the panel/);
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
  cli('roles', 'set', '--harness=claude-code', 'code=session', 'hardest=opus', 'reviewers=sonnet');
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
  assert.match(none.err, /no Copilot or Claude Code sessions/);
  assert.match(cli('watch', '--follow').err, /watch takes --once, --session=<id>, and --replay/);
});

test('watch reads a Claude Code session: the prompt, each subagent with its model and effort, and files', async () => {
  const { writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { home, cli } = sandbox();
  writeClaudeSession(join(home, '.claude'));
  const r = cli('watch', '--once');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Claude Code {2}·/);
  assert.match(r.out, /main {3}claude-opus-5-5 high {3}turn 1/, 'the main agent shows its model and effort');
  assert.match(r.out, /▾ ! \d\d:\d\d {2}“\/tblock:tblock-mode add a severity filter”\s+4 tools · 2 agents · 1 file · 15s/, 'the task is the prompt as the user typed it, with its counts');
  assert.match(r.out, /your turn · waiting/);
  assert.match(r.out, /Add the filter\s+✔ {2}done\s+1 tool call\n/);
  assert.doesNotMatch(r.out, /Base directory for this skill/, 'skill bodies are not prompts');
  assert.match(r.out, /Add the filter\s+claude-sonnet-5-5\s+medium\s+42s\s+1 tools · 31\.0k tok\s+✔ role model/);
  assert.match(r.out, /Review the filter\s+claude-opus-5-5\s+9s\s+0 tools · 12\.0k tok\s+▲ session model/);
  assert.match(r.out, /✎ …\/alerts\/AlertsPage\.tsx/, 'a subagent edit counts as a changed file');
  assert.match(r.out, /✔ {2}main /, 'the turn has ended');
});

test('watch lists every live session as a tab and folds a run of one tool into one line', async () => {
  const { writeWatchSession } = await import('./fixtures/watch-session.mjs');
  const { claudeSessionRecords, writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { foldSteps } = await import('./watch.mjs');
  const { home, cli } = sandbox({}, {});
  // Start five hours back: a fixed start date makes the wait grow, which shortens the tab label until the match fails.
  writeClaudeSession(join(home, '.claude'), claudeSessionRecords({ start: Date.now() - 5 * 3600_000 }));
  writeWatchSession(join(home, '.copilot'));
  const r = cli('watch', '--once');
  assert.equal(r.code, 0, r.err);
  const tabs = r.out.split('\n')[2];
  assert.match(tabs, /▸1 /, 'the session on screen is marked');
  assert.match(tabs, /dashboard · \/tblock-mode add a sever.* \d+h/, 'a Claude Code tab: its folder, what it was asked, and how long it has waited');
  assert.match(tabs, /dashboard · Alerts severity filter/, 'a Copilot tab');

  const steps = foldSteps(['a', 'b', 'c'].map((text) => ({ agent: 'main', kind: 'search', tool: 'Grep', text })).concat({ agent: 'main', kind: 'shell', tool: 'Bash', text: 'ls' }));
  assert.deepEqual(steps.map((s) => [s.tool, s.times, s.text]), [['Grep', 3, 'c'], ['Bash', 1, 'ls']]);
});

test('a Claude Code turn stays busy until its reply text lands, not when its thinking block says end_turn', async () => {
  const { claudeSessionRecords, writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { home, cli } = sandbox();
  writeClaudeSession(join(home, '.claude'), claudeSessionRecords({ finished: false }));
  assert.match(cli('watch', '--once').out, /\* {2}main /);
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

test('watch shows what the agent said, what broke, its context, and the lines each file changed', async () => {
  const { claudeSessionRecords, writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { home, cli } = sandbox();
  writeClaudeSession(join(home, '.claude'), claudeSessionRecords({ trouble: true }));
  const r = cli('watch', '--once');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /│ Should I keep the old empty-state copy, or use the new one from the design\?/, 'the question it waits on shows in full');
  assert.match(r.out, /▲ failed 3× in a row · Bash · exit 1 · AssertionError: expected 3 rows, got 5/, 'three failures in a row get flagged');
  assert.match(r.out, /✖ {2}Bash\s+exit 1 · AssertionError: expected 3 rows/, 'a failed step says why');
  assert.match(r.out, /context {2}\[\.+\] {2}1\.1k \/ 1M · 0% · compacted ×1/, 'context against the model window');
  assert.match(r.out, /t3·background_wait\s+taskId=b1/, 'MCP tools read as server·tool with their argument');
  assert.match(r.out, /FILES {2}1 changed · \+3 −1/i);
  assert.match(r.out, /✎ …\/alerts\/AlertsPage\.tsx {2}\+3 −1/);
  assert.match(r.out, /≈ \$0\.0\d/, 'an estimated cost from the price table');
});

test('watch keys: arrows select a step, enter opens it, esc steps back one layer, then quits', async () => {
  const { onKey, initialView } = await import('./watch.mjs');
  const steps = [{ key: 1 }, { key: 2 }, { key: 3 }];
  const press = (view, key, tabs = 1) => onKey(view, key, { steps, tabs });
  let { view } = press(initialView(), '\x1b[A');
  assert.equal(view.selected, 3, 'up from following picks the newest step');
  ({ view } = press(view, 'k'));
  assert.equal(view.selected, 2);
  ({ view } = press(view, '\r'));
  assert.equal(view.layer, 'detail');
  ({ view } = press(view, '\x1b'));
  assert.deepEqual([view.layer, view.selected], ['feed', 2], 'esc closes the step and keeps the selection');
  ({ view } = press(view, '\x1b'));
  assert.equal(view.selected, null, 'esc again goes back to following');
  assert.equal(press(view, '\x1b').act, 'quit', 'esc on the plain feed quits, as before');
  assert.equal(press(initialView(), 'o').view.layer, 'overview');
  assert.equal(press(initialView(), '3', 4).act, 'tab:2');
  assert.equal(press(initialView(), '3', 2).act, null, 'a tab that is not there does nothing');
});

test('watch opens a step to its diff, splits into two panes when wide, and keeps quit in the footer', async () => {
  const { claudeSessionRecords, writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { createClaudeSource, listClaudeSessions } = await import('./watch-claude.mjs');
  const { createState, applyEvent, render, selectable, initialView } = await import('./watch.mjs');
  const { createUI } = await import('./ui.mjs');
  const home = mkdtempSync(join(tmpdir(), 'tblock-watch-'));
  writeClaudeSession(join(home, '.claude'), claudeSessionRecords({ trouble: true }));
  const s = listClaudeSessions(join(home, '.claude', 'projects'))[0];
  const state = createState(s.id, null);
  createClaudeSource(s)().forEach((e) => applyEvent(state, e));
  const ui = createUI({ color: false, version: 't', env: {} });
  const now = state.last + 1000;
  const edit = selectable(state, false).find((x) => x.tool === 'Edit');
  const opened = render(state, ui, { now, cols: 100, rows: 40, view: { ...initialView(), layer: 'detail', selected: edit.key } }).join('\n');
  assert.match(opened, /diff {2}\+3 −1\n {4}@@ -10,2 \+10,4 @@\n {5}const rows = alerts;\n {4}-const shown = rows;\n {4}\+const \[severity/);
  const wide = render(state, ui, { now, cols: 200, rows: 40 });
  assert.ok(wide.some((l) => /^tasks {2}1 .*│ *agent$/.test(l)), 'tasks on the left, the agent on the right');
  const colourUi = createUI({ color: true, version: 't', env: {} });
  const footer = render(state, colourUi, { now, cols: 80, rows: 30, pin: true }).at(-1).replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(footer.length <= 79 && footer.endsWith('q quit'), footer);
});

test('watch replays a session: seeking back and forward rebuilds the same state', async () => {
  const { claudeSessionRecords, writeClaudeSession } = await import('./fixtures/watch-claude-session.mjs');
  const { createClaudeSource, listClaudeSessions } = await import('./watch-claude.mjs');
  const { createState, createReplay } = await import('./watch.mjs');
  const home = mkdtempSync(join(tmpdir(), 'tblock-watch-'));
  writeClaudeSession(join(home, '.claude'), claudeSessionRecords({ trouble: true }));
  const s = listClaudeSessions(join(home, '.claude', 'projects'))[0];
  const rp = createReplay(createClaudeSource(s)(), () => createState(s.id, null));
  assert.equal(rp.marks.length, 1, 'one prompt to jump to');
  rp.seek(rp.t1);
  const end = { tools: rp.state.tools, errors: rp.state.errors };
  assert.deepEqual(end, { tools: 8, errors: 3 });
  rp.seek(rp.t0 + 6000);
  assert.ok(rp.state.tools < end.tools, 'seeking back undoes later events');
  rp.seek(rp.t1);
  assert.deepEqual({ tools: rp.state.tools, errors: rp.state.errors }, end, 'and forward again lands on the same state');
});

test('watch picks a notifier per platform and a reason for each failure', async () => {
  const { notifyCommand, errorLine, toolLabel } = await import('./watch.mjs');
  assert.equal(notifyCommand('win32', 't', 'b')[0], 'powershell.exe');
  assert.match(notifyCommand('win32', "it's", 'b')[1].at(-1), /CreateTextNode\('it''s'\)/, 'quotes are escaped for PowerShell');
  assert.deepEqual(notifyCommand('darwin', 'T', 'B'), ['osascript', ['-e', 'display notification "B" with title "T"']]);
  assert.deepEqual(notifyCommand('linux', 'T', 'B'), ['notify-send', ['T', 'B']]);
  assert.equal(notifyCommand('aix', 'T', 'B'), null);
  assert.equal(errorLine('Exit code 2\nsrc/a.ts: is_error: true\nTypeError: x is not a function'), 'exit 2 · TypeError: x is not a function');
  assert.equal(errorLine('permission denied'), 'permission denied');
  assert.equal(errorLine('Exit code 2\n70:  // Case matters: "AssertionError" is an error class\ngrep: bin/x.mjs: No such file or directory'), 'exit 2 · grep: bin/x.mjs: No such file or directory', 'a grep hit is not the reason');
  assert.equal(toolLabel('mcp__claude_ai_Claude_Docs__batch'), 'Claude·batch');
  assert.equal(toolLabel('Bash'), 'Bash');
});

test('watch tells the story, lists its keys, and counts what git and the project folder hold', async () => {
  const { createState, applyEvent, render, onKey, initialView, parseGit, trouble } = await import('./watch.mjs');
  const { createUI } = await import('./ui.mjs');
  const ui = createUI({ color: false, version: 't', env: {} });
  const state = createState('s1', null);
  const at = (n) => new Date(Date.UTC(2026, 0, 1, 12, 0, n)).toISOString();
  const ev = (n, type, data) => applyEvent(state, { type, data, timestamp: at(n) });
  ev(0, 'session.start', { startTime: at(0), context: { cwd: 'C:\\work\\app' } });
  ev(1, 'user.message', { content: 'fix the slug' });
  ev(1, 'assistant.turn_start', {});
  ev(2, 'tool.execution_start', { toolCallId: 'a', toolName: 'Bash', arguments: { command: 'cd /c/work/app && npm test' } });
  ev(3, 'tool.execution_complete', { toolCallId: 'a', success: false, error: 'Exit code 1\nAssertionError: slug' });
  ev(4, 'tool.execution_start', { toolCallId: 'b', toolName: 'Write', arguments: { file_path: 'C:\\work\\app\\src\\slug.ts' } });
  ev(5, 'tool.execution_complete', { toolCallId: 'b', success: true, patch: { created: true, added: 4, removed: 0, lines: [] } });
  ev(6, 'tool.execution_start', { toolCallId: 'c', toolName: 'Write', arguments: { file_path: 'C:\\Users\\me\\AppData\\Temp\\scratch.mjs' } });
  ev(7, 'tool.execution_complete', { toolCallId: 'c', success: true });
  ev(8, 'assistant.message', { content: 'Fixed the slug.' });
  const now = Date.parse(at(9));
  const draw = (opts) => render(state, ui, { now, cols: 110, rows: 60, ...opts }).join('\n');

  const all = draw({ git: parseGit(' M src/slug.ts\n?? notes.md\n', '4\t1\tsrc/slug.ts\n') });
  assert.match(all, /Bash\s+exit 1 · AssertionError: slug {2}npm test/, 'a cd into the project drops from the command');
  assert.match(all, /files {2}1 changed · \+4\n {2}✚ src\/slug\.ts {2}\+4\n {2}\+ 1 outside the project\n {2}git now {2}1 modified · 1 untracked · \+4 −1/, 'a new file is marked new, and scratch files fold into a count');

  const story = draw({ view: { ...initialView(), story: true } });
  assert.match(story, /says\s+“Fixed the slug\.”/);
  assert.match(story, /✖ {2}Bash/, 'the story keeps what broke');
  assert.doesNotMatch(story, /Write/, 'and drops the tool calls');
  assert.equal(onKey(initialView(), 's', {}).view.story, true);
  assert.equal(onKey(initialView(), '?', {}).view.layer, 'help');
  assert.match(draw({ view: { ...initialView(), layer: 'help' } }), /story: only what was said/);

  ev(10, 'session.error', { message: "You've hit your 5-hour limit" });
  ev(10, 'session.idle', {});
  assert.deepEqual(trouble(state, now), { level: 'fail', text: "stopped · You've hit your 5-hour limit" }, 'a limit that stopped the run is trouble');
  ev(11, 'assistant.turn_start', {});
  assert.equal(trouble(state, now), null, 'until it works again');
});

test('doctor shows which project files the current repo has', () => {
  const { home } = sandbox();
  const repo = join(home, 'repo');
  mkdirSync(join(repo, '.tblock'), { recursive: true });
  writeFileSync(join(repo, '.tblock', 'probe.json'), '{}');
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), XDG_CONFIG_HOME: join(home, '.config') };
  const r = spawnSync(process.execPath, [CLI, 'doctor', '--json'], { cwd: repo, env, encoding: 'utf8' });
  const project = JSON.parse(r.stdout).checks.find((c) => c.check === 'Project');
  assert.equal(project.level, 'PASS');
  assert.match(project.detail, /^logs set up; not set up: ticket labels, Grafana/);
});

const rolesText = (home) => readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');

test('one preset fills Claude Code and Copilot together, and keeps the Copilot agents in step', () => {
  const { home, cli, agents } = sandbox();
  cli('tiers', 'set', '--harness=claude-code', 'claude-top=opus', 'claude-strong=sonnet', 'claude-fast=haiku');
  cli('tiers', 'set', '--harness=copilot', 'claude-top=claude-opus-5.5', 'gpt-strong=gpt-5', 'gpt-fast=gpt-5-mini');
  const r = cli('preset', 'high');
  assert.equal(r.code, 0, r.err);
  const [, claude, copilot] = rolesText(home).split(/^## /m);
  assert.match(claude, /^claude-code\n# tiers: claude-top=opus/);
  assert.match(claude, /^hardest: opus @ high$/m);
  assert.match(copilot, /^hardest: claude-opus-5\.5 @ high$/m);
  assert.match(copilot, /^code: gpt-5 @ medium$/m);
  assert.ok(agents().includes('tblock-code.agent.md'));

  // An edit made for Claude Code leaves Copilot's section as it was, and doctor still passes its agents.
  cli('roles', 'set', '--harness=claude-code', 'code=opus @ high');
  assert.match(rolesText(home).split(/^## /m)[2], /^code: gpt-5 @ medium$/m);
  assert.equal(find(doctorJson(cli), 'Copilot agents')[0].level, 'PASS');
});

test('a Claude Code panel seats different tiers when it has one family', () => {
  const { home, cli } = sandbox();
  cli('tiers', 'set', '--harness=claude-code', 'claude-top=opus', 'claude-strong=sonnet', 'claude-fast=haiku');
  const r = cli('preset', 'high');
  assert.match(rolesText(home), /^reviewers: sonnet @ high, opus @ high$/m);
  assert.match(r.out, /reviewers: 1 of 2 families have models, so opus fills the panel/);
  assert.equal(find(doctorJson(cli), 'Roles').some((c) => /no model diversity/.test(c.detail)), false, 'one family is all Claude Code has, so doctor does not warn about it');

  cli('preset', 'extreme');
  assert.match(rolesText(home), /^reviewers: opus @ xhigh, sonnet @ xhigh, haiku @ xhigh$/m);
});

test('a roles file from before sections is read into its harness, and rewritten with one', () => {
  const { home, cli } = sandbox();
  mkdirSync(join(home, '.tblock'));
  writeFileSync(join(home, '.tblock', 'roles.md'), '# harness: claude-code\n# preset: high\n# tiers: claude-top=opus, claude-strong=sonnet\ncode: sonnet @ medium\nreviewers: opus @ high\n');
  const shown = JSON.parse(cli('roles', '--json').out);
  assert.deepEqual(shown.harnesses['claude-code'].roles.code, [{ model: 'sonnet', effort: 'medium' }]);
  assert.equal(shown.harnesses['claude-code'].tiers['claude-top'], 'opus');

  cli('roles', 'set', 'hardest=opus @ max');
  assert.match(rolesText(home), /^## claude-code\n# tiers: claude-top=opus, claude-strong=sonnet\ncode: sonnet @ medium\nhardest: opus @ max\nreviewers: opus @ high$/m);
  assert.doesNotMatch(rolesText(home), /# harness:/);
});

test('a role edit with two harnesses and no way to tell them apart asks which one', () => {
  const { cli } = sandbox();
  cli('roles', 'set', '--harness=claude-code', 'code=sonnet');
  cli('roles', 'set', '--harness=copilot', 'code=gpt-5');
  const r = cli('roles', 'set', 'hardest=o9');
  assert.equal(r.code, 2);
  assert.match(r.err, /add --harness=claude-code or --harness=copilot/);
  assert.equal(cli('roles', 'set', 'hardest=gpt-5').code, 0, 'a model only Copilot has names the harness');
});

test('doctor warns when a Claude Code role names a model Claude Code cannot run', () => {
  const { cli } = sandbox();
  cli('roles', 'set', '--harness=claude-code', 'code=gpt-5', 'hardest=opus');
  const warning = find(doctorJson(cli), 'Roles').find((c) => /gpt-5 will not start/.test(c.detail));
  assert.equal(warning?.level, 'WARN');
});

test('doctor finds a Copilot install on disk and says when its files differ from this copy', () => {
  const { home, cli } = sandbox();
  const install = join(home, '.copilot', 'installed-plugins', 'plugins', 'tblock');
  mkdirSync(join(install, 'skills', 'tblock-mode'), { recursive: true });
  const version = JSON.parse(readFileSync(join(PLUGIN, 'plugin.json'), 'utf8')).version;
  writeFileSync(join(install, 'plugin.json'), JSON.stringify({ name: 'tblock', version }));
  writeFileSync(join(install, 'skills', 'tblock-mode', 'SKILL.md'), 'an older copy');
  const check = find(doctorJson(cli), 'Copilot')[0];
  assert.equal(check.level, 'WARN');
  assert.ok(check.detail.startsWith(`tblock ${version} installed, but its files differ`), check.detail);

  writeFileSync(join(install, 'plugin.json'), JSON.stringify({ name: 'tblock', version: '0.0.9' }));
  assert.match(find(doctorJson(cli), 'Copilot')[0].detail, /0\.0\.9 installed, .* available/);
});

test('handoff briefs a session from its transcript: the task, where it stopped, files, and the transcript path', async () => {
  const { writeClaudeSession, CLAUDE_DEMO_ID } = await import('./fixtures/watch-claude-session.mjs');
  const { home, cli } = sandbox();
  writeClaudeSession(join(home, '.claude'));
  const r = cli('handoff', `--session=${CLAUDE_DEMO_ID.slice(0, 8)}`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^# Handoff: /);
  assert.match(r.out, /\*\*Session\.\*\* Claude Code `c1aude00-/);
  assert.match(r.out, /## The task\n\nadd a severity filter/);
  assert.match(r.out, /## Where it stopped/);
  assert.match(r.out, /AlertsPage\.tsx/);
  assert.match(r.out, /\*\*Transcript\.\*\* `.*c1aude00-0000-4000-8000-000000000000\.jsonl`/);
  assert.match(r.out, /tblock:delegate on claude-sonnet-5-5/);

  const none = cli('handoff', '--session=zzzz');
  assert.equal(none.code, 2);
  assert.match(none.err, /no session id starts with "zzzz"/);
});
