#!/usr/bin/env node
// Attributes a Claude Code session's tokens, dollars and seconds to what caused them: tblock-mode, each playbook,
// principle and routed skill, tool output, subagents, and the reply. Reads the raw transcript and its subagents.
// Usage: node evals/attribute.mjs <session.jsonl ...> [--json] [--sizes sizes.json]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPrices, normalizeModel } from '../bin/usage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TBLOCK_SKILLS = new Set(existsSync(join(root, 'skills')) ? readdirSync(join(root, 'skills')) : []);
const READ_ONLY = new Set(['Read', 'Grep', 'Glob']);
const CHARS_PER_TOKEN = 3.3;

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_result' ? textOf(b.content) : '')).join('\n') : '');
const contextOf = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

// Which tblock file a path names, as the bucket it is charged to.
export function bucketOfPath(path) {
  const p = String(path || '').replaceAll('\\', '/');
  const m = p.match(/\/skills\/([a-z0-9-]+)\/(.+)$/);
  if (!m) return /\.tblock\/roles\.md$/.test(p) ? 'tblock: roles file' : null;
  const [, skill, rest] = m;
  if (!TBLOCK_SKILLS.has(skill)) return null;
  if (skill === 'tblock-mode') {
    if (rest === 'SKILL.md') return 'tblock-mode SKILL.md';
    const playbook = rest.match(/^playbooks\/(.+)\.md$/);
    return playbook ? `playbook: ${playbook[1]}` : `tblock-mode: ${rest}`;
  }
  if (skill.startsWith('principle-')) return `principle: ${skill.slice('principle-'.length)}`;
  return rest === 'SKILL.md' ? `skill: ${skill}` : `skill: ${skill} (${rest.split('/')[0]})`;
}

const toolBucket = (name) => (name === 'Read' ? 'tool output: file reads' : name === 'Bash' ? 'tool output: commands'
  : name === 'Grep' || name === 'Glob' ? 'tool output: search' : name === 'Agent' || name === 'Task' ? 'subagent reports' : 'tool output: other');

function priceFor(model, prices) {
  const p = prices[normalizeModel(model)];
  return p ? { ...p, known: true } : { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, known: false };
}

