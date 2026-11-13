#!/usr/bin/env node
// Counts the exact input tokens of each file by asking the model twice: once with a fixed prompt, once with the
// file appended, and taking the difference in reported input tokens. Needs the Claude Code CLI, signed in.
// Usage: node evals/count-tokens.mjs --model sonnet [--out sizes.json] <file ...>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const take = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? argv.splice(i, 2)[1] : fallback; };
const model = take('--model', 'sonnet');
const out = take('--out', null);
const jobs = Number(take('-j', 6));
const PROMPT = 'Reply with the single word ok.\n';

function ask(text) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', model, '--system-prompt', 'x', '--tools', '', '--disable-slash-commands',
      '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', () => {
      try {
        const r = JSON.parse(stdout);
        const u = r.usage;
        resolve({ tokens: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens, cost: r.total_cost_usd || 0 });
      } catch { reject(new Error(`no usage in reply: ${stdout.slice(0, 200)}`)); }
    });
    child.stdin.end(PROMPT + text);
  });
}

const known = out && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { model, files: {} };
const todo = argv.filter((f) => !(f in known.files));
const base = await ask('');
let cost = base.cost;
let next = 0;
async function worker() {
  while (next < todo.length) {
    const file = todo[next++];
    const text = readFileSync(file, 'utf8');
    try {
      const r = await ask(text);
      cost += r.cost;
      known.files[file] = { bytes: Buffer.byteLength(text), tokens: r.tokens - base.tokens };
      if (out) writeFileSync(out, JSON.stringify(known, null, 1));
    } catch (e) { console.error(`${file}: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
for (const f of argv) if (known.files[f]) console.log(`${String(known.files[f].tokens).padStart(7)} tokens ${String(known.files[f].bytes).padStart(7)} bytes  ${f}`);
console.error(`counted ${todo.length} file(s) on ${model}, about $${cost.toFixed(3)}`);
