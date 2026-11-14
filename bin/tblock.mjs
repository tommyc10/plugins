#!/usr/bin/env node
// tblock's own CLI: deterministic setup checks and role files, so agents don't write them freehand.
// Node built-ins only, so it runs wherever Copilot CLI or Claude Code runs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handoff } from './handoff.mjs';
import { addToPath, binDir, launcherTarget, onPath, refreshLauncher, removeFromPath, shellProfile } from './launcher.mjs';
import { log } from './log.mjs';
import { HARNESSES, HARNESS_NAME, emptyFile, formatEntry, formatRoles, parseEntry, readRoles, rolesPath, runsInClaudeCode, section } from './roles.mjs';
import { createUI } from './ui.mjs';
import { loadPrices } from './usage.mjs';
import { watch } from './watch.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(PLUGIN, 'plugin.json'), 'utf8')).version;
const ROLES_FILE = rolesPath(homedir());
const COPILOT_HOME = process.env.COPILOT_HOME || join(homedir(), '.copilot');
const AGENTS_DIR = join(COPILOT_HOME, 'agents');
const SETTINGS_FILE = join(COPILOT_HOME, 'settings.json');
const PRESETS = JSON.parse(readFileSync(join(PLUGIN, 'presets.json'), 'utf8'));

const argv = process.argv.slice(2);
const json = argv.includes('--json');
// --from=<text> hands model names to `models` and `tiers detect` when VS Code's state is out of reach.
const fromText = argv.find((a) => a.startsWith('--from='))?.slice('--from='.length);
// --harness=<name> says which harness's section of the roles file a command reads or writes.
const harnessFlag = argv.find((a) => a.startsWith('--harness='))?.slice('--harness='.length);
const args = argv.filter((a) => a !== '--json' && !a.startsWith('--from=') && !a.startsWith('--harness='));
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

const checkEffort = (effort) => !effort || PRESETS.efforts.includes(effort);

