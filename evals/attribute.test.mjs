import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alwaysOnSizes, attributeSession, attributeTranscript, bucketOfPath } from './attribute.mjs';

const prices = { 'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 } };
const usage = (write, read, output, thinking = 0) => ({ input_tokens: 2, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: output, output_tokens_details: { thinking_tokens: thinking }, cache_creation: { ephemeral_1h_input_tokens: write } });
const listPrice = (u) => (u.input_tokens * 2 + u.cache_creation_input_tokens * 4 + u.cache_read_input_tokens * 0.1 + u.output_tokens * 10) / 1e6;

let clock = Date.parse('2026-01-01T00:00:00Z');
const at = (seconds) => new Date((clock += seconds * 1000)).toISOString();
const user = (content, extra = {}) => ({ type: 'user', timestamp: at(1), message: { role: 'user', content }, ...extra });
const assistant = (id, u, content, seconds = 5) => ({ type: 'assistant', timestamp: at(seconds), message: { id, model: 'claude-sonnet-5-5', usage: u, content } });
const result = (id, text) => user([{ type: 'tool_result', tool_use_id: id, content: text }]);
const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n');

const usages = [usage(20000, 0, 100), usage(900, 20000, 60), usage(400, 20900, 300, 40)];
const session = () => lines([
  user('/tblock:tblock-mode fix the slug'),
  user([{ type: 'text', text: `Base directory for this skill: /plugins/tblock/skills/tblock-mode\n\n${'rule '.repeat(2000)}` }], { isMeta: true }),
  assistant('m1', usages[0], [{ type: 'text', text: 'Size: standard. Goal: fix the slug.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/plugins/tblock/skills/principle-fix-root-causes/SKILL.md' } }]),
  result('t1', 'principle text '.repeat(150)),
  assistant('m2', usages[1], [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'node --test' } }]),
  result('t2', 'pass 7'),
  assistant('m3', usages[2], [{ type: 'thinking', thinking: '' }, { type: 'text', text: `${'It works, and here is the evidence. '.repeat(9)}**Bro version.** ${'Fixed it. '.repeat(11)}` }], 10),
]);

test('every dollar of the usage lands in a bucket', () => {
  const run = attributeTranscript(session(), { prices });
  const attributed = run.items.reduce((s, i) => s + i.write + i.read + i.out, 0);
  assert.ok(Math.abs(attributed - usages.reduce((s, u) => s + listPrice(u), 0)) < 1e-9);
});

test('a tblock file is charged to its own bucket, whether loaded as a skill or read', () => {
  const buckets = new Set(attributeTranscript(session(), { prices }).items.map((i) => i.bucket));
  for (const name of ['tblock-mode SKILL.md', 'principle: fix-root-causes', 'tool output: commands', 'final reply', 'final reply: bro version']) assert.ok(buckets.has(name), name);
  assert.equal(bucketOfPath('C:\\x\\skills\\tblock-mode\\playbooks\\bug-fix.md'), 'playbook: bug-fix');
  assert.equal(bucketOfPath('/repo/src/skills/unknown-thing/SKILL.md'), null);
});

test('the bro version is split out of the reply by its share of the text', () => {
  const [reply] = attributeTranscript(session(), { prices }).replies;
  const spoken = 300 - 40;
  assert.ok(Math.abs(reply.tokens + reply.broTokens - spoken) < 1e-6, 'thinking is not counted as reply');
  assert.ok(reply.broTokens > 0.2 * spoken && reply.broTokens < 0.4 * spoken);
  assert.ok(reply.broSeconds > 0);
});

test('a session adds its subagents and reports the cache-hit rate and repeated reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-attribute-'));
  try {
    const file = join(dir, 's.jsonl');
    writeFileSync(file, session());
    mkdirSync(join(dir, 's', 'subagents'), { recursive: true });
    const sub = usage(5000, 0, 50);
    writeFileSync(join(dir, 's', 'subagents', 'agent-a.jsonl'), lines([
      user('Fix the slug. Read the principle first.'),
      assistant('s1', sub, [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/plugins/tblock/skills/principle-fix-root-causes/SKILL.md' } }]),
      result('r1', 'principle text '.repeat(150)),
    ]));
    const a = attributeSession(file, { prices });
    assert.equal(a.subagents, 1);
    assert.ok(Math.abs(a.cost - [...usages, sub].reduce((s, u) => s + listPrice(u), 0)) < 1e-9);
    assert.ok(Math.abs(a.cacheHitRate - 40900 / (40900 + 26300 + 8)) < 1e-9);
    assert.equal(a.repeats.acrossAgents, 1, 'the subagent re-read a file its parent had read');
    assert.ok(a.rows.some((r) => r.bucket === 'subagent > subagent brief'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a model with no price is flagged, never counted as free', () => {
  assert.equal(attributeTranscript(session(), { prices: {} }).unpriced, true);
});

test('the always-on size counts skills the model may invoke and agents, never hidden skills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alwayson-'));
  try {
    const skill = (name, fm) => { mkdirSync(join(dir, 'skills', name), { recursive: true }); writeFileSync(join(dir, 'skills', name, 'SKILL.md'), `---\n${fm}\n---\nbody\n`); };
    skill('listed', 'name: listed\ndescription: Do a thing. Use when asked.');
    skill('hidden', 'name: hidden\ndescription: A long hidden description that must not count.\ndisable-model-invocation: true');
    mkdirSync(join(dir, 'agents'));
    writeFileSync(join(dir, 'agents', 'helper.md'), '---\nname: helper\ndescription: Helps.\n---\nbody\n');
    const sizes = alwaysOnSizes(dir);
    assert.equal(sizes.alwaysOnChars, 'listed: Do a thing. Use when asked.\nhelper: Helps.'.length);
    assert.equal(sizes.alwaysOn, Math.round(sizes.alwaysOnChars / 3.3));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
