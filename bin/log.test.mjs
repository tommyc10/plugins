// Runs `tblock log` against throwaway Claude Code and Copilot homes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchSessionEvents, writeWatchSession } from './fixtures/watch-session.mjs';
import { parseSince } from './log.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'tblock.mjs');
const NOW = Date.now();
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();

const assistant = (id, model, usage, content, at, extra = {}) => ({ type: 'assistant', timestamp: at, cwd: 'C:\\work\\shop', gitBranch: 'fix/cart', message: { id, model, usage, content }, ...extra });

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'tblock-log-'));
  const project = join(dir, '.claude', 'projects', 'C--work-shop');
  mkdirSync(join(project, 'sess-1', 'subagents'), { recursive: true });
  const opus = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 1000000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100000 } };
  const main = [
    { type: 'user', timestamp: iso(30), cwd: 'C:\\work\\shop', gitBranch: 'fix/cart', message: { role: 'user', content: '<command-name>/tblock:tblock-mode</command-name><command-args>fix the cart total rounding</command-args>' } },
    assistant('m1', 'claude-opus-5-5', opus, [{ type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\work\\shop\\cart.ts' } }], iso(29)),
    assistant('m1', 'claude-opus-5-5', opus, [{ type: 'text', text: 'Opened https://gitlab.example.com/shop/web/-/merge_requests/42 for review.' }], iso(29)),
    assistant('m2', 'claude-opus-5-5', { input_tokens: 0, output_tokens: 0 }, [{ type: 'text', text: '**Goal.** Fix the cart rounding. The total now rounds once.\n\nWant me to open the MR?' }], iso(2)),
    { type: 'custom-title', customTitle: 'cart rounding', sessionId: 'sess-1' },
  ];
  writeFileSync(join(project, 'sess-1.jsonl'), `${main.map((e) => JSON.stringify(e)).join('\n')}\n`);
  const sub = [assistant('s1', 'claude-haiku-5-5', { input_tokens: 1000000, output_tokens: 0 }, [{ type: 'text', text: 'found it' }], iso(28), { isSidechain: true })];
  writeFileSync(join(project, 'sess-1', 'subagents', 'agent-a.jsonl'), `${sub.map((e) => JSON.stringify(e)).join('\n')}\n`);
  writeFileSync(join(project, 'sess-1', 'subagents', 'agent-a.meta.json'), JSON.stringify({ agentType: 'Explore', model: 'haiku' }));

  const old = join(project, 'sess-old.jsonl');
  writeFileSync(old, `${JSON.stringify(assistant('o1', 'claude-opus-5-5', { input_tokens: 5, output_tokens: 5 }, [], new Date(NOW - 9 * 864e5).toISOString()))}\n`);
  utimesSync(old, new Date(NOW - 9 * 864e5), new Date(NOW - 9 * 864e5));

  const copilot = join(dir, '.copilot');
  const lines = watchSessionEvents({ start: NOW - 20 * 60000 });
  lines.splice(3, 0, JSON.stringify({ type: 'session.usage_record', timestamp: iso(19), data: { usage: { model: 'gpt-6-luna', inputTokens: 3000, outputTokens: 100, cacheReadTokens: 2000, cacheWriteTokens: 500 } } }));
  writeWatchSession(copilot, { lines });
  return dir;
}

const runLog = (dir, ...flags) => {
  const env = { ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: join(dir, '.claude'), COPILOT_HOME: join(dir, '.copilot'), NO_COLOR: '1' };
  const r = spawnSync(process.execPath, [CLI, 'log', ...flags], { env, cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

test('each session since the cutoff appears once, with its task, reply, MR, files, and subagents', () => {
  const { runs, totals } = JSON.parse(runLog(home(), '--json', '--since=3d'));
  assert.deepEqual(runs.map((r) => r.harness).sort(), ['claude-code', 'copilot'], 'the nine-day-old session is left out');
  const claude = runs.find((r) => r.harness === 'claude-code');
  assert.equal(claude.title, 'cart rounding');
  assert.equal(claude.prompt, 'fix the cart total rounding');
  assert.deepEqual(claude.links, ['https://gitlab.example.com/shop/web/-/merge_requests/42']);
  assert.deepEqual(claude.files, ['C:\\work\\shop\\cart.ts']);
  assert.deepEqual(claude.agents.map((a) => [a.name, a.model]), [['Explore', 'claude-haiku-5-5']]);
  assert.equal(claude.waiting, true, 'a reply that ends in a question is waiting on the user');
  assert.equal(claude.live, true);
  assert.equal(totals.sessions, 2);
});

test('cost counts each message once and adds the subagents', () => {
  const { runs } = JSON.parse(runLog(home(), '--json', '--since=3d'));
  const claude = runs.find((r) => r.harness === 'claude-code');
  const opus = (1000 * 4 + 1000 * 20 + 1e6 * 0.2 + 1e5 * 8) / 1e6;
  const haiku = (1e6 * 0.1) / 1e6;
  assert.equal(claude.cost.toFixed(4), (opus + haiku).toFixed(4));
  const copilot = runs.find((r) => r.harness === 'copilot');
  assert.equal(copilot.cost, null, 'a model with no price is never shown as free');
  assert.equal(copilot.premium, 3);
  assert.deepEqual(copilot.usage['gpt-6-luna'], { input: 500, output: 100, cacheRead: 2000, cacheWrite5m: 500, cacheWrite1h: 0 });
});

test('the text view leads with the day and ends with totals by model', () => {
  const out = runLog(home(), '--since=3d');
  assert.match(out, /task {2}cart rounding/);
  assert.match(out, /last {2}Fix the cart rounding\. +\? waiting on you/);
  assert.match(out, /MR {4}https:\/\/gitlab\.example\.com\/shop\/web\/-\/merge_requests\/42/);
  assert.match(out, /2 sessions \(1 live\) {2}· {2}\$1\.12 at list price {2}· {2}3 Copilot premium requests/);
  assert.match(out, /gpt-6-luna +3\.1k tokens +no price/);
});

test('--here keeps only sessions started in the current folder', () => {
  const { runs } = JSON.parse(runLog(home(), '--json', '--since=3d', '--here'));
  assert.deepEqual(runs, []);
});

test('--since reads weekdays as the most recent past one', () => {
  const saturday = new Date(2026, 10, 7, 9, 0);
  assert.equal(parseSince('monday', saturday).toDateString(), new Date(2026, 10, 2).toDateString());
  assert.equal(parseSince('saturday', saturday).toDateString(), new Date(2026, 9, 31).toDateString());
  assert.equal(parseSince('yesterday', saturday).toDateString(), new Date(2026, 10, 6).toDateString());
  assert.throws(() => parseSince('soon'), /--since takes/);
});
