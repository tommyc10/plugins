// `tblock log`: what every agent session did since a date, and what it cost, for a standup or a handoff.
// Reads Claude Code transcripts and Copilot event logs, including sessions still running. Node built-ins only.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { addModelUsage, addUsage, emptyUsage, priceOf, tokensOf } from './usage.mjs';
import { applyEvent, createReader, createState, listSessions, sessionsDir } from './watch.mjs';

const LIVE_MS = 10 * 60 * 1000;
const LINK = /https?:\/\/[^\s<>"'`)\]\\]+?\/(?:-\/)?(?:merge_requests|pull)\/\d+/g;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// "today", "yesterday", a weekday (its most recent past date), "3d", or an ISO date.
export function parseSince(text = 'yesterday', now = new Date()) {
  const t = String(text).toLowerCase();
  const today = startOfDay(now);
  if (t === 'today') return today;
  if (t === 'yesterday') return new Date(today - 864e5);
  if (DAYS.includes(t)) return new Date(today - (((now.getDay() - DAYS.indexOf(t) + 7) % 7) || 7) * 864e5);
  const days = t.match(/^(\d+)d$/);
  if (days) return new Date(today - Number(days[1]) * 864e5);
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) throw new Error(`--since takes today, yesterday, a weekday, a number of days such as 3d, or a date, not "${text}"`);
  return date;
}

const newRun = (harness, id) => ({
  harness, id, title: null, cwd: null, branch: null, started: null, last: null, live: false,
  prompt: null, prompts: [], reply: null, path: null, links: new Set(), files: new Set(), agents: [], usage: new Map(), premium: 0,
});

const linksIn = (run, text) => { for (const m of String(text).matchAll(LINK)) run.links.add(m[0]); };
const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((b) => (typeof b === 'string' ? b : b.text || textOf(b.content) || '')).join('\n') : '');

function readLines(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

// The task as the user typed it: a slash command's arguments, or the message without tags.
function promptOf(text) {
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  const plain = (args ? args[1] : text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return plain || null;
}

function claudeUsage(u = {}) {
  const split = u.cache_creation;
  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite5m: split ? split.ephemeral_5m_input_tokens || 0 : u.cache_creation_input_tokens || 0,
    cacheWrite1h: split ? split.ephemeral_1h_input_tokens || 0 : 0,
  };
}

// Folds one Claude Code transcript into a run. Message ids repeat across a message's lines, so usage counts once per id.
function foldClaude(run, entries, seen, usage) {
  for (const e of entries) {
    const at = e.timestamp ? Date.parse(e.timestamp) : null;
    if (at) { run.started = Math.min(run.started ?? at, at); run.last = Math.max(run.last ?? at, at); }
    if (e.type === 'custom-title' && e.customTitle) run.title = e.customTitle;
    if (e.type === 'summary' && e.summary && !run.title) run.title = e.summary;
    if (e.cwd && !run.cwd) run.cwd = e.cwd;
    if (e.gitBranch) run.branch = e.gitBranch;
    const m = e.message;
    if (!m) continue;
    if (e.type === 'user') {
      const text = textOf(m.content);
      linksIn(run, text);
      const typed = !e.isSidechain && !e.isMeta && typeof m.content === 'string' ? promptOf(text) : null;
      if (typed && !usage) run.prompts.push({ at, text: typed });
      if (typed && !run.prompt) run.prompt = typed;
    }
    if (e.type === 'assistant' && m.model !== '<synthetic>') {
      if (m.id && m.usage && !seen.has(m.id)) {
        seen.add(m.id);
        addModelUsage(run.usage, m.model, claudeUsage(m.usage));
        if (usage) addUsage(usage, claudeUsage(m.usage));
      }
      for (const block of Array.isArray(m.content) ? m.content : []) {
        if (block.type === 'text' && block.text?.trim()) { linksIn(run, block.text); if (!e.isSidechain && !usage) run.reply = block.text; }
        if (block.type === 'tool_use' && EDIT_TOOLS.has(block.name) && block.input?.file_path) run.files.add(block.input.file_path);
      }
    }
  }
}

export function readClaudeRuns(claudeHome, since) {
  const projects = join(claudeHome, 'projects');
  if (!existsSync(projects)) return [];
  const runs = [];
  for (const project of readdirSync(projects)) {
    const dir = join(projects, project);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const path = join(dir, file);
      if (statSync(path).mtimeMs < since.getTime()) continue;
      const id = basename(file, '.jsonl');
      const run = newRun('claude-code', id);
      run.path = path;
      const seen = new Set();
      foldClaude(run, readLines(path), seen, null);
      const subagents = join(dir, id, 'subagents');
      if (existsSync(subagents)) {
        for (const f of readdirSync(subagents).filter((x) => x.endsWith('.jsonl'))) {
          const metaFile = join(subagents, f.replace(/\.jsonl$/, '.meta.json'));
          const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
          const agent = { name: meta.agentType || 'subagent', model: null, usage: emptyUsage() };
          const entries = readLines(join(subagents, f));
          agent.model = entries.find((e) => e.type === 'assistant' && e.message?.model && e.message.model !== '<synthetic>')?.message.model || meta.model || null;
          foldClaude(run, entries, seen, agent.usage);
          run.agents.push(agent);
        }
      }
      if (run.usage.size) runs.push(run);
    }
  }
  return runs;
}

