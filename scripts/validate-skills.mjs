#!/usr/bin/env node
// Validates the files agents load. Node built-ins only, so it runs wherever the tblock CLI runs.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { delegateAgents } from './build-agents.mjs';

const list = (dir, test) => (existsSync(dir) ? readdirSync(dir).filter(test).sort().map((f) => join(dir, f)) : []);
const walk = (dir) => readdirSync(dir).sort().flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// Frontmatter here is flat `key: scalar` lines. Indented lines belong to a nested map, which no check reads.
export function parseFrontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!block) return null;
  const data = {};
  for (const line of block[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const raw = m[2].trim();
    if (raw.startsWith('"')) data[m[1]] = JSON.parse(raw);
    else if (raw.startsWith("'")) data[m[1]] = raw.slice(1, -1).replaceAll("''", "'");
    else if (raw === 'true' || raw === 'false') data[m[1]] = raw === 'true';
    else data[m[1]] = raw === '' ? null : raw;
  }
  return { data, body: text.slice(block[0].length) };
}

export function validate(root) {
  const errors = [];
  const rel = (p) => relative(root, p).replaceAll('\\', '/');
  const skills = [];

  for (const file of list(join(root, 'skills'), (d) => existsSync(join(root, 'skills', d, 'SKILL.md'))).map((d) => join(d, 'SKILL.md'))) {
    const dir = basename(dirname(file));
    let parsed;
    try { parsed = parseFrontmatter(readFileSync(file, 'utf8')); } catch (e) { errors.push(`${rel(file)}: ${e.message}`); continue; }
    if (!parsed) { errors.push(`${rel(file)}: missing YAML frontmatter`); continue; }
    const { name, description } = parsed.data;
    const hidden = parsed.data['disable-model-invocation'];
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) errors.push(`${rel(file)}: invalid skill name`);
    if (name !== dir) errors.push(`${rel(file)}: name must match directory`);
    if (skills.some((s) => s.name === name)) errors.push(`${rel(file)}: duplicate skill name ${name}`);
    if (typeof description !== 'string' || !description.trim() || description.length > 1024 || /[<>]/.test(description)) errors.push(`${rel(file)}: invalid description`);
    if (hidden !== undefined && typeof hidden !== 'boolean') errors.push(`${rel(file)}: disable-model-invocation must be boolean`);
    if (String(name).startsWith('principle-') && hidden !== true) errors.push(`${rel(file)}: principles load through tblock-mode and need disable-model-invocation: true`);
    skills.push({ name, file, dir, hidden: hidden === true });
  }
  if (!skills.length) errors.push('No skills found');
  const names = new Set(skills.map((s) => s.name));

  const documents = walk(join(root, 'skills')).filter((f) => f.endsWith('.md'));
  if (existsSync(join(root, 'README.md'))) documents.push(join(root, 'README.md'));
  let links = 0;
  for (const file of documents) {
    let fence = null;
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        return;
      }
      if (fence) return;
      if (/^\s*\[TODO:/.test(line)) errors.push(`${rel(file)}:${i + 1}: unfinished TODO`);
      for (const [, raw] of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        let target = raw.trim().replace(/^<(.+)>$/, '$1');
        if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        target = decodeURIComponent(target.split('#')[0]);
        links += 1;
        if (!existsSync(join(dirname(file), target))) errors.push(`${rel(file)}:${i + 1}: missing link target ${target}`);
      }
    });
  }

  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
  const mode = read(join(root, 'skills/tblock-mode/SKILL.md'));
  if (mode) {
    const routed = new Set([...mode.matchAll(/\]\(\.\.\/(principle-[a-z0-9-]+)\/SKILL\.md\)/g)].map((m) => m[1]));
    [...names].filter((n) => n.startsWith('principle-') && !routed.has(n)).sort()
      .forEach((n) => errors.push(`skills/${n}/SKILL.md: not linked from tblock-mode, so nothing loads it`));
  }

  const help = read(join(root, 'skills/tblock-help/SKILL.md'));
  if (help) {
    const mapped = new Set([...help.matchAll(/\]\(\.\.\/([a-z0-9-]+)\/SKILL\.md\)/g)].map((m) => m[1]));
    [...names].filter((n) => !n.startsWith('principle-') && n !== 'tblock-help' && !mapped.has(n)).sort()
      .forEach((n) => errors.push(`skills/${n}/SKILL.md: not in tblock-help's map, so help can't point anyone to it`));
  }

  const setupFile = join(root, 'skills/setup-tblock/SKILL.md');
  const setup = read(setupFile);
  const roles = setup ? [...(setup.split(/^## /m).find((s) => s.startsWith('Roles')) || '').matchAll(/^\| `([a-z ]+)` \|/gm)].map((m) => m[1]) : [];
  if (setup) {
    const users = [...walk(join(root, 'skills')).filter((f) => f.endsWith('.md')), ...list(join(root, 'agents'), (f) => f.endsWith('.md'))]
      .filter((f) => resolve(f) !== resolve(setupFile)).map((f) => readFileSync(f, 'utf8'));
    roles.filter((r) => !users.some((t) => t.includes(`\`${r}\``)))
      .forEach((r) => errors.push(`skills/setup-tblock/SKILL.md: role \`${r}\` is configured but no skill or agent uses it`));
  }

  const agentNames = (dir, ext) => list(join(root, dir), (f) => f.endsWith(ext)).map((f) => basename(f, ext));
  for (const name of [...new Set([...agentNames('agents', '.md'), ...agentNames('com.github.copilot/agents', '.agent.md')])].sort()) {
    const claude = read(join(root, 'agents', `${name}.md`));
    const copilot = read(join(root, 'com.github.copilot/agents', `${name}.agent.md`));
    if (!claude || !copilot) { errors.push(`agent ${name}: needs both agents/${name}.md (Claude Code) and com.github.copilot/agents/${name}.agent.md (Copilot)`); continue; }
    const a = parseFrontmatter(claude);
    const b = parseFrontmatter(copilot);
    if (!a || !b) errors.push(`agent ${name}: missing YAML frontmatter`);
    else if (a.body !== b.body || a.data.name !== b.data.name || a.data.description !== b.data.description) {
      errors.push(`agent ${name}: Claude Code and Copilot copies differ in name, description, or body`);
    }
  }

  if (existsSync(join(root, 'skills/tblock-mode/delegate.md'))) {
    for (const [path, text] of Object.entries(delegateAgents(root))) {
      if ((read(join(root, path)) || '').replace(/\r\n/g, '\n') !== text) errors.push(`${path}: out of date with skills/tblock-mode/delegate.md (run: node scripts/build-agents.mjs)`);
    }
  }

  // A playbook has no frontmatter, so a link from tblock-mode is the only thing that routes to it.
  const readme = read(join(root, 'README.md'));
  for (const file of list(join(root, 'skills/tblock-mode/playbooks'), (f) => f.endsWith('.md'))) {
    const link = `playbooks/${basename(file)}`;
    if (mode && !mode.includes(`](${link})`)) errors.push(`${rel(file)}: not linked from tblock-mode, so nothing routes to it`);
    if (readme && !readme.includes(`tblock-mode/${link})`)) errors.push(`${rel(file)}: not in the README's playbook table`);
  }

  const hooksFile = join(root, 'hooks/hooks.json');
  if (existsSync(hooksFile)) {
    try {
      const commands = Object.values(JSON.parse(readFileSync(hooksFile, 'utf8')).hooks || {}).flat().flatMap((h) => h.hooks || []).map((h) => h.command || '');
      for (const [, script] of commands.join('\n').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g)) {
        if (!existsSync(join(root, script))) errors.push(`hooks/hooks.json: runs ${script}, which does not exist`);
      }
    } catch (e) { errors.push(`hooks/hooks.json: ${e.message}`); }
  }

  const presets = read(join(root, 'presets.json'));
  if (presets && setup) {
    const data = JSON.parse(presets);
    const tiers = [...(data.tiers || []), 'session'];
    for (const [preset, spec] of Object.entries(data.presets || {})) {
      const missing = roles.filter((r) => !(r in spec));
      const unknown = Object.keys(spec).filter((r) => !roles.includes(r));
      if (missing.length) errors.push(`presets.json: ${preset} misses ${missing.join(', ')}`);
      if (unknown.length) errors.push(`presets.json: ${preset} has unknown roles ${unknown.join(', ')}`);
      for (const [role, want] of Object.entries(spec)) {
        if (!data.efforts.includes(want.effort)) errors.push(`presets.json: ${preset}.${role} effort ${want.effort} is not a known effort`);
        if (!tiers.includes(want.tier)) errors.push(`presets.json: ${preset}.${role} tier ${want.tier} is not a known tier`);
        if (want.tier !== 'session' && !want.panel && !data.families.includes(want.family)) errors.push(`presets.json: ${preset}.${role} needs a family from ${data.families.join(', ')}`);
      }
    }
  }

  const manifests = {};
  for (const file of [join(root, 'plugin.json'), ...list(join(root, '.claude-plugin'), (f) => f.endsWith('.json') && f !== 'marketplace.json')]) {
    if (!existsSync(file)) continue;
    try { manifests[rel(file)] = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { errors.push(`${rel(file)}: ${e.message}`); }
  }
  const reference = manifests['.claude-plugin/plugin.json'];
  if (reference) {
    for (const [file, data] of Object.entries(manifests)) {
      if (file === '.claude-plugin/plugin.json') continue;
      for (const key of ['name', 'version', 'description']) if (data[key] !== reference[key]) errors.push(`${file}: ${key} differs from .claude-plugin/plugin.json`);
    }
    const market = read(join(root, '.claude-plugin/marketplace.json'));
    if (market) {
      const entry = (JSON.parse(market).plugins || []).find((p) => p.name === reference.name);
      if (!entry) errors.push(`marketplace.json: no entry for ${reference.name}`);
      else if (entry.version !== reference.version) errors.push(`marketplace.json: ${reference.name} version ${entry.version} differs from ${reference.version}`);
    }
  }

  return { errors, skills, summary: `Validated ${skills.length} skills, ${documents.length} Markdown files, and ${links} local links; principles are routed and manifests agree.` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const { errors, summary } = validate(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(summary);
}
