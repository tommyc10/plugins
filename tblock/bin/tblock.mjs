#!/usr/bin/env node
// tblock's own CLI: deterministic setup checks and role files, so agents don't write them freehand.
// Node built-ins only, so it runs wherever Copilot CLI or Claude Code runs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(PLUGIN, 'plugin.json'), 'utf8')).version;
const ROLES_FILE = join(homedir(), '.tblock', 'roles.md');
const AGENTS_DIR = join(process.env.COPILOT_HOME || join(homedir(), '.copilot'), 'agents');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const args = argv.filter((a) => a !== '--json');
const fancy = process.stdout.isTTY && !json && !('NO_COLOR' in process.env);

const paint = (rgb, text) => (fancy ? `\x1b[38;2;${rgb.join(';')}m${text}\x1b[0m` : text);
const RED = [235, 40, 40];
const COLORS = { PASS: [80, 200, 120], WARN: [235, 180, 60], FAIL: RED, SKIP: [130, 130, 130] };

const LETTERS = [
  '████████╗██████╗ ██╗      ██████╗  ██████╗██╗  ██╗',
  '╚══██╔══╝██╔══██╗██║     ██╔═══██╗██╔════╝██║ ██╔╝',
  '   ██║   ██████╔╝██║     ██║   ██║██║     █████╔╝ ',
  '   ██║   ██╔══██╗██║     ██║   ██║██║     ██╔═██╗ ',
  '   ██║   ██████╔╝███████╗╚██████╔╝╚██████╗██║  ██╗',
  '   ╚═╝   ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝',
];

function banner() {
  // Dark to bright red down the letters, then a lightsaber: grey hilt, glowing blade.
  const rows = LETTERS.map((line, i) => paint([120 + i * 25, 10, 10 + i * 4], line));
  const saber = paint([150, 150, 150], ' ▐▓▓█▌') + paint([255, 70, 70], '━'.repeat(44)) + paint([255, 160, 160], '╸');
  const tag = paint([150, 150, 150], ` on the block · go deep first, then go fast · v${VERSION}`);
  return ['', ...rows, saber, tag, ''].join('\n');
}

const header = (command) => `${paint(RED, '▟▙')} tblock ${VERSION} · ${command}\n`;

