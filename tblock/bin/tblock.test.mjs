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

function sandbox(stubs = {}) {
  const home = mkdtempSync(join(tmpdir(), 'tblock-test-'));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  for (const [name, script] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const cli = (...args) => {
    const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin` };
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
  const r = cli('roles', 'set', '--harness=copilot', '--tools=gitlab-mcp,glab', 'code=gpt-5', 'reviewers=claude-opus-5,gpt-5', 'artist=session', 'verifier=claude-opus-5', 'swarm workers=gpt-5-mini');
  assert.equal(r.code, 0, r.err);

  const roles = readFileSync(join(home, '.tblock', 'roles.md'), 'utf8');
  assert.match(roles, /^# harness: copilot$/m);
  assert.match(roles, /^# git host tools: gitlab-mcp, glab$/m);
  assert.match(roles, /^code: gpt-5$/m);
  assert.match(roles, /^reviewers: claude-opus-5, gpt-5$/m);

  assert.match(roles, /^swarm workers: gpt-5-mini$/m);
  assert.deepEqual(agents(), ['tblock-artist.agent.md', 'tblock-code.agent.md', 'tblock-reviewers-1.agent.md', 'tblock-reviewers-2.agent.md', 'tblock-swarm-workers.agent.md', 'tblock-verifier.agent.md']);
  const reviewer = readFileSync(join(home, '.copilot', 'agents', 'tblock-reviewers-2.agent.md'), 'utf8');
  assert.match(reviewer, /^name: tblock-reviewers-2$/m);
  assert.match(reviewer, /^model: gpt-5$/m);

  const artist = readFileSync(join(home, '.copilot', 'agents', 'tblock-artist.agent.md'), 'utf8');
  assert.doesNotMatch(artist, /^model:/m, 'a session role leaves the model to Copilot');
  const shipped = readFileSync(join(PLUGIN, 'com.github.copilot', 'agents', 'artist.agent.md'), 'utf8');
  assert.ok(artist.endsWith(shipped.replace(/^---\n[\s\S]*?\n---\n/, '')), 'the artist role agent carries the shipped artist instructions');

  const verifier = readFileSync(join(home, '.copilot', 'agents', 'tblock-verifier.agent.md'), 'utf8');
  const truthsayer = readFileSync(join(PLUGIN, 'com.github.copilot', 'agents', 'truthsayer.agent.md'), 'utf8');
  assert.ok(verifier.endsWith(truthsayer.replace(/^---\n[\s\S]*?\n---\n/, '')), 'the verifier role agent carries the truthsayer instructions');
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
    claude: `echo '[{"id":"tblock@plugins","version":"0.0.9","installPath":"/x"}]'`,
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
  assert.deepEqual(roleLines, ['code', 'hardest', 'judgment', 'artist', 'verifier', 'reviewers', 'swarm workers', 'shootout runners', 'shootout judges']);

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
