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
const SETTINGS_FILE = join(process.env.COPILOT_HOME || join(homedir(), '.copilot'), 'settings.json');
const PRESETS = JSON.parse(readFileSync(join(PLUGIN, 'presets.json'), 'utf8'));

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
  const section = table.split(/^## /m).find((s) => s.startsWith('Roles')) || '';
  return [...section.matchAll(/^\| `([a-z ]+)` \| ([^|]+) \|/gm)].map(([, name, usedBy]) => ({ name, panel: /\bpanel\b/i.test(usedBy) }));
}

// One entry is "model" or "model @ effort".
function parseEntry(text) {
  const [model, effort] = text.split('@').map((s) => s.trim());
  return { model, effort: effort || null };
}
const formatEntry = ({ model, effort }) => (effort ? `${model} @ ${effort}` : model);
const checkEffort = (effort) => !effort || PRESETS.efforts.includes(effort);

function parseRoles(text) {
  const roles = {};
  const meta = { harness: null, tools: [], preset: null, tiers: {} };
  const problems = [];
  text.split('\n').forEach((line, i) => {
    const comment = line.match(/^#\s*(harness|git host tools|preset|tiers):\s*(.*)$/);
    if (comment) {
      const [, key, value] = comment;
      const list = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (key === 'harness') meta.harness = value.trim();
      else if (key === 'preset') meta.preset = value.trim();
      else if (key === 'tiers') meta.tiers = Object.fromEntries(list.map((pair) => pair.split('=').map((s) => s.trim())));
      else meta.tools = list;
      return;
    }
    if (!line.trim() || line.startsWith('#')) return;
    const entry = line.match(/^([a-z ]+):\s*(.+)$/);
    if (!entry) return problems.push(`line ${i + 1} is not "role: model"`);
    const name = entry[1].trim();
    roles[name] = entry[2].split(',').map((m) => parseEntry(m.trim())).filter((e) => e.model);
    roles[name].filter((e) => !checkEffort(e.effort)).forEach((e) => problems.push(`${name}: effort "${e.effort}" is not one of ${PRESETS.efforts.join(', ')}`));
  });
  return { roles, meta, problems };
}

function formatRoles(roles, meta, specs) {
  const lines = ['# tblock roles. One line per role, as "model" or "model @ effort". Delete a line to use the session model.'];
  if (meta.harness) lines.push(`# harness: ${meta.harness}`);
  if (meta.tools.length) lines.push(`# git host tools: ${meta.tools.join(', ')}`);
  if (meta.preset) lines.push(`# preset: ${meta.preset}`);
  const tiers = Object.entries(meta.tiers);
  if (tiers.length) lines.push(`# tiers: ${tiers.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  for (const { name } of specs) if (roles[name]) lines.push(`${name}: ${roles[name].map(formatEntry).join(', ')}`);
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
    (roles[name] || []).forEach(({ model }, i) => {
      const id = agentName(name, i, panel);
      const front = ['---', `name: ${id}`, `description: tblock ${name} subagent. Spawned by tblock skills, not chosen by hand.`];
      if (model !== 'session') front.push(`model: ${model}`);
      front.push('user-invocable: false', '---');
      files[`${id}.agent.md`] = `${front.join('\n')}\n${agentBody(name)}`;
    });
  }
  return files;
}

function expectedEfforts(roles, specs) {
  const efforts = {};
  for (const { name, panel } of specs) {
    (roles[name] || []).forEach(({ effort }, i) => {
      if (effort) efforts[agentName(name, i, panel)] = effort;
    });
  }
  return efforts;
}

function readRolesFile() {
  if (!existsSync(ROLES_FILE)) return null;
  return parseRoles(readFileSync(ROLES_FILE, 'utf8'));
}

function writeRolesFile(file, specs) {
  mkdirSync(dirname(ROLES_FILE), { recursive: true });
  writeFileSync(ROLES_FILE, formatRoles(file.roles, file.meta, specs));
  console.log(`  wrote ${ROLES_FILE}`);
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

// Copilot reads per-subagent effort from settings.json, and `copilot config` refuses to set it.
// tblock owns only the effortLevel of tblock-* agents; every other key is left as it was.
function readSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  const text = readFileSync(SETTINGS_FILE, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${SETTINGS_FILE} is not plain JSON, so tblock left it alone`);
  }
}

function currentEfforts(settings) {
  const agents = settings.subagents?.agents || {};
  return Object.fromEntries(Object.entries(agents).filter(([id, v]) => id.startsWith('tblock-') && v?.effortLevel).map(([id, v]) => [id, v.effortLevel]));
}