// One agent's transcript: the main session or one subagent.
export function attributeTranscript(text, { prices = {}, sizes = {}, prefix = '' } = {}) {
  const records = text.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  const items = [];
  const requests = [];
  const tools = new Map();
  const reads = [];
  let idleMs = 0;
  let pending = [];
  let current = null;
  let previousAt = null;
  let costState = null;
  let userTurns = 0;
  const seen = new Map();

  const item = (bucket, chars, extra = {}) => ({ bucket: prefix + bucket, chars, tokens: 0, write: 0, read: 0, out: 0, ...extra });

  const open = (r) => {
    const u = r.message.usage;
    const price = priceFor(r.message.model, prices);
    const ctx = contextOf(u);
    const fresh = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens || 0;
    const w5m = (u.cache_creation_input_tokens || 0) - w1h;
    const freshCost = ((u.input_tokens || 0) * price.input + w5m * price.cacheWrite5m + w1h * price.cacheWrite1h) / 1e6;
    const freshPrice = fresh ? freshCost / fresh : 0;
    const prior = requests.at(-1);
    const carried = prior ? prior.blocks : [];
    for (const b of carried) b.tokens = b.outTokens;
    const carriedTokens = carried.reduce((s, b) => s + b.tokens, 0);
    const oldTokens = items.reduce((s, i) => s + i.tokens, 0);
    const chars = pending.reduce((s, i) => s + i.chars, 0);
    let room = ctx - oldTokens - carriedTokens;
    const compacted = prior && ctx < prior.ctx * 0.7 && prior.ctx > 20000;
    if (compacted) {
      items.length = 0;
      room = ctx;
    }
    if (!prior) {
      // The first request also carries the system prompt, the tools and the listings, which the transcript does not itemise.
      for (const i of pending) i.tokens = Math.round(i.exact ?? i.chars / CHARS_PER_TOKEN);
      const named = pending.reduce((s, i) => s + i.tokens, 0);
      const alwaysOn = Math.min(sizes.alwaysOn || 0, Math.max(0, ctx - named));
      if (alwaysOn && !prefix) pending.push(item('tblock always-on (skill and agent descriptions)', 0, { tokens: alwaysOn }));
      const listed = pending.reduce((s, i) => s + i.tokens, 0);
      pending.push(item(prefix ? 'subagent base (system prompt, tools)' : 'harness base (system prompt, tools, other listings)', 0, { tokens: Math.max(0, ctx - listed) }));
    } else if (compacted) {
      for (const i of pending) i.tokens = Math.round(i.chars / CHARS_PER_TOKEN);
      pending.push(item('compaction summary', 0, { tokens: Math.max(0, ctx - pending.reduce((s, i) => s + i.tokens, 0)) }));
    } else {
      room = Math.max(0, room);
      for (const i of pending) i.tokens = chars ? Math.round((room * i.chars) / chars) : 0;
      if (!chars && room > 0) pending.push(item('harness reminders', 0, { tokens: room }));
    }
    const entering = compacted ? pending : [...carried, ...pending];
    const enteringTokens = entering.reduce((s, i) => s + i.tokens, 0);
    const older = items.slice();
    const olderTokens = older.reduce((s, i) => s + i.tokens, 0);
    // New content is paid at the fresh rate. Fresh tokens beyond the new content are a rewrite of older context.
    const freshToNew = Math.min(fresh, enteringTokens);
    const rewrite = fresh - freshToNew;
    for (const i of entering) {
      const share = enteringTokens ? i.tokens / enteringTokens : 0;
      i.write += share * freshToNew * freshPrice;
      i.read += (share * (enteringTokens - freshToNew) * price.cacheRead) / 1e6;
    }
    const readOld = Math.max(0, (u.cache_read_input_tokens || 0) - (enteringTokens - freshToNew));
    for (const i of older) {
      const share = olderTokens ? i.tokens / olderTokens : 0;
      i.write += share * rewrite * freshPrice;
      i.read += (share * readOld * price.cacheRead) / 1e6;
    }
    items.push(...entering);
    const at = r.timestamp ? Date.parse(r.timestamp) : null;
    current = { id: r.message.id, model: r.message.model, priced: price.known, usage: u, ctx, fresh, rewrite: prior && !compacted ? rewrite : 0, compacted, at, since: previousAt, blocks: [], price, tools: [] };
    requests.push(current);
    pending = [];
  };

  const close = (req) => {
    if (!req || req.closed) return;
    req.closed = true;
    const u = req.usage;
    const thinking = u.output_tokens_details?.thinking_tokens || 0;
    const rest = Math.max(0, (u.output_tokens || 0) - thinking);
    const spoken = req.blocks.filter((b) => b.kind !== 'thinking');
    const chars = spoken.reduce((s, b) => s + b.chars, 0);
    for (const b of req.blocks) {
      b.outTokens = b.kind === 'thinking' ? thinking / Math.max(1, req.blocks.filter((x) => x.kind === 'thinking').length) : chars ? (rest * b.chars) / chars : 0;
      b.out += (b.outTokens * req.price.output) / 1e6;
    }
    if (!req.blocks.some((b) => b.kind === 'thinking') && thinking) req.blocks.push(item('assistant: thinking', 0, { kind: 'thinking', outTokens: thinking, out: (thinking * req.price.output) / 1e6 }));
  };

  for (const r of records) {
    const at = r.timestamp ? Date.parse(r.timestamp) : null;
    if (r.type === 'cost-state') costState = r;
    if (r.type === 'attachment' && r.attachment && !['prompt_snapshot'].includes(r.attachment.type) && requests.length) {
      const body = r.attachment.content ?? r.attachment.text ?? '';
      if (typeof body === 'string' && body.length) pending.push(item('harness reminders', body.length));
    }
    if (r.type === 'user' && r.message) {
      const content = r.message.content;
      const results = Array.isArray(content) ? content.filter((b) => b.type === 'tool_result') : [];
      if (results.length) {
        for (const b of results) {
          const call = tools.get(b.tool_use_id);
          const body = textOf(b.content);
          const fromPath = call?.name === 'Read' ? bucketOfPath(call.input.file_path) : null;
          pending.push(item(fromPath || toolBucket(call?.name), body.length + 40));
          if (call) {
            call.ended = at;
            if (call.name === 'Read') reads.push({ path: String(call.input.file_path || ''), chars: body.length, partial: Boolean(call.input.limit || call.input.offset) });
          }
        }
      } else {
        const body = textOf(content);
        if (r.isMeta) {
          const skillDir = body.match(/^Base directory for this skill: (.+)$/m)?.[1];
          const bucket = skillDir ? bucketOfPath(`${skillDir}/SKILL.md`) || `other skill: ${skillDir.split('/').pop()}` : 'harness reminders';
          const exact = bucket === 'tblock-mode SKILL.md' && sizes.tblockModeCharsPerToken ? body.length / sizes.tblockModeCharsPerToken : undefined;
          pending.push(item(bucket, body.length, { exact }));
        } else {
          pending.push(item(prefix && !requests.length ? 'subagent brief' : 'user prompts', body.length));
          userTurns += 1;
          if (requests.length && at && requests.at(-1).ended) idleMs += Math.max(0, at - requests.at(-1).ended);
        }
      }
      if (at) previousAt = at;
    }
    if (r.type === 'assistant' && r.message?.usage && r.message.model !== '<synthetic>') {
      const id = r.message.id;
      if (!seen.has(id)) {
        close(current);
        open(r);
        seen.set(id, current);
      }
      const req = seen.get(id);
      req.usage = r.message.usage;
      req.ended = at;
      for (const b of r.message.content || []) {
        if (b.type === 'thinking') req.blocks.push(item('assistant: thinking', 0, { kind: 'thinking' }));
        if (b.type === 'text' && b.text?.trim()) req.blocks.push(item('assistant: text', b.text.length, { kind: 'text', text: b.text }));
        if (b.type === 'tool_use') {
          const spawn = b.name === 'Agent' || b.name === 'Task';
          const size = JSON.stringify(b.input || {}).length;
          req.blocks.push(item(spawn ? 'subagent briefs' : 'assistant: tool calls', size + 30, { kind: 'tool' }));
          const call = { id: b.id, name: b.name, input: b.input || {}, started: at, request: req };
          tools.set(b.id, call);
          req.tools.push(call);
        }
      }
      if (at) previousAt = at;
    }
  }
  close(current);

  // The last text of each turn is the reply the user reads; the rest is interim narration.
  const replies = [];
  let turnOver = true;
  for (let i = requests.length - 1; i >= 0; i -= 1) {
    const req = requests[i];
    const texts = req.blocks.filter((b) => b.kind === 'text');
    const endsTurn = !req.tools.length;
    if (endsTurn) turnOver = true;
    if (turnOver && texts.length && endsTurn) {
      const block = texts.at(-1);
      const cut = block.text.search(/\*\*Bro version\.?\*\*/i);
      block.bucket = `${prefix}final reply`;
      const reply = { tokens: block.outTokens, chars: block.chars, broTokens: 0, seconds: null, request: req };
      if (cut >= 0) {
        const share = (block.chars - cut) / block.chars;
        const bro = item('final reply: bro version', block.chars - cut, { kind: 'text', outTokens: block.outTokens * share, out: block.out * share, tokens: block.tokens * share, write: block.write * share, read: block.read * share });
        for (const k of ['outTokens', 'out', 'tokens', 'write', 'read']) block[k] -= bro[k];
        if (items.includes(block)) items.splice(items.indexOf(block) + 1, 0, bro);
        else req.blocks.push(bro);
        reply.broTokens = bro.outTokens;
        reply.tokens = block.outTokens;
      }
      replies.push(reply);
      turnOver = false;
    }
  }
  const lastBlocks = requests.at(-1)?.blocks || [];
  for (const b of lastBlocks) if (!items.includes(b)) items.push(b);

  // Wall clock: a request's model time runs from the record before it to its last block; a tool runs from its call to its result.
  let modelMs = 0;
  const toolMs = new Map();
  let serialReads = 0;
  let serialReadMs = 0;
  requests.forEach((req, i) => {
    const wait = req.since && req.ended ? req.ended - req.since : 0;
    req.modelMs = Math.max(0, wait);
    modelMs += req.modelMs;
    const only = req.tools.length === 1 && READ_ONLY.has(req.tools[0].name);
    const prev = requests[i - 1];
    if (only && prev && prev.tools.length === 1 && READ_ONLY.has(prev.tools[0].name)) { serialReads += 1; serialReadMs += req.modelMs; }
    const spans = req.tools.filter((t) => t.started && t.ended).map((t) => [t.name, t.ended - t.started]);
    const byName = new Map();
    for (const [name, ms] of spans) byName.set(name, Math.max(byName.get(name) || 0, ms));
    for (const [name, ms] of byName) toolMs.set(name, (toolMs.get(name) || 0) + ms);
    if (req.modelMs) req.outRate = (req.usage.output_tokens || 0) / (req.modelMs / 1000);
  });
  for (const reply of replies) {
    const rate = reply.request.outRate;
    reply.seconds = rate ? reply.tokens / rate : null;
    reply.broSeconds = rate ? reply.broTokens / rate : null;
  }

  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const req of requests) {
    usage.input += req.usage.input_tokens || 0;
    usage.cacheWrite += req.usage.cache_creation_input_tokens || 0;
    usage.cacheRead += req.usage.cache_read_input_tokens || 0;
    usage.output += req.usage.output_tokens || 0;
  }
  const misses = requests.filter((req, i) => i > 0 && !req.compacted && req.rewrite > 2000).map((req) => ({ rewrite: Math.round(req.rewrite), gapMinutes: req.since ? Math.round((req.at - req.since) / 6000) / 10 : null, ctx: req.ctx }));
  const first = requests[0]?.at ?? null;
  const last = requests.at(-1)?.ended ?? null;
  return {
    items, requests: requests.length, userTurns, usage, models: [...new Set(requests.map((r) => r.model))], unpriced: requests.some((r) => !r.priced),
    compactions: requests.filter((r) => r.compacted).length, misses, replies: replies.reverse().map(({ request, ...rest }) => rest),
    time: { wallMs: first && last ? last - first : 0, modelMs, toolMs: Object.fromEntries(toolMs), idleMs, serialReads, serialReadMs },
    agentCalls: [...tools.values()].filter((t) => t.name === 'Agent' || t.name === 'Task').map((t) => ({ started: t.started, ended: t.ended, request: t.request.id, description: t.input.description })),
    reads, costState: costState?.totalCostUSD ?? null, peakContext: Math.max(0, ...requests.map((r) => r.ctx)),
  };
}