function run(cmd, cmdArgs) {
  try {
    return { ok: true, out: execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }) };
  } catch (error) {
    return { ok: false, missing: error.code === 'ENOENT', out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

// Roles come from setup-tblock's table, so the CLI and the skill can't disagree about them.
function roleSpecs() {
  const table = readFileSync(join(PLUGIN, 'skills', 'setup-tblock', 'SKILL.md'), 'utf8');
  return [...table.matchAll(/^\| `([a-z ]+)` \| ([^|]+) \|/gm)].map(([, name, usedBy]) => ({ name, panel: /\bpanel\b/i.test(usedBy) }));
}

function parseRoles(text) {
  const roles = {};
  const meta = { harness: null, tools: [] };
  const problems = [];
  text.split('\n').forEach((line, i) => {
    const comment = line.match(/^#\s*(harness|git host tools):\s*(.*)$/);
    if (comment) {
      if (comment[1] === 'harness') meta.harness = comment[2].trim();
      else meta.tools = comment[2].split(',').map((t) => t.trim()).filter(Boolean);
      return;
    }
    if (!line.trim() || line.startsWith('#')) return;
    const entry = line.match(/^([a-z ]+):\s*(.+)$/);
    if (!entry) return problems.push(`line ${i + 1} is not "role: model"`);
    roles[entry[1].trim()] = entry[2].split(',').map((m) => m.trim()).filter(Boolean);
  });
  return { roles, meta, problems };
}

function formatRoles(roles, meta, specs) {
  const lines = ['# tblock roles. One line per role. Delete a line to use the session model.'];
  if (meta.harness) lines.push(`# harness: ${meta.harness}`);
  if (meta.tools.length) lines.push(`# git host tools: ${meta.tools.join(', ')}`);
  for (const { name } of specs) if (roles[name]) lines.push(`${name}: ${roles[name].join(', ')}`);
  return `${lines.join('\n')}\n`;
}

const family = (model) =>
  /claude|opus|sonnet|haiku|fable/i.test(model) ? 'anthropic'
    : /gpt|codex|^o\d/i.test(model) ? 'openai'
      : /gemini/i.test(model) ? 'google'
        : /grok/i.test(model) ? 'xai'
          : model.toLowerCase();

const agentName = (role, index, panel) => `tblock-${role.replace(/ /g, '-')}${panel ? `-${index + 1}` : ''}`;

function agentBody(role) {
  if (role === 'artist') {
    const artist = readFileSync(join(PLUGIN, 'com.github.copilot', 'agents', 'artist.agent.md'), 'utf8');
    return artist.replace(/^---\n[\s\S]*?\n---\n/, '');
  }
  return 'Read the tblock-mode SKILL.md at the path your brief gives, in full, before any work. Then do the brief.\n';
}

function expectedAgents(roles, specs) {
  const files = {};
  for (const { name, panel } of specs) {
    (roles[name] || []).forEach((model, i) => {
      const id = agentName(name, i, panel);
      const front = ['---', `name: ${id}`, `description: tblock ${name} subagent. Spawned by tblock skills, not chosen by hand.`];
      if (model !== 'session') front.push(`model: ${model}`);
      front.push('user-invocable: false', '---');
      files[`${id}.agent.md`] = `${front.join('\n')}\n${agentBody(name)}`;
    });
  }
  return files;
}

function readRolesFile() {
  if (!existsSync(ROLES_FILE)) return null;
  return parseRoles(readFileSync(ROLES_FILE, 'utf8'));
}

function syncAgents(roles, specs) {
  const want = expectedAgents(roles, specs);
  mkdirSync(AGENTS_DIR, { recursive: true });
  const written = [];
  const removed = [];
  for (const [file, text] of Object.entries(want)) {
    const path = join(AGENTS_DIR, file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      writeFileSync(path, text);
      written.push(file);
    }
  }
  for (const file of readdirSync(AGENTS_DIR)) {
    if (/^tblock-.*\.agent\.md$/.test(file) && !(file in want)) {
      rmSync(join(AGENTS_DIR, file));
      removed.push(file);
    }
  }
  return { written, removed };
}

function doctor() {
  const checks = [];
  const add = (level, check, detail) => checks.push({ level, check, detail });
  const specs = roleSpecs();

  const claude = run('claude', ['plugin', 'list', '--json']);
  if (claude.missing) add('SKIP', 'Claude Code', 'not installed');
  else if (!claude.ok) add('WARN', 'Claude Code', 'could not list plugins');
  else {
    const entry = JSON.parse(claude.out).find((p) => p.id.startsWith('tblock@'));
    if (!entry) add('SKIP', 'Claude Code', 'tblock is not installed there');
    else if (entry.readFromFolder) add('PASS', 'Claude Code', `reads tblock from ${entry.readFromFolder} (${entry.folderVersion})`);
    else if (newer(VERSION, entry.version)) add('WARN', 'Claude Code', `tblock ${entry.version} installed, ${VERSION} available (reinstall to update)`);
    else add('PASS', 'Claude Code', `tblock ${entry.version} installed`);
  }

  const copilot = run('copilot', ['plugin', 'list']);
  if (copilot.missing) add('SKIP', 'Copilot', 'copilot CLI not found');
  else {
    const line = copilot.out.split('\n').find((l) => /\btblock\b/.test(l));
    const found = line && line.match(/\d+\.\d+\.\d+/);
    if (!line) add('WARN', 'Copilot', 'tblock is not in `copilot plugin list`');
    else if (!found) add('WARN', 'Copilot', `tblock is installed, version unreadable: ${line.trim()}`);
    else if (newer(VERSION, found[0])) add('WARN', 'Copilot', `tblock ${found[0]} installed, ${VERSION} available (reinstall to update)`);
    else add('PASS', 'Copilot', `tblock ${found[0]} installed`);
  }

  const file = readRolesFile();
  if (!file) add('WARN', 'Roles', `${ROLES_FILE} not found, so every subagent runs on the session model (run /setup-tblock)`);
  else {
    const { roles, meta, problems } = file;
    problems.forEach((p) => add('FAIL', 'Roles', `${ROLES_FILE}: ${p}`));
    const known = new Set(specs.map((s) => s.name));
    Object.keys(roles).filter((r) => !known.has(r)).forEach((r) => add('WARN', 'Roles', `unknown role "${r}" is ignored`));
    const unset = specs.filter((s) => !roles[s.name]).map((s) => s.name);
    const families = new Set(Object.values(roles).flat().map(family));
    add(unset.length ? 'WARN' : 'PASS', 'Roles', `${Object.keys(roles).length} roles, models from ${families.size} families` +
      (unset.length ? `; on the session model: ${unset.join(', ')}` : ''));
    for (const { name, panel } of specs) {
      const models = roles[name] || [];
      if (panel && models.length > 1 && new Set(models.map(family)).size === 1) {
        add('WARN', 'Roles', `${name}: every entry is ${family(models[0])}, so the panel has no model diversity`);
      }
    }
    if (meta.harness === 'copilot') {
      const want = expectedAgents(roles, specs);
      const have = existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR).filter((f) => /^tblock-.*\.agent\.md$/.test(f)) : [];
      const wrong = Object.entries(want).filter(([f, text]) => !have.includes(f) || readFileSync(join(AGENTS_DIR, f), 'utf8') !== text).map(([f]) => f);
      const stale = have.filter((f) => !(f in want));
      if (wrong.length) add('FAIL', 'Copilot agents', `${wrong.join(', ')} missing or out of date (run: tblock roles sync)`);
      else add('PASS', 'Copilot agents', `${Object.keys(want).length} role agents match ${ROLES_FILE}`);
      if (stale.length) add('WARN', 'Copilot agents', `${stale.join(', ')} match no role (run: tblock roles sync)`);
    }
  }

  for (const [tool, label] of [['glab', 'GitLab CLI'], ['gh', 'GitHub CLI']]) {
    const auth = run(tool, ['auth', 'status']);
    if (auth.missing) add('SKIP', label, `${tool} not found`);
    else add(auth.ok ? 'PASS' : 'WARN', label, auth.ok ? `${tool} is logged in` : `${tool} is installed but not logged in`);
  }
  add('SKIP', 'GitLab MCP', 'only visible inside an agent session; ask the agent which MCP servers it has');

  return checks;
}

function printChecks(checks) {
  for (const { level, check, detail } of checks) console.log(`  ${paint(COLORS[level], level.padEnd(4))}  ${check}: ${detail}`);
}

function showRoles() {
  const file = readRolesFile();
  if (json) return console.log(JSON.stringify(file ? { roles: file.roles, ...file.meta } : null, null, 2));
  process.stdout.write(header('roles'));
  if (!file) return console.log(`  No roles file at ${ROLES_FILE}. Every subagent runs on the session model.`);
  for (const { name } of roleSpecs()) console.log(`  ${name.padEnd(17)} ${(file.roles[name] || ['session']).join(', ')}`);
  if (file.meta.harness) console.log(`\n  harness: ${file.meta.harness}`);
}

function setRoles(pairs) {
  const specs = roleSpecs();
  const known = new Set(specs.map((s) => s.name));
  const file = readRolesFile() || { roles: {}, meta: { harness: null, tools: [] } };
  const flag = (name) => pairs.find((p) => p.startsWith(`--${name}=`))?.split('=')[1];
  if (flag('harness')) file.meta.harness = flag('harness');
  if (flag('tools') !== undefined) file.meta.tools = flag('tools').split(',').map((t) => t.trim()).filter(Boolean);
  for (const pair of pairs.filter((p) => !p.startsWith('--'))) {
    const [role, value] = pair.split('=');
    if (!known.has(role) || !value) throw new Error(`"${pair}" is not role=model. Roles: ${[...known].join(', ')}`);
    file.roles[role] = value.split(',').map((m) => m.trim()).filter(Boolean);
  }
  mkdirSync(dirname(ROLES_FILE), { recursive: true });
  writeFileSync(ROLES_FILE, formatRoles(file.roles, file.meta, specs));
  console.log(`  wrote ${ROLES_FILE}`);
  if (file.meta.harness === 'copilot') reportSync(syncAgents(file.roles, specs));
}

function reportSync({ written, removed }) {
  console.log(`  ${AGENTS_DIR}: ${written.length} written, ${removed.length} removed`);
  [...written.map((f) => `+ ${f}`), ...removed.map((f) => `- ${f}`)].forEach((l) => console.log(`    ${l}`));
}

const HELP = `
  tblock doctor              check the install, the roles file, Copilot agents, and git tools
  tblock roles               show which model each role uses
  tblock roles set r=m ...   set roles (r=m1,m2 for a panel; --harness=copilot|claude-code; --tools=glab,gh)
  tblock roles sync          rewrite the Copilot role agents from the roles file
  tblock --version           print the version
`;

const [command, sub, ...rest] = args;
try {
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(`${fancy ? banner() : `tblock ${VERSION}\n`}${HELP}\n`);
  } else if (command === '--version') {
    console.log(VERSION);
  } else if (command === 'doctor') {
    const checks = doctor();
    if (json) console.log(JSON.stringify({ version: VERSION, checks }, null, 2));
    else {
      process.stdout.write(fancy ? `${banner()}\n` : header('doctor'));
      printChecks(checks);
    }
    process.exitCode = checks.some((c) => c.level === 'FAIL') ? 1 : 0;
  } else if (command === 'roles' && !sub) {
    showRoles();
  } else if (command === 'roles' && sub === 'set') {
    process.stdout.write(header('roles set'));
    setRoles(rest);
  } else if (command === 'roles' && sub === 'sync') {
    const file = readRolesFile();
    if (!file) throw new Error(`no roles file at ${ROLES_FILE}; run /setup-tblock or tblock roles set first`);
    process.stdout.write(header('roles sync'));
    reportSync(syncAgents(file.roles, roleSpecs()));
  } else {
    throw new Error(`unknown command "${args.join(' ')}"${HELP}`);
  }
} catch (error) {
  console.error(`tblock: ${error.message}`);
  process.exitCode = 2;
}