// Copilot's inputTokens counts the whole prompt, cached part included.
const copilotUsage = (u) => {
  const cacheRead = u.cacheReadTokens || 0;
  const cacheWrite5m = u.cacheWriteTokens || 0;
  return { input: Math.max(0, (u.inputTokens || 0) - cacheRead - cacheWrite5m), output: u.outputTokens || 0, cacheRead, cacheWrite5m, cacheWrite1h: 0 };
};

export function readCopilotRuns(copilotHome, since) {
  return listSessions(sessionsDir(copilotHome)).filter((s) => s.mtime >= since.getTime()).flatMap((s) => {
    const events = createReader(s.log)();
    const state = createState(s.id, null);
    const run = newRun('copilot', s.id);
    const byAgent = new Map();
    for (const e of events) {
      applyEvent(state, e);
      if (e.type === 'session.usage_record' && e.data?.usage) {
        const u = copilotUsage(e.data.usage);
        addModelUsage(run.usage, e.data.usage.model, u);
        if (e.agentId) addUsage(byAgent.get(e.agentId) || byAgent.set(e.agentId, emptyUsage()).get(e.agentId), u);
      }
      if (e.type === 'tool.execution_complete' || e.type === 'assistant.message') linksIn(run, JSON.stringify(e.data || {}));
    }
    Object.assign(run, {
      title: state.title, cwd: state.cwd, branch: state.branch, started: state.started, last: state.last,
      prompt: state.prompt, prompts: state.tasks.filter((t) => t.prompt).map((t) => ({ at: t.at, text: t.prompt })), reply: state.says?.text || null, path: s.log,
      premium: state.premium, files: new Set(state.files.keys()), ended: state.ended,
      agents: [...state.agents.values()].map((a) => ({ name: a.name, model: a.model, usage: byAgent.get(a.key) || emptyUsage() })),
    });
    return run.usage.size || state.turns ? [run] : [];
  });
}

export function summarize(runs, prices, now = Date.now()) {
  const byModel = new Map();
  let premium = 0;
  for (const run of runs) {
    run.live = !run.ended && now - (run.last || 0) < LIVE_MS;
    run.tokens = [...run.usage.values()].reduce((n, u) => n + tokensOf(u), 0);
    const costs = [...run.usage].map(([model, u]) => priceOf(model, u, prices));
    run.cost = costs.some((c) => c !== null) ? costs.reduce((a, c) => a + (c || 0), 0) : null;
    run.unpriced = costs.some((c) => c === null);
    const lines = (run.reply || '').split('\n').map((l) => l.trim()).filter(Boolean);
    run.waiting = Boolean(lines.length && lines[lines.length - 1].endsWith('?'));
    premium += run.premium || 0;
    for (const [model, u] of run.usage) addModelUsage(byModel, model, u);
  }
  runs.sort((a, b) => (a.started || 0) - (b.started || 0));
  const models = [...byModel].map(([model, usage]) => ({ model, tokens: tokensOf(usage), cost: priceOf(model, usage, prices) }))
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens - a.tokens);
  const cost = models.reduce((sum, m) => sum + (m.cost || 0), 0);
  return { runs, totals: { sessions: runs.length, live: runs.filter((r) => r.live).length, cost, premium, models } };
}