export function attributeSession(file, options = {}) {
  const main = attributeTranscript(readFileSync(file, 'utf8'), options);
  const subDir = join(file.replace(/\.jsonl$/, ''), 'subagents');
  const subs = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith('.jsonl')).map((f) => attributeTranscript(readFileSync(join(subDir, f), 'utf8'), { ...options, prefix: 'subagent > ' })) : [];
  const buckets = new Map();
  for (const run of [main, ...subs]) {
    for (const i of run.items) {
      const b = buckets.get(i.bucket) || { bucket: i.bucket, tokens: 0, outTokens: 0, write: 0, read: 0, out: 0 };
      b.tokens += i.kind ? 0 : i.tokens;
      b.outTokens += i.outTokens || 0;
      b.write += i.write; b.read += i.read; b.out += i.out;
      buckets.set(i.bucket, b);
    }
  }
  const rows = [...buckets.values()].map((b) => ({ ...b, cost: b.write + b.read + b.out })).sort((a, b) => b.cost - a.cost);
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const run of [main, ...subs]) for (const k of Object.keys(usage)) usage[k] += run.usage[k];
  const input = usage.input + usage.cacheWrite + usage.cacheRead;
  const mainReads = new Set(main.reads.map((r) => r.path));
  const repeatedAcross = subs.flatMap((s) => s.reads.filter((r) => mainReads.has(r.path)));
  const again = (run) => run.reads.length - new Set(run.reads.map((r) => r.path)).size;
  // Agents called in one assistant message run side by side; the wait is the longest of them.
  const groups = new Map();
  for (const c of main.agentCalls) { if (!groups.has(c.request)) groups.set(c.request, []); groups.get(c.request).push(c); }
  const waits = [...groups.values()].map((g) => ({ agents: g.length, waitMs: Math.max(...g.map((c) => (c.ended || c.started) - c.started)), sumMs: g.reduce((s, c) => s + ((c.ended || c.started) - c.started), 0) }));
  return {
    file, rows, usage, cost: rows.reduce((s, r) => s + r.cost, 0), costState: main.costState, models: [...new Set([main, ...subs].flatMap((r) => r.models))], unpriced: main.unpriced || subs.some((s) => s.unpriced),
    cacheHitRate: input ? usage.cacheRead / input : null, requests: main.requests, subagents: subs.length, subagentRequests: subs.reduce((s, r) => s + r.requests, 0),
    userTurns: main.userTurns, compactions: main.compactions, misses: [...main.misses, ...subs.flatMap((s) => s.misses.map((m) => ({ ...m, subagent: true })))],
    replies: main.replies, peakContext: main.peakContext,
    time: { ...main.time, subagentWaitMs: waits.reduce((s, w) => s + w.waitMs, 0), subagentSerialMs: waits.filter((w) => w.agents === 1).reduce((s, w) => s + w.waitMs, 0), agentGroups: waits },
    repeats: { sameAgent: again(main) + subs.reduce((s, r) => s + again(r), 0), acrossAgents: repeatedAcross.length, acrossAgentsChars: repeatedAcross.reduce((s, r) => s + r.chars, 0) },
  };
}

