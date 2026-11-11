import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, validate } from './validate-skills.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-validate-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) });
  return dir;
}
const edit = (file, from, to) => writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));

test('the plugin as committed passes', () => {
  const { errors } = validate(ROOT);
  assert.deepEqual(errors, []);
});

test('each kind of drift is reported against the file that drifted', () => {
  const dir = copy();
  edit(join(dir, 'skills/how/SKILL.md'), /^name: how$/m, 'name: how-it-works');
  edit(join(dir, 'skills/why/SKILL.md'), /$/, '\n[gone](missing.md)\n');
  edit(join(dir, 'plugin.json'), /"version": "[^"]+"/, '"version": "0.0.0"');
  edit(join(dir, 'agents/delegate.md'), /$/, '\nextra line\n');
  writeFileSync(join(dir, 'skills/tblock-mode/playbooks/orphan.md'), '### Orphan\n');
  const { errors } = validate(dir);
  assert.ok(errors.includes('skills/how/SKILL.md: name must match directory'), errors.join('\n'));
  assert.ok(errors.some((e) => /^skills\/why\/SKILL\.md:\d+: missing link target missing\.md$/.test(e)));
  assert.ok(errors.includes('plugin.json: version differs from .claude-plugin/plugin.json'));
  assert.ok(errors.includes('agent delegate: Claude Code and Copilot copies differ in name, description, or body'));
  assert.ok(errors.includes('agents/delegate.md: out of date with skills/tblock-mode/delegate.md (run: node scripts/build-agents.mjs)'));
  assert.ok(errors.includes('skills/tblock-mode/playbooks/orphan.md: not linked from tblock-mode, so nothing routes to it'));
});

test('frontmatter scalars parse the way YAML reads them', () => {
  const { data } = parseFrontmatter('---\nname: x\ndescription: "Say \\"hi\\": now"\nquoted: \'it\'\'s\'\ndisable-model-invocation: true\nmetadata:\n  author: someone\n---\nbody');
  assert.deepEqual(data, { name: 'x', description: 'Say "hi": now', quoted: "it's", 'disable-model-invocation': true, metadata: null });
});