// The reply's opening sentence without Markdown, skipping a bold lead-in label such as tblock's "**Goal.**".
const gist = (text) => String(text || '').trim().replace(/^\*\*[^*\n]{1,30}[.:]\*\*\s*/, '').replace(/\*\*|__|`|^#+\s*/gm, '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] || '';
const money = (n) => (n === null || n === undefined ? null : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const HARNESS = { 'claude-code': 'Claude Code', copilot: 'Copilot' };

export function renderLog({ runs, totals }, ui, since) {
  const out = [];
  const width = ui.width - 4;
  if (!runs.length) return [`  ${ui.dim(`No agent sessions since ${day(since.getTime())}.`)}`];
  for (const [label, group] of Object.entries(Object.groupBy(runs, (r) => day(r.last || r.started)))) {
    out.push(ui.section(label));
    for (const r of group) {
      const when = `${clock(r.started)}–${clock(r.last)}`;
      const where = [HARNESS[r.harness], r.cwd && basename(r.cwd), r.branch && `⎇ ${r.branch}`].filter(Boolean).join('  ·  ');
      const spend = [r.cost !== null && `${r.unpriced ? '≥' : ''}${money(r.cost)}`, r.premium && `${r.premium} premium`].filter(Boolean).join(' · ') || ui.dim('no price');
      out.push(`  ${ui.bold(when)}  ${r.live ? ui.tone('ok', '● live') : ui.dim('■')}  ${ui.dim(where)}   ${spend}`);
      const task = r.title || r.prompt;
      if (task) out.push(`     ${ui.dim('task')}  ${ui.clip(task, width - 10)}`);
      if (r.reply) out.push(`     ${ui.dim('last')}  ${ui.clip(gist(r.reply), width - 10)}${r.waiting ? `  ${ui.tone('warn', '? waiting on you')}` : ''}`);
      for (const link of r.links) out.push(`     ${ui.dim('MR')}    ${link}`);
      const agents = Object.entries(Object.groupBy(r.agents, (a) => `${a.name}${a.model ? ` on ${a.model}` : ''}`)).map(([k, list]) => (list.length > 1 ? `${k} ×${list.length}` : k));
      const facts = [`${count(r.tokens)} tokens`, r.files.size && `${r.files.size} ${r.files.size === 1 ? 'file' : 'files'} changed`, agents.length && `subagents: ${agents.join(', ')}`].filter(Boolean).join('  ·  ');
      out.push(`     ${ui.dim(ui.clip(facts, width - 5))}`, '');
    }
  }
  out.push(ui.section('total'));
  out.push(`  ${ui.bold(String(totals.sessions))} sessions${totals.live ? ` (${totals.live} live)` : ''}  ·  ${ui.bold(money(totals.cost) || '$0.00')} at list price${totals.premium ? `  ·  ${ui.bold(String(totals.premium))} Copilot premium ${totals.premium === 1 ? 'request' : 'requests'}` : ''}`);
  out.push(ui.table(totals.models.map((m) => [ui.model(m.model, /claude/.test(m.model) ? 'claude' : /gpt/.test(m.model) ? 'gpt' : null), `${count(m.tokens)} tokens`, money(m.cost) || ui.dim('no price')]), { gap: 3 }));
  out.push('', ui.dim('  Dollars are API list prices from pricing.json. A Claude subscription or a Copilot plan bills differently.'));
  return out;
}

export function log({ ui, json, flags, claudeHome, copilotHome, prices, cwd, now = new Date() }) {
  const unknown = flags.filter((f) => !f.startsWith('--since=') && f !== '--here');
  if (unknown.length) throw new Error(`log takes --since=<when> and --here, not ${unknown.join(' ')}`);
  const since = parseSince(flags.find((f) => f.startsWith('--since='))?.slice('--since='.length), now);
  const here = flags.includes('--here') ? cwd.replace(/\\/g, '/').toLowerCase() : null;
  const runs = [...readClaudeRuns(claudeHome, since), ...readCopilotRuns(copilotHome, since)]
    .filter((r) => (r.last || 0) >= since.getTime())
    .filter((r) => !here || (r.cwd || '').replace(/\\/g, '/').toLowerCase().startsWith(here));
  const summary = summarize(runs, prices, now.getTime());
  if (json) {
    const plain = (r) => ({ ...r, links: [...r.links], files: [...r.files], usage: Object.fromEntries(r.usage) });
    return `${JSON.stringify({ since: since.toISOString(), runs: summary.runs.map(plain), totals: summary.totals }, null, 2)}\n`;
  }
  return `${renderLog(summary, ui, since).join('\n')}\n`;
}