function syncEfforts(roles, specs) {
  const want = expectedEfforts(roles, specs);
  const settings = readSettings();
  const agents = { ...(settings.subagents?.agents || {}) };
  const set = [];
  const cleared = [];
  for (const [id, entry] of Object.entries(agents)) {
    if (id.startsWith('tblock-') && entry?.effortLevel && !(id in want)) {
      const { effortLevel, ...others } = entry;
      if (Object.keys(others).length) agents[id] = others;
      else delete agents[id];
      cleared.push(id);
    }
  }
  for (const [id, effort] of Object.entries(want)) {
    if (agents[id]?.effortLevel !== effort) {
      agents[id] = { ...(agents[id] || {}), effortLevel: effort };
      set.push(`${id}=${effort}`);
    }
  }
  if (set.length || cleared.length) {
    settings.subagents = { ...(settings.subagents || {}), agents };
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
    writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { set, cleared };
}

function syncCopilot(file, specs) {
  if (file.meta.harness !== 'copilot') return;
  const agents = syncAgents(file.roles, specs);
  console.log(`  ${AGENTS_DIR}: ${agents.written.length} written, ${agents.removed.length} removed`);
  [...agents.written.map((f) => `+ ${f}`), ...agents.removed.map((f) => `- ${f}`)].forEach((l) => console.log(`    ${l}`));
  const efforts = syncEfforts(file.roles, specs);
  console.log(`  ${SETTINGS_FILE}: ${efforts.set.length} efforts set, ${efforts.cleared.length} cleared`);
  [...efforts.set.map((f) => `+ ${f}`), ...efforts.cleared.map((f) => `- ${f}`)].forEach((l) => console.log(`    ${l}`));
}

// A tier the user hasn't mapped falls back to the nearest one, preferring the cheaper on a tie.
function pickModel(tiers, fam, tier) {
  const ladder = PRESETS.tiers;
  const at = ladder.indexOf(tier);
  const order = ladder.map((t, i) => [t, Math.abs(i - at), -i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([t]) => t);
  for (const t of order) if (tiers[`${fam}-${t}`]) return { model: tiers[`${fam}-${t}`], tier: t };
  return null;
}

function resolvePreset(name, tiers, specs) {
  const preset = PRESETS.presets[name];
  if (!preset) throw new Error(`no preset "${name}". Presets: ${Object.keys(PRESETS.presets).join(', ')}`);
  const families = PRESETS.families.filter((f) => PRESETS.tiers.some((t) => tiers[`${f}-${t}`]));
  if (!families.length) throw new Error('no tiers set. Map your models first, for example: tblock tiers set claude-top=<model> gpt-strong=<model>');
  const roles = {};
  const notes = [];
  for (const { name: role } of specs) {
    const want = preset[role];
    if (want.tier === 'session') {
      roles[role] = [{ model: 'session', effort: want.effort }];
    } else if (want.panel) {
      const picks = families.slice(0, want.panel).map((f) => ({ f, ...pickModel(tiers, f, want.tier) }));
      if (picks.length < want.panel) notes.push(`${role}: ${picks.length} of ${want.panel} families have models`);
      picks.filter((p) => p.tier !== want.tier).forEach((p) => notes.push(`${role}: no ${p.f}-${want.tier}, used ${p.f}-${p.tier}`));
      roles[role] = picks.map((p) => ({ model: p.model, effort: want.effort }));
    } else {
      const fam = families.includes(want.family) ? want.family : families[0];
      const pick = pickModel(tiers, fam, want.tier);
      if (fam !== want.family) notes.push(`${role}: no ${want.family} models, used ${fam}`);
      else if (pick.tier !== want.tier) notes.push(`${role}: no ${fam}-${want.tier}, used ${fam}-${pick.tier}`);
      roles[role] = [{ model: pick.model, effort: want.effort }];
    }
  }
  return { roles, notes };
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
    const families = new Set(Object.values(roles).flat().filter((e) => e.model !== 'session').map((e) => family(e.model)));
    add(unset.length ? 'WARN' : 'PASS', 'Roles', `${Object.keys(roles).length} roles, models from ${families.size} ${families.size === 1 ? 'family' : 'families'}` +
      (meta.preset ? `, preset ${meta.preset}` : '') + (unset.length ? `; on the session model: ${unset.join(', ')}` : ''));
    for (const { name, panel } of specs) {
      const models = (roles[name] || []).map((e) => e.model);
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
      try {
        const wantEfforts = expectedEfforts(roles, specs);
        const haveEfforts = currentEfforts(readSettings());
        const off = [...new Set([...Object.keys(wantEfforts), ...Object.keys(haveEfforts)])].filter((id) => wantEfforts[id] !== haveEfforts[id]);
        if (off.length) add('FAIL', 'Copilot efforts', `${off.map((id) => `${id} is ${haveEfforts[id] || 'unset'}, should be ${wantEfforts[id] || 'unset'}`).join('; ')} (run: tblock roles sync)`);
        else add('PASS', 'Copilot efforts', `${Object.keys(wantEfforts).length} effort levels match ${ROLES_FILE}`);
      } catch (error) {
        add('FAIL', 'Copilot efforts', error.message);
      }
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
  for (const { name } of roleSpecs()) console.log(`  ${name.padEnd(17)} ${(file.roles[name] || [{ model: 'session' }]).map(formatEntry).join(', ')}`);
  if (file.meta.preset) console.log(`\n  preset: ${file.meta.preset}`);
  if (file.meta.harness) console.log(`  harness: ${file.meta.harness}`);
}

const emptyFile = () => ({ roles: {}, meta: { harness: null, tools: [], preset: null, tiers: {} } });
const flagOf = (pairs, name) => pairs.find((p) => p.startsWith(`--${name}=`))?.split('=')[1];

function setRoles(pairs) {
  const specs = roleSpecs();
  const known = new Set(specs.map((s) => s.name));
  const file = readRolesFile() || emptyFile();
  if (flagOf(pairs, 'harness')) file.meta.harness = flagOf(pairs, 'harness');
  if (flagOf(pairs, 'tools') !== undefined) file.meta.tools = flagOf(pairs, 'tools').split(',').map((t) => t.trim()).filter(Boolean);
  const changes = pairs.filter((p) => !p.startsWith('--'));
  for (const pair of changes) {
    const [role, value] = pair.split('=');
    if (!known.has(role) || !value) throw new Error(`"${pair}" is not role=model. Roles: ${[...known].join(', ')}`);
    const entries = value.split(',').map((m) => parseEntry(m.trim())).filter((e) => e.model);
    const bad = entries.find((e) => !checkEffort(e.effort));
    if (bad) throw new Error(`effort "${bad.effort}" is not one of ${PRESETS.efforts.join(', ')}`);
    file.roles[role] = entries;
  }
  if (changes.length && file.meta.preset && !file.meta.preset.endsWith('(edited)')) file.meta.preset = `${file.meta.preset} (edited)`;
  writeRolesFile(file, specs);
  syncCopilot(file, specs);
}

function setTiers(pairs) {
  const keys = PRESETS.families.flatMap((f) => PRESETS.tiers.map((t) => `${f}-${t}`));
  const file = readRolesFile() || emptyFile();
  for (const pair of pairs) {
    const [key, model] = pair.split('=');
    if (!keys.includes(key) || !model) throw new Error(`"${pair}" is not tier=model. Tiers: ${keys.join(', ')}`);
    file.meta.tiers[key] = model.trim();
  }
  writeRolesFile(file, roleSpecs());
}

function showTiers() {
  const file = readRolesFile();
  process.stdout.write(header('tiers'));
  const tiers = file?.meta.tiers || {};
  for (const f of PRESETS.families) console.log(`  ${f.padEnd(7)} ${PRESETS.tiers.map((t) => `${t}: ${tiers[`${f}-${t}`] || '-'}`).join('   ')}`);
}

function applyPreset(name) {
  const specs = roleSpecs();
  const file = readRolesFile() || emptyFile();
  const { roles, notes } = resolvePreset(name, file.meta.tiers, specs);
  file.roles = roles;
  file.meta.preset = name;
  writeRolesFile(file, specs);
  notes.forEach((n) => console.log(`  note: ${n}`));
  syncCopilot(file, specs);
}

function showPresets() {
  const current = readRolesFile()?.meta.preset;
  process.stdout.write(header('preset'));
  for (const [name, roles] of Object.entries(PRESETS.presets)) {
    const mark = current && current.startsWith(name) ? paint(RED, '▸') : ' ';
    console.log(`  ${mark} ${name.padEnd(10)} hardest ${roles.hardest.tier}@${roles.hardest.effort}, code ${roles.code.tier}@${roles.code.effort}, reviewers ${roles.reviewers.panel}×${roles.reviewers.tier}@${roles.reviewers.effort}`);
  }
}

const HELP = `
  tblock doctor              check the install, roles, Copilot agents and efforts, and git tools
  tblock roles               show which model and effort each role uses
  tblock roles set r=m ...   set roles: r=model, r="model @ effort", r=m1,m2 for a panel
                             (--harness=copilot|claude-code, --tools=glab,gh)
  tblock roles sync          rewrite the Copilot role agents and efforts from the roles file
  tblock tiers               show which of your models fills each tier
  tblock tiers set k=m ...   map tiers to models, e.g. claude-top=claude-opus-5.5 gpt-fast=gpt-5.6-luna
  tblock preset              list presets: ${Object.keys(PRESETS.presets).join(', ')}
  tblock preset <name>       set every role's model and effort from a preset
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
    syncCopilot(file, roleSpecs());
  } else if (command === 'tiers' && !sub) {
    showTiers();
  } else if (command === 'tiers' && sub === 'set') {
    process.stdout.write(header('tiers set'));
    setTiers(rest);
  } else if (command === 'preset' && !sub) {
    showPresets();
  } else if (command === 'preset') {
    process.stdout.write(header(`preset ${sub}`));
    applyPreset(sub);
  } else {
    throw new Error(`unknown command "${args.join(' ')}"${HELP}`);
  }
} catch (error) {
  console.error(`tblock: ${error.message}`);
  process.exitCode = 2;
}