// Which harness a command means: the flag, the harness this shell runs inside, the file's only
// section, or the one harness whose tiers already hold every model named.
function pickHarness(file, models = []) {
  if (harnessFlag) {
    if (!HARNESSES.includes(harnessFlag)) throw new Error(`--harness takes ${HARNESSES.join(' or ')}, not "${harnessFlag}"`);
    return harnessFlag;
  }
  if (process.env.CLAUDECODE === '1') return 'claude-code';
  const have = HARNESSES.filter((h) => file.harnesses[h]);
  if (have.length === 1) return have[0];
  const known = (h) => new Set([...Object.values(file.harnesses[h].tiers), ...Object.values(file.harnesses[h].roles).flat().map((e) => e.model), 'session']);
  const fits = models.length ? have.filter((h) => models.every((m) => known(h).has(m))) : [];
  if (fits.length === 1) return fits[0];
  throw new Error(`say which harness this is for: add --harness=${HARNESSES.join(' or --harness=')}`);
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

// What tblock writes to Copilot's settings.json per role agent. A model set there outranks the
// agent file's frontmatter, so a role keeps its model even when Copilot passes over the frontmatter.
const SETTINGS_KEYS = { effortLevel: 'effort', model: 'model' };

function expectedSettings(roles, specs, key) {
  const out = {};
  for (const { name, panel } of specs) {
    (roles[name] || []).forEach((entry, i) => {
      const value = entry[SETTINGS_KEYS[key]];
      if (value && value !== 'session') out[agentName(name, i, panel)] = value;
    });
  }
  return out;
}
const expectedEfforts = (roles, specs) => expectedSettings(roles, specs, 'effortLevel');

const readRolesFile = () => readRoles(homedir(), PRESETS.efforts);

// A line naming a role tblock no longer has is dropped on the next write, so say which went.
function droppedRoles(specs) {
  const known = new Set(specs.map((s) => s.name));
  const before = readRolesFile();
  if (!before) return [];
  return HARNESSES.flatMap((h) => Object.keys(before.harnesses[h]?.roles || {}).filter((r) => !known.has(r)).map((r) => ({ harness: h, role: r })));
}

function writeRolesFile(file, specs) {
  const dropped = droppedRoles(specs);
  const many = HARNESSES.filter((h) => file.harnesses[h]).length > 1;
  dropped.forEach(({ harness, role }) => say(ui.note(`dropped ${many ? `${HARNESS_NAME[harness]}: ` : ''}"${role}", which is not a tblock role any more`)));
  if (dropped.length) say('');
  mkdirSync(dirname(ROLES_FILE), { recursive: true });
  writeFileSync(ROLES_FILE, formatRoles(file, specs));
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

// Copilot reads per-subagent effort and model from settings.json, and `copilot config` refuses to set them.
// tblock owns only the effortLevel and model of tblock-* agents; every other key is left as it was.
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

function currentSettings(settings, key) {
  const agents = settings.subagents?.agents || {};
  return Object.fromEntries(Object.entries(agents).filter(([id, v]) => id.startsWith('tblock-') && v?.[key]).map(([id, v]) => [id, v[key]]));
}
const currentEfforts = (settings) => currentSettings(settings, 'effortLevel');

function syncSettings(roles, specs) {
  const settings = readSettings();
  const agents = { ...(settings.subagents?.agents || {}) };
  const set = [];
  const cleared = [];
  for (const key of Object.keys(SETTINGS_KEYS)) {
    const want = expectedSettings(roles, specs, key);
    for (const [id, entry] of Object.entries(agents)) {
      if (id.startsWith('tblock-') && entry?.[key] && !(id in want)) {
        const { [key]: _gone, ...others } = entry;
        if (Object.keys(others).length) agents[id] = others;
        else delete agents[id];
        cleared.push(`${id} ${key}`);
      }
    }
    for (const [id, value] of Object.entries(want)) {
      if (agents[id]?.[key] !== value) {
        agents[id] = { ...(agents[id] || {}), [key]: value };
        set.push(`${id} ${key}=${value}`);
      }
    }
  }
  if (set.length || cleared.length) {
    settings.subagents = { ...(settings.subagents || {}), agents };
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
    writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { set, cleared };
}

// Copilot's agents follow the copilot section whenever it exists, whichever harness was just edited.
function syncCopilot(file, specs) {
  const copilot = file.harnesses.copilot;
  if (!copilot) return;
  const agents = syncAgents(copilot.roles, specs, file.meta.names);
  const settings = syncSettings(copilot.roles, specs);
  const counted = (a, aWord, b, bWord) => (a || b ? [a && `${a} ${aWord}`, b && `${b} ${bWord}`].filter(Boolean).join(' · ') : 'up to date');
  const short = (f) => f.replace(/^tblock-/, '').replace(/\.agent\.md$/, '');
  say(ui.done('Copilot agents', `${counted(agents.written.length, 'written', agents.removed.length, 'removed')}  ${AGENTS_DIR}`));
  say(...ui.changes('+', agents.written.map(short)), ...ui.changes('-', agents.removed.map(short)));
  say(ui.done('Copilot models and efforts', `${counted(settings.set.length, 'set', settings.cleared.length, 'cleared')}  ${SETTINGS_FILE}`));
  say(...ui.changes('+', settings.set.map(short)), ...ui.changes('-', settings.cleared.map(short)));
}

// A tier the user hasn't mapped falls back to the nearest one, preferring the cheaper on a tie.
function pickModel(tiers, fam, tier) {
  const ladder = PRESETS.tiers;
  const at = ladder.indexOf(tier);
  const order = ladder.map((t, i) => [t, Math.abs(i - at), -i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([t]) => t);
  for (const t of order) if (tiers[`${fam}-${t}`]) return { model: tiers[`${fam}-${t}`], tier: t };
  return null;
}

// A panel wants one model per family. With fewer families than seats, as in Claude Code, the spare
// seats take the family's other tiers, strongest first, so the panel still seats different models.
function seatPanel(tiers, families, want) {
  const picks = families.slice(0, want.panel).map((f) => ({ f, ...pickModel(tiers, f, want.tier) }));
  const used = new Set(picks.map((p) => p.model));
  const spares = PRESETS.tiers.flatMap((t) => families.map((f) => ({ f, tier: t, model: tiers[`${f}-${t}`], spare: true })));
  for (const spare of spares) {
    if (picks.length >= want.panel) break;
    if (!spare.model || used.has(spare.model)) continue;
    used.add(spare.model);
    picks.push(spare);
  }
  return picks;
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
      const picks = seatPanel(tiers, families, want);
      const spare = picks.filter((p) => p.spare).map((p) => p.model);
      if (families.length < want.panel) notes.push(`${role}: ${families.length} of ${want.panel} families have models${spare.length ? `, so ${spare.join(' and ')} ${spare.length > 1 ? 'fill' : 'fills'} the panel` : ''}`);
      picks.filter((p) => !p.spare && p.tier !== want.tier).forEach((p) => notes.push(`${role}: no ${p.f}-${want.tier}, used ${p.f}-${p.tier}`));
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
  // The detected list is Copilot's model picker, so these tiers are always Copilot's.
  const file = readRolesFile() || emptyFile();
  section(file, 'copilot').tiers = suggestTiers(found.models);
  file.meta.names = Object.fromEntries(found.models.map((m) => [m.id, m.name]));
  writeRolesFile(file, roleSpecs());
  say('', tierGrid(file.harnesses.copilot.tiers), '', ui.hint('tblock preset <name>'), ui.dim('    fills every role from these tiers'));
}

// A digest of the files agents load, so an install that kept its version number but not its
// content still shows up as out of date.
function contentDigest(root) {
  const hash = createHash('sha1');
  const walk = (dir) => readdirSync(dir).sort().flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  for (const part of ['skills', 'agents', 'com.github.copilot', 'hooks', 'bin']) {
    if (!existsSync(join(root, part))) continue;
    for (const p of walk(join(root, part))) hash.update(relative(root, p).replaceAll('\\', '/')).update(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}
const differs = (installPath) => Boolean(installPath) && existsSync(installPath) && resolve(installPath) !== resolve(PLUGIN) && contentDigest(installPath) !== contentDigest(PLUGIN);

// VS Code's Copilot installs plugins on disk without the copilot CLI, so read the folder itself.
function copilotInstall() {
  const base = join(COPILOT_HOME, 'installed-plugins');
  if (!existsSync(base)) return null;
  for (const market of readdirSync(base)) {
    const path = join(base, market, 'tblock');
    try { return { path, version: JSON.parse(readFileSync(join(path, 'plugin.json'), 'utf8')).version }; } catch { /* not this folder */ }
  }
  return null;
}

function installCheck(add, label, version, installPath) {
  if (newer(VERSION, version)) add('WARN', label, `tblock ${version} installed, ${VERSION} available (reinstall to update)`);
  else if (differs(installPath)) add('WARN', label, `tblock ${version} installed, but its files differ from ${PLUGIN} (reinstall to update)`);
  else add('PASS', label, `tblock ${version} installed`);
}

function doctor() {
  const checks = [];
  const add = (level, check, detail) => checks.push({ level, check, detail });
  const specs = roleSpecs();

  let usedInClaude = false;
  const claude = run('claude', ['plugin', 'list', '--json']);
  if (claude.missing) add('SKIP', 'Claude Code', 'not installed');
  else if (!claude.ok) add('WARN', 'Claude Code', 'could not list plugins');
  else {
    const entry = JSON.parse(claude.out).find((p) => p.id.startsWith('tblock@'));
    usedInClaude = Boolean(entry);
    if (!entry) add('SKIP', 'Claude Code', 'tblock is not installed there');
    else if (entry.readFromFolder) add('PASS', 'Claude Code', `reads tblock from ${entry.readFromFolder} (${entry.folderVersion})`);
    else installCheck(add, 'Claude Code', entry.version, entry.installPath);
  }

  const copilot = run('copilot', ['plugin', 'list']);
  const onDisk = copilotInstall();
  const line = copilot.out?.split('\n').find((l) => /\btblock\b/.test(l));
  const listed = line && line.match(/\d+\.\d+\.\d+/)?.[0];
  if (listed || onDisk) installCheck(add, 'Copilot', listed || onDisk.version, onDisk?.path);
  else if (copilot.missing) add('SKIP', 'Copilot', 'copilot CLI not found');
  else if (line) add('WARN', 'Copilot', `tblock is installed, version unreadable: ${line.trim()}`);
  // Only one harness is in use on many machines, so a harness without tblock is not a problem.
  else add('SKIP', 'Copilot', 'tblock is not installed there');

  const file = readRolesFile();
  if (!file) add('WARN', 'Roles', `${ROLES_FILE} not found, so every subagent runs on the session model (run /setup-tblock)`);
  else {
    file.problems.forEach((p) => add('FAIL', 'Roles', `${ROLES_FILE}: ${p}`));
    const sections = HARNESSES.filter((h) => file.harnesses[h]);
    const known = new Set(specs.map((s) => s.name));
    for (const harness of sections) {
      const { roles } = file.harnesses[harness];
      const who = sections.length > 1 ? `${HARNESS_NAME[harness]}: ` : '';
      Object.keys(roles).filter((r) => !known.has(r)).forEach((r) => add('WARN', 'Roles', `${who}unknown role "${r}" is ignored`));
      const unset = specs.filter((s) => !roles[s.name]).map((s) => s.name);
      const models = Object.values(roles).flat().map((e) => e.model).filter((m) => m !== 'session');
      const families = new Set(models.map(family));
      add(unset.length ? 'WARN' : 'PASS', 'Roles', `${who}${Object.keys(roles).length} roles, models from ${families.size} ${families.size === 1 ? 'family' : 'families'}` +
        (file.meta.preset ? `, preset ${file.meta.preset}` : '') + (unset.length ? `; on the session model: ${unset.join(', ')}` : ''));
      if (harness === 'claude-code') {
        const foreign = [...new Set(models.filter((m) => !runsInClaudeCode(m)))];
        if (foreign.length) add('WARN', 'Roles', `${who}Claude Code runs only Claude models, so ${foreign.join(', ')} will not start (run: tblock preset ${(file.meta.preset || 'high').split(' ')[0]} --harness=claude-code)`);
      }
      for (const { name, panel } of specs) {
        const seats = (roles[name] || []).map((e) => e.model);
        if (!panel || seats.length < 2) continue;
        if (new Set(seats).size < seats.length) add('WARN', 'Roles', `${who}${name}: the same model sits twice, so only its lens differs`);
        // Claude Code has one family, so there a panel's variety comes from tiers and lenses.
        else if (harness !== 'claude-code' && new Set(seats.map(family)).size === 1) add('WARN', 'Roles', `${who}${name}: every entry is ${family(seats[0])}, so the panel has no model diversity`);
      }
    }
    if (!sections.includes('claude-code') && usedInClaude) add('WARN', 'Roles', 'no Claude Code section, so its subagents run on the session model (run: tblock preset high --harness=claude-code)');
    const copilotRoles = file.harnesses.copilot?.roles;
    if (copilotRoles) {
      const want = expectedAgents(copilotRoles, specs, file.meta.names);
      const have = existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR).filter((f) => /^tblock-.*\.agent\.md$/.test(f)) : [];
      const wrong = Object.entries(want).filter(([f, text]) => !have.includes(f) || readFileSync(join(AGENTS_DIR, f), 'utf8') !== text).map(([f]) => f);
      const stale = have.filter((f) => !(f in want));
      if (wrong.length) add('FAIL', 'Copilot agents', `${wrong.join(', ')} missing or out of date (run: tblock roles sync)`);
      else add('PASS', 'Copilot agents', `${Object.keys(want).length} role agents match ${ROLES_FILE}`);
      if (stale.length) add('WARN', 'Copilot agents', `${stale.join(', ')} match no role (run: tblock roles sync)`);
      try {
        const wantEfforts = expectedEfforts(copilotRoles, specs);
        const haveEfforts = currentEfforts(readSettings());
        const off = [...new Set([...Object.keys(wantEfforts), ...Object.keys(haveEfforts)])].filter((id) => wantEfforts[id] !== haveEfforts[id]);
        if (off.length) add('FAIL', 'Copilot efforts', `${off.map((id) => `${id} is ${haveEfforts[id] || 'unset'}, should be ${wantEfforts[id] || 'unset'}`).join('; ')} (run: tblock roles sync)`);
        else add('PASS', 'Copilot efforts', `${Object.keys(wantEfforts).length} effort levels match ${ROLES_FILE}`);
        const wantModels = expectedSettings(copilotRoles, specs, 'model');
        const haveModels = currentSettings(readSettings(), 'model');
        const offModels = [...new Set([...Object.keys(wantModels), ...Object.keys(haveModels)])].filter((id) => wantModels[id] !== haveModels[id]);
        if (offModels.length) add('FAIL', 'Copilot models', `${offModels.map((id) => `${id} is ${haveModels[id] || 'unset'}, should be ${wantModels[id] || 'unset'}`).join('; ')} (run: tblock roles sync)`);
        else add('PASS', 'Copilot models', `${Object.keys(wantModels).length} subagent models match ${ROLES_FILE}`);
      } catch (error) {
        add('FAIL', 'Copilot efforts', error.message);
      }
    }
    add(file.meta.guard ? 'PASS' : 'SKIP', 'Guard', file.meta.guard ? 'asks before a push, PR, MR, ticket, or publish, and tells each session its roles' : 'off, so pausing before a push rests on the agent alone (run: tblock guard on)');
  }

  const target = launcherTarget(homedir());
  const path = onPath(homedir());
  if (!target) add('SKIP', 'Command', 'no `tblock` command yet (run: tblock command on)');
  else if (!path) add('SKIP', 'Command', `the launcher runs ${target}, but ${binDir(homedir())} is not on PATH (run: tblock command on)`);
  else add('PASS', 'Command', `\`tblock\` runs ${target}${path === 'profile' ? '; new terminals pick it up' : ''}`);

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

function rolesTable(roles) {
  const rows = [];
  for (const { name } of roleSpecs()) {
    (roles[name] || [{ model: 'session', effort: null }]).forEach((entry, i) => {
      rows.push([i ? '' : ui.bold(name), ui.model(entry.model, modelFamily(entry.model)), ui.effort(entry.effort)]);
    });
  }
  return ui.table(rows, { head: ['role', 'model', 'effort'] });
}

function rolesFooter(meta) {
  const parts = [meta.preset && `preset ${ui.accent(meta.preset)}`, meta.tools.length && `tools ${meta.tools.join(', ')}`, `guard ${meta.guard ? 'on' : 'off'}`].filter(Boolean);
  return ui.dim(`  ${parts.join('  ·  ')}`);
}

// Every harness section, or only the one --harness names.
const shownHarnesses = (file) => HARNESSES.filter((h) => file.harnesses[h] && (!harnessFlag || h === harnessFlag));

function printRoles(file) {
  for (const harness of shownHarnesses(file)) say(ui.section(HARNESS_NAME[harness]), rolesTable(file.harnesses[harness].roles), '');
  say(rolesFooter(file.meta));
}

function showRoles() {
  const file = readRolesFile();
  if (json) return console.log(JSON.stringify(file ? { ...file.meta, harnesses: file.harnesses } : null, null, 2));
  process.stdout.write(ui.header('roles'));
  if (!file) return say(ui.status('SKIP', 'No roles yet', 'every subagent runs on the session model', 0), '', ui.hint('/setup-tblock'));
  printRoles(file);
}

const flagOf = (pairs, name) => pairs.find((p) => p.startsWith(`--${name}=`))?.split('=')[1];

function setRoles(pairs) {
  const specs = roleSpecs();
  const known = new Set(specs.map((s) => s.name));
  const file = readRolesFile() || emptyFile();
  if (flagOf(pairs, 'tools') !== undefined) file.meta.tools = flagOf(pairs, 'tools').split(',').map((t) => t.trim()).filter(Boolean);
  const changes = pairs.filter((p) => !p.startsWith('--')).map((pair) => {
    const [role, value] = pair.split('=');
    if (!known.has(role) || !value) throw new Error(`"${pair}" is not role=model. Roles: ${[...known].join(', ')}`);
    const entries = value.split(',').map((m) => parseEntry(m.trim())).filter((e) => e.model);
    const bad = entries.find((e) => !checkEffort(e.effort));
    if (bad) throw new Error(`effort "${bad.effort}" is not one of ${PRESETS.efforts.join(', ')}`);
    return [role, entries];
  });
  if (changes.length || harnessFlag) {
    const into = section(file, pickHarness(file, changes.flatMap(([, entries]) => entries.map((e) => e.model))));
    for (const [role, entries] of changes) into.roles[role] = entries;
  }
  if (changes.length && file.meta.preset && !file.meta.preset.endsWith('(edited)')) file.meta.preset = `${file.meta.preset} (edited)`;
  writeRolesFile(file, specs);
  syncCopilot(file, specs);
}

function setTiers(pairs) {
  const keys = PRESETS.families.flatMap((f) => PRESETS.tiers.map((t) => `${f}-${t}`));
  const file = readRolesFile() || emptyFile();
  const changes = pairs.map((pair) => {
    const [key, model] = pair.split('=');
    if (!keys.includes(key) || !model) throw new Error(`"${pair}" is not tier=model. Tiers: ${keys.join(', ')}`);
    return [key, model.trim()];
  });
  const harness = pickHarness(file);
  Object.assign(section(file, harness).tiers, Object.fromEntries(changes));
  writeRolesFile(file, roleSpecs());
  say('', ui.section(HARNESS_NAME[harness]), tierGrid(file.harnesses[harness].tiers));
}

function showTiers() {
  process.stdout.write(ui.header('tiers'));
  const file = readRolesFile() || emptyFile();
  const shown = shownHarnesses(file);
  for (const harness of shown) say(ui.section(HARNESS_NAME[harness]), tierGrid(file.harnesses[harness].tiers), '');
  if (!shown.length) say(tierGrid({}), '');
  say(ui.hint('tblock models'), ui.dim('    suggests tiers from your Copilot models'));
}

const presetOf = (recorded) => (recorded || '').split(' ')[0];
// A panel seats its entries side by side, so the same models in another order are the same panel.
const sameEntries = (a = [], b = [], panel = false) => {
  const key = (list) => (panel ? list.map(formatEntry).sort() : list.map(formatEntry)).join(', ');
  return key(a) === key(b);
};

// The user's own edits: roles that differ from what the recorded preset gives with today's tiers.
// With no preset recorded, every role was set by hand.
function editedRoles(file, harness, specs) {
  const part = file.harnesses[harness];
  if (!part) return [];
  let base = {};
  try { if (PRESETS.presets[presetOf(file.meta.preset)]) base = resolvePreset(presetOf(file.meta.preset), part.tiers, specs).roles; } catch { /* no tiers yet */ }
  return specs.filter((s) => part.roles[s.name] && !sameEntries(part.roles[s.name], base[s.name], s.panel)).map((s) => s.name);
}

// One preset fills every harness that has tiers, so Claude Code and Copilot never drift apart.
// It names every edit of the user's it resets, and --keep-edits keeps them; --dry-run writes nothing.
function checkPresetFlags(flags) {
  const unknown = flags.filter((f) => f !== '--keep-edits' && f !== '--dry-run');
  if (unknown.length) throw new Error(`preset takes --keep-edits and --dry-run, not ${unknown.join(' ')}`);
}

function applyPreset(name, flags = []) {
  checkPresetFlags(flags);
  const keep = flags.includes('--keep-edits');
  const dry = flags.includes('--dry-run');
  const specs = roleSpecs();
  const file = readRolesFile() || emptyFile();
  const mapped = HARNESSES.filter((h) => Object.keys(file.harnesses[h]?.tiers || {}).length);
  const targets = harnessFlag ? [pickHarness(file)] : mapped;
  if (!targets.length) resolvePreset(name, {}, specs);
  const report = {};
  for (const harness of targets) {
    const edited = editedRoles(file, harness, specs);
    const before = section(file, harness).roles;
    const { roles, notes } = resolvePreset(name, file.harnesses[harness].tiers, specs);
    const panel = new Set(specs.filter((s) => s.panel).map((s) => s.name));
    const edits = edited.filter((r) => !sameEntries(before[r], roles[r], panel.has(r))).map((role) => ({ role, yours: before[role], preset: roles[role] }));
    if (keep) edits.forEach(({ role, yours }) => { roles[role] = yours; });
    report[harness] = { roles, notes, edits };
    file.harnesses[harness].roles = roles;
  }
  const kept = keep && Object.values(report).some((r) => r.edits.length);
  file.meta.preset = kept ? `${name} (edited)` : name;
  if (dry && json) return console.log(JSON.stringify({ preset: file.meta.preset, harnesses: report }, null, 2));
  const who = (harness) => (targets.length > 1 ? `${HARNESS_NAME[harness]}: ` : '');
  for (const [harness, { notes }] of Object.entries(report)) notes.forEach((n) => say(ui.note(`${who(harness)}${n}`)));
  if (Object.values(report).some((r) => r.notes.length)) say('');
  const edits = Object.entries(report).flatMap(([harness, r]) => r.edits.map((e) => ({ harness, ...e })));
  if (edits.length) {
    const verb = keep ? 'Kept your edits' : dry ? 'Would reset your edits' : 'Reset your edits';
    say(ui.section(verb));
    say(ui.table(edits.map((e) => [ui.bold(`${who(e.harness)}${e.role}`), e.yours.map(formatEntry).join(', '), ui.dim(keep ? `instead of ${e.preset.map(formatEntry).join(', ')}` : `→ ${e.preset.map(formatEntry).join(', ')}`)])), '');
    if (!keep) say(ui.hint(`tblock preset ${name} --keep-edits`), ui.dim('    applies the preset and keeps these'), '');
  }
  if (dry) {
    for (const harness of targets) say(ui.section(`${HARNESS_NAME[harness]}, with preset ${file.meta.preset}`), rolesTable(file.harnesses[harness].roles), '');
    return say(ui.dim('  Dry run: nothing written.'));
  }
  writeRolesFile(file, specs);
  syncCopilot(file, specs);
  say('');
  printRoles(file);
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
  say(ui.hint('tblock preset <name>'), ui.dim('    switches every role at once, in every harness you have mapped'));
}

// The guard is two hooks the plugin ships. They stay silent until this switch is on.
function guard(to) {
  const file = readRolesFile() || emptyFile();
  if (to && to !== 'on' && to !== 'off') throw new Error(`guard takes on or off, not "${to}"`);
  if (!json) process.stdout.write(ui.header('guard'));
  if (to) {
    file.meta.guard = to === 'on';
    writeRolesFile(file, roleSpecs());
  }
  if (json) return console.log(JSON.stringify({ guard: file.meta.guard }));
  say(ui.status(file.meta.guard ? 'PASS' : 'SKIP', 'Guard', file.meta.guard ? 'on' : 'off', 8), '');
  say(ui.dim('  On, the harness asks you before an agent runs a push, a PR or MR, a ticket, or a publish,'));
  say(ui.dim('  and each new session starts knowing its roles and what this repo has set up.'), '');
  say(ui.hint(`tblock guard ${file.meta.guard ? 'off' : 'on'}`), ui.dim('    new sessions pick it up'));
}

// `tblock command on` writes the launcher and puts its folder on PATH, once; off undoes both.
function shellCommand(to) {
  if (to && to !== 'on' && to !== 'off') throw new Error(`command takes on or off, not "${to}"`);
  const home = homedir();
  if (!json) process.stdout.write(ui.header('command'));
  let where = null;
  if (to === 'on') {
    refreshLauncher(home, PLUGIN);
    where = addToPath(home);
  } else if (to === 'off') removeFromPath(home);
  const target = launcherTarget(home);
  const path = onPath(home);
  if (json) return console.log(JSON.stringify({ launcher: target, onPath: path, profile: where || shellProfile(home)?.file || null }));
  if (to === 'off') return say(ui.status('SKIP', 'Command', 'removed the launcher and the PATH line', 10), '', ui.hint('tblock command on'), ui.dim('    puts it back'));
  if (!target) return say(ui.status('SKIP', 'Command', 'no launcher yet', 10), '', ui.hint('tblock command on'), ui.dim('    adds a `tblock` command to your terminal'));
  say(ui.status('PASS', 'Command', `\`tblock\` runs ${target}`, 10));
  if (where) say(ui.done('PATH', `${binDir(home)} added in ${where}`));
  say('', ui.dim(path === 'now' ? '  Ready in this terminal.' : '  Open a new terminal, and `tblock` works there.'));
  say(ui.dim('  Each session start points it at the newest tblock install, so updates never break it.'));
}

const COMMANDS = [
  ['check', [
    ['doctor', 'check the install, roles, Copilot agents, and git tools'],
    ['guard on', 'have the harness ask before a push, PR, MR, ticket, or publish (guard off undoes it)'],
    ['command on', 'add a `tblock` command to your terminal that follows updates (command off undoes it)'],
  ]],
  ['watch', [
    ['watch', 'live view of a Copilot or Claude Code session: agents, models, tools, files'],
    ['watch --once', 'print one snapshot instead (--session=<id> picks a session by id prefix)'],
    ['watch --replay', 'play a recorded session back (--replay=<id> picks one by id prefix)'],
  ]],
  ['roles', [
    ['roles', 'show the model and effort each role uses, per harness'],
    ['roles set r=m …', 'set roles: r=model, r="model @ effort", r=m1,m2 for a panel'],
    ['roles sync', 'rewrite the Copilot role agents and efforts from the roles file'],
  ]],
  ['models', [
    ['models', 'list your Copilot models and suggest tiers'],
    ['tiers', 'show which model fills each tier'],
    ['tiers detect', 'save the suggested Copilot tiers'],
    ['tiers set k=m …', 'map tiers by hand, e.g. claude-top=claude-opus-5.5'],
  ]],
  ['presets', [
    ['preset', `list presets: ${Object.keys(PRESETS.presets).join(', ')}`],
    ['preset <name>', "set every role's model and effort at once, in every mapped harness"],
    ['preset <name> --keep-edits', 'apply a preset but keep the roles you changed by hand (--dry-run shows what changes)'],
  ]],
  ['log', [
    ['log', 'every agent session since yesterday: task, last reply, MRs, files, and cost'],
    ['log --since=monday', 'since a weekday, today, 3d, or a date; --here keeps this repo only'],
    ['handoff', "a brief of this repo's newest session, for another session or harness to pick up"],
    ['handoff --session=<id>', 'brief one session by id prefix; --out=<file> writes it to a file'],
  ]],
];

const FLAGS = [
  ['--json', 'output a script or agent can read'],
  ['--harness=<name>', 'claude-code or copilot: the section of the roles file to read or write'],
  ['--from="<text>"', 'read model names from pasted text, for VS Code on a remote'],
  ['--tools=', 'with roles set: the git host tools found, such as glab,gh'],
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
const homes = {
  claudeHome: process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'),
  copilotHome: COPILOT_HOME,
};
try {
  if (!command || command === 'help' || command === '--help') {
    showHelp();
  } else if (command === '--version') {
    console.log(VERSION);
  } else if (command === 'watch') {
    const flags = args.slice(1);
    const unknown = flags.filter((f) => f !== '--once' && !f.startsWith('--session=') && f !== '--replay' && !f.startsWith('--replay='));
    if (unknown.length) throw new Error(`watch takes --once, --session=<id>, and --replay[=<id>], not ${unknown.join(' ')}`);
    const replay = flags.find((f) => f === '--replay' || f.startsWith('--replay='));
    await watch({
      ui, version: VERSION, once: flags.includes('--once'),
      replay: replay ? replay.slice('--replay='.length) || true : false,
      session: flags.find((f) => f.startsWith('--session='))?.slice('--session='.length),
      ...homes,
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
    if (!file.harnesses.copilot) throw new Error('the roles file has no Copilot section to sync. Map its models first: tblock tiers detect, then tblock preset <name>');
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
    checkPresetFlags(rest);
    if (!(json && rest.includes('--dry-run'))) process.stdout.write(ui.header(`preset ${sub}`));
    applyPreset(sub, rest);
  } else if (command === 'guard') {
    guard(sub);
  } else if (command === 'command') {
    shellCommand(sub);
  } else if (command === 'log') {
    if (!json) process.stdout.write(ui.header('log'));
    process.stdout.write(log({ ui, json, flags: args.slice(1), cwd: process.cwd(), prices: loadPrices(PLUGIN, homedir()), ...homes }));
  } else if (command === 'handoff') {
    process.stdout.write(handoff({ json, flags: args.slice(1), cwd: process.cwd(), ...homes }));
  } else {
    throw new Error(`unknown command "${args.join(' ')}". Run tblock help to see the commands.`);
  }
} catch (error) {
  console.error(ui.error(error.message, wantsColor(process.stderr)));
  process.exitCode = 2;
}