const usd = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const secs = (ms) => `${Math.round(ms / 1000)}s`;

export function report(a, { top = 25 } = {}) {
  const lines = [`\n${a.file}`, `models ${a.models.join(', ')}${a.unpriced ? ' (some unpriced, cost understated)' : ''}. ${a.requests} main requests, ${a.subagents} subagents (${a.subagentRequests} requests), ${a.userTurns} user turns, ${a.compactions} compactions, peak context ${a.peakContext}.`,
    `tokens: input ${a.usage.input}, cache write ${a.usage.cacheWrite}, cache read ${a.usage.cacheRead}, output ${a.usage.output}. cache-hit rate ${(a.cacheHitRate * 100).toFixed(1)}%.`,
    `cost attributed ${usd(a.cost)}${a.costState != null ? `, Claude Code recorded ${usd(a.costState)}` : ''}.`, '',
    `${'BUCKET'.padEnd(58)} ${'TOKENS'.padStart(8)} ${'WRITE'.padStart(9)} ${'READ'.padStart(9)} ${'OUTPUT'.padStart(9)} ${'TOTAL'.padStart(9)}  SHARE`];
  for (const r of a.rows.slice(0, top)) lines.push(`${r.bucket.slice(0, 58).padEnd(58)} ${String(Math.round(r.tokens || r.outTokens)).padStart(8)} ${usd(r.write).padStart(9)} ${usd(r.read).padStart(9)} ${usd(r.out).padStart(9)} ${usd(r.cost).padStart(9)}  ${((r.cost / a.cost) * 100).toFixed(1)}%`);
  const t = a.time;
  const toolTotal = Object.values(t.toolMs).reduce((s, n) => s + n, 0);
  lines.push('', `time: first request to last reply ${secs(t.wallMs)}, of which ${secs(t.idleMs)} waiting on the user. model ${secs(t.modelMs)}, tools ${secs(toolTotal)} (${Object.entries(t.toolMs).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n, ms]) => `${n} ${secs(ms)}`).join(', ')}).`,
    `subagent wait ${secs(t.subagentWaitMs)} in ${t.agentGroups.length} group(s), ${secs(t.subagentSerialMs)} of it in single-agent groups. serial read-only round trips ${t.serialReads} (${secs(t.serialReadMs)} of model time).`,
    `repeated reads: ${a.repeats.sameAgent} of a file the same agent already read, ${a.repeats.acrossAgents} by a subagent of a file the parent read (${a.repeats.acrossAgentsChars} chars).`,
    `cache rewrites over 2k tokens: ${a.misses.length}${a.misses.length ? ` (${a.misses.slice(0, 6).map((m) => `${m.rewrite} tok after ${m.gapMinutes}m${m.subagent ? ' sub' : ''}`).join('; ')})` : ''}.`);
  const bro = a.replies.filter((r) => r.broTokens);
  if (a.replies.length) lines.push(`replies: ${a.replies.length}, median ${Math.round(median(a.replies.map((r) => r.tokens + r.broTokens)))} output tokens. bro version in ${bro.length}, median ${bro.length ? Math.round(median(bro.map((r) => r.broTokens))) : 0} tokens and ${bro.length ? median(bro.map((r) => r.broSeconds || 0)).toFixed(1) : 0}s each.`);
  return lines.join('\n');
}

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const sizesAt = argv.indexOf('--sizes');
  const sizes = sizesAt >= 0 ? JSON.parse(readFileSync(argv[sizesAt + 1], 'utf8')) : {};
  const files = argv.filter((a, i) => !a.startsWith('--') && (sizesAt < 0 || i !== sizesAt + 1));
  const prices = loadPrices(root, homedir());
  const all = files.filter((f) => f.endsWith('.jsonl')).map((f) => attributeSession(f, { prices, sizes }));
  if (json) console.log(JSON.stringify(all));
  else for (const a of all) console.log(report(a));
}
