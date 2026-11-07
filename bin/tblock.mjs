#!/usr/bin/env node
// tblock's own CLI: deterministic setup checks and role files, so agents don't write them freehand.
// Node built-ins only, so it runs wherever Copilot CLI or Claude Code runs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUI } from './ui.mjs';
import { watch } from './watch.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(PLUGIN, 'plugin.json'), 'utf8')).version;
const ROLES_FILE = join(homedir(), '.tblock', 'roles.md');
const AGENTS_DIR = join(process.env.COPILOT_HOME || join(homedir(), '.copilot'), 'agents');
const SETTINGS_FILE = join(process.env.COPILOT_HOME || join(homedir(), '.copilot'), 'settings.json');
const PRESETS = JSON.parse(readFileSync(join(PLUGIN, 'presets.json'), 'utf8'));

const argv = process.argv.slice(2);
const json = argv.includes('--json');
// --from=<text> hands model names to `models` and `tiers detect` when VS Code's state is out of reach.
const fromText = argv.find((a) => a.startsWith('--from='))?.slice('--from='.length);
const args = argv.filter((a) => a !== '--json' && !a.startsWith('--from='));
// Colour only in a terminal; FORCE_COLOR turns it on for previews, NO_COLOR always wins.
const wantsColor = (stream) => !('NO_COLOR' in process.env) && (stream.isTTY || (process.env.FORCE_COLOR || '0') !== '0');
const ui = createUI({ color: !json && wantsColor(process.stdout), version: VERSION });
const say = (...lines) => lines.forEach((line) => console.log(line));

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
  const meta = { harness: null, tools: [], preset: null, tiers: {}, names: {} };
  const problems = [];
  text.split('\n').forEach((line, i) => {
    const comment = line.match(/^#\s*(harness|git host tools|preset|tiers|model names):\s*(.*)$/);
    if (comment) {
      const [, key, value] = comment;
      const list = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (key === 'harness') meta.harness = value.trim();
      else if (key === 'preset') meta.preset = value.trim();
      else if (key === 'tiers') meta.tiers = Object.fromEntries(list.map((pair) => pair.split('=').map((s) => s.trim())));
      else if (key === 'model names') meta.names = Object.fromEntries(list.map((pair) => pair.split('=').map((s) => s.trim())));
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
  const names = Object.entries(meta.names || {});
  if (names.length) lines.push(`# model names: ${names.map(([k, v]) => `${k}=${v}`).join(', ')}`);
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

// Every role agent carries the delegate's instructions.
function agentBody() {
  const shipped = readFileSync(join(PLUGIN, 'com.github.copilot', 'agents', 'delegate.agent.md'), 'utf8');
  return shipped.replace(/^---\n[\s\S]*?\n---\n/, '');
}

// The Copilot runtime behind the CLI and the agents window matches model ids, while VS Code's own
// chat matches "Name (copilot)", so list both when the name is known. Without `model-policy:
// required` the runtime ranks the parent session's model above the agent file's.
function modelLines(model, names = {}) {
  const id = names[model] ? model : Object.keys(names).find((k) => names[k] === model) || model;
  const models = names[id] ? `[${id}, "${names[id]} (copilot)"]` : model;
  return [`model: ${models}`, 'model-policy: required'];
}

function expectedAgents(roles, specs, names) {
  const files = {};
  for (const { name, panel } of specs) {
    (roles[name] || []).forEach(({ model }, i) => {
      const id = agentName(name, i, panel);
      const front = ['---', `name: ${id}`, `description: tblock ${name} subagent. Spawned by tblock skills, not chosen by hand.`];
      if (model !== 'session') front.push(...modelLines(model, names));
      front.push('user-invocable: false', '---');
      files[`${id}.agent.md`] = `${front.join('\n')}\n${agentBody()}`;
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
  say(ui.done('Saved roles', ROLES_FILE));
}

function syncAgents(roles, specs, names) {
  const want = expectedAgents(roles, specs, names);
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
  const agents = syncAgents(file.roles, specs, file.meta.names);
  const efforts = syncEfforts(file.roles, specs);
  const counted = (a, aWord, b, bWord) => (a || b ? [a && `${a} ${aWord}`, b && `${b} ${bWord}`].filter(Boolean).join(' · ') : 'up to date');
  const short = (f) => f.replace(/^tblock-/, '').replace(/\.agent\.md$/, '');
  say(ui.done('Copilot agents', `${counted(agents.written.length, 'written', agents.removed.length, 'removed')}  ${AGENTS_DIR}`));
  say(...ui.changes('+', agents.written.map(short)), ...ui.changes('-', agents.removed.map(short)));
  say(ui.done('Copilot efforts', `${counted(efforts.set.length, 'set', efforts.cleared.length, 'cleared')}  ${SETTINGS_FILE}`));
  say(...ui.changes('+', efforts.set.map(short)), ...ui.changes('-', efforts.cleared.map(short)));
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

// VS Code keeps the Copilot model picker's list in its state database, so setup can offer
// models instead of asking the user to type picker names exactly.
function vscodeStateFiles() {
  if (process.env.TBLOCK_VSCODE_STATE) return [process.env.TBLOCK_VSCODE_STATE];
  const base = process.platform === 'win32' ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return ['Code', 'Code - Insiders'].map((app) => join(base, app, 'User', 'globalStorage', 'state.vscdb')).filter(existsSync);
}

async function readVscodeState(file, keys) {
  // node:sqlite ships with Node 22.5+, and warns that it's experimental on first load.
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => (/SQLite/i.test(String(warning)) ? undefined : emit.call(process, warning, ...rest));
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const get = db.prepare('select value from ItemTable where key = ?');
    const values = Object.fromEntries(keys.map((k) => [k, get.get(k)?.value]));
    db.close();
    return values;
  } finally {
    process.emitWarning = emit;
  }
}

const modelFamily = (text) => (/claude|opus|sonnet|haiku|fable/i.test(text) ? 'claude' : /gpt|codex/i.test(text) ? 'gpt' : /gemini/i.test(text) ? 'gemini' : null);

// Picks model names out of any text: a paste from the picker, or the error Copilot's subagent tool
// gives for an unknown model, which lists every available model as "Name (copilot)".
const MODEL_NAME = /\b(?:Claude\s+(?:Opus|Sonnet|Haiku|Fable)\s+\d+(?:\.\d+)*|GPT-\d+(?:\.\d+)*(?:[- ](?:Sol|Terra|Luna|mini|nano|Codex|Max))*|Gemini\s+\d+(?:\.\d+)*\s+(?:Pro|Flash)(?:[- ]Lite)?(?:\s*\(Preview\))?|(?:claude-(?:opus|sonnet|haiku|fable)|gpt|gemini)-\d+(?:\.\d+)*(?:-[a-z]+)*)/gi;

function modelsFromText(text) {
  const models = new Map();
  // VS Code lists models that cost more than the session model after this marker, and refuses
  // them as subagents until the session runs on a model at least as costly.
  const overAt = text.search(/Unavailable \(exceeds/i);
  for (const { 0: match, index } of text.matchAll(MODEL_NAME)) {
    const id = match.toLowerCase().replace(/[()]/g, '').trim().replace(/\s+/g, '-');
    const typedId = match === id;
    const seen = models.get(id);
    // A picker name beats a bare id, because VS Code's chat matches names.
    const overCostTier = overAt >= 0 && index > overAt;
    if (!seen || (seen.typedId && !typedId)) models.set(id, { id, name: typedId ? id : match.replace(/\s+/g, ' '), family: modelFamily(id), typedId, ...(overCostTier && { overCostTier }) });
  }
  return [...models.values()].map(({ typedId, ...m }) => m);
}

async function detectModels() {
  const notes = [];
  if (fromText !== undefined) {
    const models = modelsFromText(fromText);
    if (!models.length) notes.push('the text given with --from names no Claude, GPT, or Gemini model');
    return { source: '--from', plan: null, models, notes };
  }
  for (const file of vscodeStateFiles()) {
    let state;
    try {
      state = await readVscodeState(file, ['chat.modelsControl', 'chat.cachedLanguageModels.v2', 'extensionsAssignmentFilterProvider.copilotSku']);
    } catch (error) {
      notes.push(`could not read ${file}: ${error.message}`);
      continue;
    }
    const models = new Map();
    const add = (id, name) => id && name && id !== 'auto' && !models.has(id) && models.set(id, { id, name, family: modelFamily(`${id} ${name}`) });
    const sku = state['extensionsAssignmentFilterProvider.copilotSku'] || '';
    const plan = /free/i.test(sku) ? 'free' : 'paid';
    try {
      const control = JSON.parse(state['chat.modelsControl'] || '{}');
      Object.values(control[plan] || {}).forEach((m) => add(m.id, m.label));
    } catch { notes.push('the picker list in VS Code state is not JSON'); }
    try {
      JSON.parse(state['chat.cachedLanguageModels.v2'] || '[]')
        .filter((m) => m.metadata?.vendor === 'copilot' && m.metadata.isUserSelectable)
        .forEach((m) => add(m.metadata.id, m.metadata.name));
    } catch { notes.push('the cached model list in VS Code state is not JSON'); }
    if (models.size) return { source: file, plan: sku || plan, models: [...models.values()], notes };
  }
  // VS Code keeps this state beside its window, so Remote-SSH, WSL, containers, and Codespaces
  // run tblock on a machine that doesn't have it.
  if (!vscodeStateFiles().length) notes.push('no VS Code state on this machine, which is normal when VS Code is connected to a remote. Pass the model list with --from instead');
  return { source: null, plan: null, models: [], notes };
}

// Size words rank a model inside its family; Copilot's Sol, Terra, and Luna run large to small.
const sizeOf = (name) => (/\b(opus|fable|sol|ultra|pro)\b/i.test(name) ? 'top' : /\b(haiku|mini|nano|flash|lite|luna)\b/i.test(name) ? 'fast' : 'strong');
const versionOf = (name) => (name.match(/(\d+(?:\.\d+)*)/)?.[1] || '0').split('.').map(Number);
const byVersion = (a, b) => {
  const [x, y] = [versionOf(a.name), versionOf(b.name)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};

function suggestTiers(models) {
  const tiers = {};
  for (const fam of PRESETS.families) {
    const group = Object.fromEntries(PRESETS.tiers.map((t) => [t, models.filter((m) => m.family === fam && sizeOf(m.name) === t).sort(byVersion)]));
    // No top model in the family: the newest strong one leads, the next one stays strong.
    if (!group.top.length && group.strong.length > 1) group.top.push(group.strong.shift());
    for (const t of PRESETS.tiers) if (group[t][0]) tiers[`${fam}-${t}`] = group[t][0].id;
  }
  return tiers;
}

// Families down, tiers across; an empty tier falls back to its neighbour when a preset runs.
function tierGrid(tiers) {
  const families = PRESETS.families.filter((f) => PRESETS.tiers.some((t) => tiers[`${f}-${t}`]));
  if (!families.length) return ui.dim('  no tiers mapped yet');
  const rows = families.map((f) => [ui.bold(f), ...PRESETS.tiers.map((t) => (tiers[`${f}-${t}`] ? ui.model(tiers[`${f}-${t}`], f) : ui.dim('·')))]);
  return ui.table(rows, { head: ['', ...PRESETS.tiers] });
}

async function showModels() {
  const found = await detectModels();
  const tiers = suggestTiers(found.models);
  if (json) return console.log(JSON.stringify({ ...found, tiers }, null, 2));
  process.stdout.write(ui.header('models'));
  if (!found.models.length) {
    say(ui.status('WARN', 'No Copilot models found', '', 0), '');
    found.notes.forEach((n) => say(ui.note(n)));
    return say('', ui.hint('tblock models --from="<model picker list, in any shape>"'));
  }
  const from = found.source === '--from' ? 'from the text you passed' : "from VS Code's model picker";
  say(ui.dim(`  ${found.models.length} models ${from}${found.plan ? `  ·  plan ${found.plan}` : ''}`), '');
  for (const fam of [...PRESETS.families, null]) {
    const group = found.models.filter((m) => m.family === fam).sort(byVersion);
    if (!group.length) continue;
    say(ui.section(fam || 'other'));
    say(ui.table(group.map((m) => [
      fam ? ui.model(m.name, fam) : ui.dim(`○ ${m.name}`),
      ui.dim(m.id),
      m.overCostTier ? ui.icon('WARN') + ui.dim(' costs more than the session model') : '',
    ])), '');
  }
  if (found.models.some((m) => m.overCostTier)) {
    say(ui.note('VS Code chat refuses a subagent model that costs more than the session model, so roles on those run only when the session model costs at least as much.'), '');
  }
  say(ui.section('suggested tiers'), tierGrid(tiers), '');
  say(ui.hint(`tblock tiers detect${fromText !== undefined ? ' --from="<the same list>"' : ''}`), ui.dim('    saves these tiers'));
}

async function detectTiers() {
  const found = await detectModels();
  if (!found.models.length) throw new Error(`no Copilot models found${found.notes.length ? ` (${found.notes.join('; ')})` : ''}. Pass the picker list with --from="<list>", or set tiers by hand: tblock tiers set claude-top=<model>`);
  const file = readRolesFile() || emptyFile();
  file.meta.tiers = suggestTiers(found.models);
  file.meta.names = Object.fromEntries(found.models.map((m) => [m.id, m.name]));
  writeRolesFile(file, roleSpecs());
  say('', tierGrid(file.meta.tiers), '', ui.hint('tblock preset <name>'), ui.dim('    fills every role from these tiers'));
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

  const codex = run('codex', ['plugin', 'list']);
  if (codex.missing) add('SKIP', 'Codex', 'codex CLI not found');
  else {
    const line = codex.out.split('\n').find((l) => /^\s*tblock@/.test(l));
    const found = line && line.match(/\binstalled\b.*?(\d+\.\d+\.\d+)/);
    if (!line || !found) add('SKIP', 'Codex', 'tblock is not installed there');
    else if (newer(VERSION, found[1])) add('WARN', 'Codex', `tblock ${found[1]} installed, ${VERSION} available (run: codex plugin marketplace upgrade)`);
    else add('PASS', 'Codex', `tblock ${found[1]} installed`);
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
      const want = expectedAgents(roles, specs, meta.names);
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

  const repo = run('git', ['rev-parse', '--show-toplevel']);
  if (repo.ok) {
    const items = [['probe.json', 'logs'], ['tickets.json', 'ticket labels'], ['grafana.json', 'Grafana']];
    const have = items.filter(([f]) => existsSync(join(repo.out.trim(), '.tblock', f))).map(([, label]) => label);
    const missing = items.map(([, label]) => label).filter((label) => !have.includes(label));
    add(have.length ? 'PASS' : 'SKIP', 'Project', `${have.length ? `${have.join(', ')} set up` : 'no .tblock files'}${missing.length ? `; not set up: ${missing.join(', ')} (run: /setup-project)` : ''}`);
  }

  return checks;
}

// A detail ending "(run: <command>)" prints the command on its own line, as the fix.
function printChecks(checks) {
  const labelWidth = Math.max(...checks.map((c) => c.check.length)) + 3;
  for (const { level, check, detail } of checks) {
    const fix = detail.match(/\s*\(run:? ([^)]+)\)\s*$/);
    say(ui.status(level, check, fix ? detail.slice(0, fix.index) : detail, labelWidth));
    if (fix) say(ui.hint(fix[1], (ui.color ? 5 : 7) + labelWidth));
  }
  const counts = Object.fromEntries(['PASS', 'WARN', 'FAIL', 'SKIP'].map((l) => [l, checks.filter((c) => c.level === l).length]));
  say('', ui.tally(counts));
}

function rolesTable(file) {
  const rows = [];
  for (const { name } of roleSpecs()) {
    (file.roles[name] || [{ model: 'session', effort: null }]).forEach((entry, i) => {
      rows.push([i ? '' : ui.bold(name), ui.model(entry.model, modelFamily(entry.model)), ui.effort(entry.effort)]);
    });
  }
  return ui.table(rows, { head: ['role', 'model', 'effort'] });
}

function rolesFooter(meta) {
  const parts = [meta.preset && `preset ${ui.accent(meta.preset)}`, meta.harness && `harness ${meta.harness}`, meta.tools.length && `tools ${meta.tools.join(', ')}`].filter(Boolean);
  return parts.length ? ui.dim(`  ${parts.join('  ·  ')}`) : '';
}

function showRoles() {
  const file = readRolesFile();
  if (json) return console.log(JSON.stringify(file ? { roles: file.roles, ...file.meta } : null, null, 2));
  process.stdout.write(ui.header('roles'));
  if (!file) return say(ui.status('SKIP', 'No roles yet', 'every subagent runs on the session model', 0), '', ui.hint('/setup-tblock'));
  say(rolesTable(file), '', rolesFooter(file.meta));
}

const emptyFile = () => ({ roles: {}, meta: { harness: null, tools: [], preset: null, tiers: {}, names: {} } });
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
  say('', tierGrid(file.meta.tiers));
}

function showTiers() {
  process.stdout.write(ui.header('tiers'));
  say(tierGrid(readRolesFile()?.meta.tiers || {}), '', ui.hint('tblock models'), ui.dim('    suggests tiers from your Copilot models'));
}

function applyPreset(name) {
  const specs = roleSpecs();
  const file = readRolesFile() || emptyFile();
  const { roles, notes } = resolvePreset(name, file.meta.tiers, specs);
  file.roles = roles;
  file.meta.preset = name;
  notes.forEach((n) => say(ui.note(n)));
  if (notes.length) say('');
  writeRolesFile(file, specs);
  syncCopilot(file, specs);
  say('', rolesTable(file), '', rolesFooter(file.meta));
}

const PRESET_BLURBS = {
  extreme: 'Hard design and risky changes: top models, high to max effort',
  high: 'Features and reviews: top thinkers, strong workers',
  efficient: 'Everyday bugs and small changes: strong models, medium effort',
};

function showPresets() {
  const current = readRolesFile()?.meta.preset;
  process.stdout.write(ui.header('preset'));
  const nameWidth = Math.max(...Object.keys(PRESETS.presets).map((n) => n.length)) + 3;
  for (const [name, roles] of Object.entries(PRESETS.presets)) {
    const on = current && current.split(' ')[0] === name;
    const mark = ui.color ? (on ? ui.accent('●') : ui.dim('○')) : on ? '*' : ' ';
    say(`  ${mark}  ${ui.pad(on ? ui.bold(ui.accent(name)) : ui.bold(name), nameWidth)}${PRESET_BLURBS[name] || ''}${on ? ui.dim(`  · current${current.endsWith('(edited)') ? ', edited' : ''}`) : ''}`);
    const shape = [['hardest', roles.hardest], ['code', roles.code], ['reviewers', roles.reviewers]]
      .map(([role, r]) => `${ui.dim(role)} ${r.panel ? `${r.panel}×` : ''}${r.tier} ${ui.color ? ui.effort(r.effort, { word: false }) : `@ ${r.effort}`}`);
    say(`  ${' '.repeat(3 + nameWidth)}${shape.join(ui.dim('   '))}`, '');
  }
  if (ui.color) say(`  ${ui.dim('effort')}  ${['low', 'medium', 'high', 'max'].map((e) => `${ui.effort(e, { word: false })} ${ui.dim(e)}`).join('   ')}`, '');
  say(ui.hint('tblock preset <name>'), ui.dim('    switches every role at once'));
}

const COMMANDS = [
  ['check', [['doctor', 'check the install, roles, Copilot agents, and git tools']]],
  ['watch', [
    ['watch', 'live view of a Copilot session: agents, models, tools, files'],
    ['watch --once', 'print one snapshot instead (--session=<id> picks a session)'],
  ]],
  ['roles', [
    ['roles', 'show the model and effort each role uses'],
    ['roles set r=m …', 'set roles: r=model, r="model @ effort", r=m1,m2 for a panel'],
    ['roles sync', 'rewrite the Copilot role agents and efforts from the roles file'],
  ]],
  ['models', [
    ['models', 'list your Copilot models and suggest tiers'],
    ['tiers', 'show which model fills each tier'],
    ['tiers detect', 'save the suggested tiers'],
    ['tiers set k=m …', 'map tiers by hand, e.g. claude-top=claude-opus-5.5'],
  ]],
  ['presets', [
    ['preset', `list presets: ${Object.keys(PRESETS.presets).join(', ')}`],
    ['preset <name>', "set every role's model and effort at once"],
  ]],
];

const FLAGS = [
  ['--json', 'output a script or agent can read'],
  ['--from="<text>"', 'read model names from pasted text, for VS Code on a remote'],
  ['--harness=, --tools=', 'with roles set: copilot, claude-code, or codex; glab,gh'],
];

function showHelp() {
  process.stdout.write(`${ui.logo('go deep first, then go fast')}\n`);
  const commandWidth = Math.max(...COMMANDS.flatMap(([, list]) => list.map(([c]) => c.length)), ...FLAGS.map(([f]) => f.length)) + 10;
  for (const [title, list] of COMMANDS) {
    say(ui.section(title));
    for (const [cmd, what] of list) say(`  ${ui.pad(`${ui.dim('tblock')} ${ui.bold(cmd)}`, commandWidth)}${what}`);
    say('');
  }
  say(ui.section('flags'));
  for (const [flag, what] of FLAGS) say(`  ${ui.pad(ui.accent(flag), commandWidth)}${ui.dim(what)}`);
  say('', ui.dim('  NO_COLOR=1 prints plain text.  tblock --version prints the version.'), '');
}

const [command, sub, ...rest] = args;
try {
  if (!command || command === 'help' || command === '--help') {
    showHelp();
  } else if (command === '--version') {
    console.log(VERSION);
  } else if (command === 'watch') {
    const flags = args.slice(1);
    const unknown = flags.filter((f) => f !== '--once' && !f.startsWith('--session='));
    if (unknown.length) throw new Error(`watch takes --once and --session=<id>, not ${unknown.join(' ')}`);
    await watch({
      ui, version: VERSION, once: flags.includes('--once'),
      session: flags.find((f) => f.startsWith('--session='))?.slice('--session='.length),
      copilotHome: process.env.COPILOT_HOME || join(homedir(), '.copilot'),
    });
  } else if (command === 'doctor') {
    const checks = doctor();
    if (json) console.log(JSON.stringify({ version: VERSION, checks }, null, 2));
    else {
      process.stdout.write(ui.header('doctor'));
      printChecks(checks);
    }
    process.exitCode = checks.some((c) => c.level === 'FAIL') ? 1 : 0;
  } else if (command === 'roles' && !sub) {
    showRoles();
  } else if (command === 'roles' && sub === 'set') {
    process.stdout.write(ui.header('roles set'));
    setRoles(rest);
  } else if (command === 'roles' && sub === 'sync') {
    const file = readRolesFile();
    if (!file) throw new Error(`no roles file at ${ROLES_FILE}; run /setup-tblock or tblock roles set first`);
    process.stdout.write(ui.header('roles sync'));
    syncCopilot(file, roleSpecs());
  } else if (command === 'models' && !sub) {
    await showModels();
  } else if (command === 'tiers' && !sub) {
    showTiers();
  } else if (command === 'tiers' && sub === 'detect') {
    process.stdout.write(ui.header('tiers detect'));
    await detectTiers();
  } else if (command === 'tiers' && sub === 'set') {
    process.stdout.write(ui.header('tiers set'));
    setTiers(rest);
  } else if (command === 'preset' && !sub) {
    showPresets();
  } else if (command === 'preset') {
    process.stdout.write(ui.header(`preset ${sub}`));
    applyPreset(sub);
  } else {
    throw new Error(`unknown command "${args.join(' ')}". Run tblock help to see the commands.`);
  }
} catch (error) {
  console.error(ui.error(error.message, wantsColor(process.stderr)));
  process.exitCode = 2;
}
