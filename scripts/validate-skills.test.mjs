import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_POLICY, fixCodexPolicies, parseFrontmatter, validate } from './validate-skills.mjs';

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
  const { errors } = validate(dir);
  assert.ok(errors.includes('skills/how/SKILL.md: name must match directory'), errors.join('\n'));
  assert.ok(errors.some((e) => /^skills\/why\/SKILL\.md:\d+: missing link target missing\.md$/.test(e)));
  assert.ok(errors.includes('plugin.json: version differs from .claude-plugin/plugin.json'));
  assert.ok(errors.includes('agent delegate: Claude Code and Copilot copies differ in name, description, or body'));
});

test('frontmatter scalars parse the way YAML reads them', () => {
  const { data } = parseFrontmatter('---\nname: x\ndescription: "Say \\"hi\\": now"\nquoted: \'it\'\'s\'\ndisable-model-invocation: true\nmetadata:\n  author: someone\n---\nbody');
  assert.deepEqual(data, { name: 'x', description: 'Say "hi": now', quoted: "it's", 'disable-model-invocation': true, metadata: null });
});

test('--fix gives Codex the same hidden flag and keeps what an openai.yaml already says', () => {
  const dir = copy();
  const policy = join(dir, 'skills/how/agents/openai.yaml');
  rmSync(policy);
  const ui = join(dir, 'skills/better-ui/agents/openai.yaml');
  edit(join(dir, 'skills/better-ui/SKILL.md'), /^name: better-ui$/m, 'name: better-ui\ndisable-model-invocation: true');
  assert.ok(validate(dir).errors.some((e) => e.startsWith('skills/how/SKILL.md: Codex ignores disable-model-invocation')));
  assert.equal(fixCodexPolicies(dir), 2);
  assert.deepEqual(validate(dir).errors, []);
  assert.equal(readFileSync(policy, 'utf8'), CODEX_POLICY);
  assert.match(readFileSync(ui, 'utf8'), /display_name: "Better UI"[\s\S]*allow_implicit_invocation: false/);
});
