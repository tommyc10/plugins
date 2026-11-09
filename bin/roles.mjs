// The roles file, ~/.tblock/roles.md: which model and effort each role uses, with one section per
// harness, because Claude Code and Copilot name the same model differently. Node built-ins only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HARNESSES = ['claude-code', 'copilot'];
export const HARNESS_NAME = { 'claude-code': 'Claude Code', copilot: 'Copilot' };
export const rolesPath = (home) => join(home, '.tblock', 'roles.md');

export const emptyFile = () => ({ meta: { tools: [], preset: null, guard: false, names: {} }, harnesses: {} });
export const section = (file, harness) => (file.harnesses[harness] ||= { tiers: {}, roles: {} });

// One entry is "model" or "model @ effort".
export function parseEntry(text) {
  const [model, effort] = text.split('@').map((s) => s.trim());
  return { model, effort: effort || null };
}
export const formatEntry = ({ model, effort }) => (effort ? `${model} @ ${effort}` : model);

const pairs = (list) => Object.fromEntries(list.map((pair) => pair.split('=').map((s) => s.trim())));
const CLAUDE_CODE_MODEL = /^(opus|sonnet|haiku|fable|session|claude-[a-z0-9.-]+)$/i;
export const runsInClaudeCode = (model) => CLAUDE_CODE_MODEL.test(model);

export function parseRoles(text, efforts = []) {
  const file = emptyFile();
  const problems = [];
  // Before 0.18 the file held one harness, named in a comment, with no section headings.
  const legacy = { harness: null, tiers: {}, roles: {} };
  let current = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const heading = line.match(/^##\s+(\S+)\s*$/);
    if (heading) {
      if (!HARNESSES.includes(heading[1])) problems.push(`line ${i + 1}: "${heading[1]}" is not a harness (${HARNESSES.join(', ')})`);
      current = section(file, heading[1]);
      return;
    }
    const comment = line.match(/^#\s*(harness|git host tools|preset|guard|tiers|model names):\s*(.*)$/);
    if (comment) {
      const [, key, value] = comment;
      const list = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (key === 'harness') legacy.harness = value.trim();
      else if (key === 'preset') file.meta.preset = value.trim();
      else if (key === 'guard') file.meta.guard = value.trim() === 'on';
      else if (key === 'tiers') (current || legacy).tiers = pairs(list);
      else if (key === 'model names') file.meta.names = pairs(list);
      else file.meta.tools = list;
      return;
    }
    if (!line.trim() || line.startsWith('#')) return;
    const entry = line.match(/^([a-z ]+):\s*(.+)$/);
    if (!entry) return problems.push(`line ${i + 1} is not "role: model"`);
    const name = entry[1].trim();
    const entries = entry[2].split(',').map((m) => parseEntry(m.trim())).filter((e) => e.model);
    (current || legacy).roles[name] = entries;
    entries.filter((e) => e.effort && !efforts.includes(e.effort)).forEach((e) => problems.push(`${name}: effort "${e.effort}" is not one of ${efforts.join(', ')}`));
  });
  if (Object.keys(legacy.roles).length || Object.keys(legacy.tiers).length) {
    const models = [...Object.values(legacy.roles).flat().map((e) => e.model), ...Object.values(legacy.tiers)];
    const harness = HARNESSES.includes(legacy.harness) ? legacy.harness : models.every(runsInClaudeCode) ? 'claude-code' : 'copilot';
    const into = section(file, harness);
    Object.assign(into.tiers, legacy.tiers);
    Object.assign(into.roles, legacy.roles);
  }
  return { ...file, problems };
}

export function formatRoles(file, specs) {
  const lines = ['# tblock roles. One section per harness; one line per role, as "model" or "model @ effort". Delete a line to use the session model.'];
  const { tools, preset, guard, names } = file.meta;
  if (tools.length) lines.push(`# git host tools: ${tools.join(', ')}`);
  if (preset) lines.push(`# preset: ${preset}`);
  if (guard) lines.push('# guard: on');
  const named = Object.entries(names || {});
  if (named.length) lines.push(`# model names: ${named.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  for (const harness of HARNESSES) {
    const part = file.harnesses[harness];
    if (!part) continue;
    lines.push('', `## ${harness}`);
    const tiers = Object.entries(part.tiers);
    if (tiers.length) lines.push(`# tiers: ${tiers.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const { name } of specs) if (part.roles[name]) lines.push(`${name}: ${part.roles[name].map(formatEntry).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export function readRoles(home, efforts) {
  const path = rolesPath(home);
  return existsSync(path) ? parseRoles(readFileSync(path, 'utf8'), efforts) : null;
}
