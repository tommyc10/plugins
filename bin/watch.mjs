// `tblock watch`: a live view of Copilot and Claude Code agent sessions. Copilot's runtime writes an event
// log for the CLI and VS Code's agents window (~/.copilot/session-state/<id>/events.jsonl); Claude Code
// writes transcripts that watch-claude.mjs turns into the same events.
// It shows the main agent, each subagent with its model and effort, whether the role's model was
// honoured, every tool call grouped by the task it served, and the files changed. Node built-ins only.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { claudeProjectsDir, createClaudeSource, listClaudeSessions } from './watch-claude.mjs';

const FAMILY = (model = '') => (/claude|opus|sonnet|haiku|fable|mythos/i.test(model) ? 'claude' : /gpt|codex/i.test(model) ? 'gpt' : /gemini/i.test(model) ? 'gemini' : null);

// Context window and $ per million tokens (input, output, cache read), from the claude-api skill's model
// table cached 2026-10-06. Cache writes bill at 1.25x input. Models not listed get no gauge limit or cost.
const MODELS = [
  [/fable-5-1|mythos-5-1/, 1e6, [10, 50, 0.25]],
  [/fable|mythos/, 1e6, [10, 50, 1]],
  [/opus-5-5/, 1e6, [4, 20, 0.2]],
  [/opus-(5|4-[678])/, 1e6, [5, 25, 0.5]],
  [/sonnet-5-5/, 1e6, [2, 10, 0.2]],
  [/sonnet-5/, 1e6, [2, 10, 0.2]],
  [/sonnet-4-6/, 1e6, [3, 15, 0.3]],
  [/haiku-5-5/, 1e6, [0.1, 0.5, 0.01]],
  [/haiku-4-5/, 2e5, [1, 5, 0.1]],
];
export function modelInfo(model = '') {
  const hit = MODELS.find(([re]) => re.test(String(model).toLowerCase()));
  return hit ? { window: hit[1], price: hit[2] } : { window: null, price: null };
}

// Tool names grouped by what they do, with an icon and a colour for each group.
const TOOL_KINDS = [
  ['edit', /edit|replace|patch|write|insert/i, '✎', 'pink'],
  ['create', /create|new_file/i, '✚', 'ok'],
  ['read', /^(view|read|read_file|cat|open)/i, '◔', 'info'],
  ['search', /rg|grep|glob|search|find|semantic/i, '⌕', 'violet'],
  ['shell', /bash|shell|powershell|terminal|exec|run/i, '❯', 'warn'],
  ['web', /fetch|web|http|browser/i, '◍', 'info'],
  ['agent', /^(task|agent|subagent|run_subagent)$/i, '⑂', 'accent'],
  ['skill', /skill/i, '✦', 'accent'],
  ['ask', /ask_user|question|confirm/i, '?', 'violet'],
];
const kindOf = (name) => TOOL_KINDS.find(([, re]) => re.test(name)) || ['tool', null, '•', null];

// "mcp__t3-code__t3_background_wait" reads as "t3·background_wait": the server's first word, and the
// tool without a prefix that repeats it.
export const toolLabel = (name = '') => {
  const m = name.match(/^mcp__(.+?)__(.+)$/);
  if (!m) return name;
  const server = m[1].replace(/^claude_ai_/, '').split(/[-_]/)[0];
  return `${server}·${m[2].replace(new RegExp(`^${server}_`, 'i'), '')}`;
};

// What a tool call acted on, from the first argument that names a target.
function targetOf(args = {}) {
  for (const key of ['path', 'file_path', 'filePath', 'command', 'pattern', 'query', 'url', 'skill', 'description', 'agent_type', 'title']) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key].trim();
  }
  if (Array.isArray(args.paths) && args.paths.length) return args.paths.join(', ');
  // Tools with their own argument names (MCP tools, mostly) show their first short text argument.
  const any = Object.entries(args || {}).find(([, v]) => typeof v === 'string' && v.trim() && v.length < 300);
  return any ? `${any[0]}=${any[1].trim()}` : '';
}

// One line saying why a tool failed: its exit code and the first line that reads like an error.
export function errorLine(text = '') {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const exit = lines[0]?.match(/^(?:Error: )?Exit code (\d+)$/);
  const rest = exit ? lines.slice(1) : lines;
  // Case matters: "AssertionError" is an error class, "is_error" in a line of source is not.
  // A failed grep prints lines of source ("12: // throws AssertionError"); those are hits, not the reason.
  const said = rest.filter((l) => !/^(\d+[:-]|\S+:\d+[:-]|\/\/|\/\*|\*|#)/.test(l));
  const pool = said.length ? said : rest;
  const why = pool.find((l) => /\b[A-Z]\w*(Error|Exception)\b/.test(l) || /^(error|fatal)\b/i.test(l))
    || pool.find((l) => /fail|denied|not found|cannot|unable|invalid|refused/i.test(l)) || pool[0] || '';
  return [exit && `exit ${exit[1]}`, why].filter(Boolean).join(' · ') || 'failed';
}

// The last lines of a tool's output, capped so a huge log can't fill memory.
const tail = (text = '', lines = 40) => String(text).replace(/\s+$/, '').split('\n').slice(-lines).join('\n').slice(-4000);

// How the harness chose a subagent's model: honoured the role, inherited the session's, or picked its own.
const HONOURED = new Set(['explicit_override', 'configured_required', 'configured_preference', 'agent_definition_default']);
function modelVerdict(source) {
  if (!source) return null;
  if (HONOURED.has(source)) return { level: 'ok', text: 'role model' };
  if (source === 'session_inheritance') return { level: 'warn', text: 'session model' };
  return { level: 'info', text: 'picked by Copilot' };
}

export function sessionsDir(copilotHome) {
  return join(copilotHome, 'session-state');
}

// Sessions newest first, by when their event log last changed.
export function listSessions(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((id) => ({ id, log: join(dir, id, 'events.jsonl'), harness: 'copilot' }))
    .filter((s) => existsSync(s.log))
    .map((s) => ({ ...s, mtime: statSync(s.log).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function workspaceName(dir, id) {
  const file = join(dir, id, 'workspace.yaml');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').match(/^name:\s*(.+)$/m)?.[1]?.trim() || null;
}

export function createState(id, name) {
  return {
    id, title: name, cwd: null, branch: null, started: null, ended: false, endedAt: null,
    model: null, effort: null, auto: false, busy: false, turns: 0, tools: 0, tokens: 0, premium: 0, context: null, prompt: null,
    agents: new Map(), byCall: new Map(), running: new Map(), activity: [], files: new Map(), errors: 0, last: null,
    tasks: [], idleSince: null, says: null, cost: 0, compactions: 0, streak: new Map(), seq: 0,
  };
}

const agentOf = (state, e) => (e.agentId && state.agents.get(e.agentId)) || null;

// A task is one prompt and everything the agents did for it; work before the first prompt gets its own.
const newTask = (prompt, at) => ({ prompt, at, endAt: null, tools: 0, agents: 0, files: new Set(), errors: 0 });
function taskOf(state, at) {
  if (!state.tasks.length) state.tasks.push(newTask(null, at));
  return state.tasks[state.tasks.length - 1];
}
// The main agent stops (its turn is over) or starts again (a new turn, or a background agent woke it).
function settle(state, at) {
  state.busy = false;
  state.idleSince = at;
  const task = taskOf(state, at);
  task.endAt = task.endAt || at;
}
function wake(state, at) {
  state.busy = true;
  state.halt = null;
  state.idleSince = null;
  taskOf(state, at).endAt = null;
}

// Folds one event into the state. Unknown events are ignored, so new runtime versions don't break it.
export function applyEvent(state, e) {
  const d = e.data || {};
  const at = e.timestamp ? Date.parse(e.timestamp) : null;
  if (at) state.last = at;
  const who = agentOf(state, e);
  const log = (entry) => {
    const row = { seq: ++state.seq, at, task: state.tasks.length - 1, agent: who?.name || (e.agentId ? `agent ${e.agentId.slice(0, 6)}` : 'main'), family: who ? FAMILY(who.model) : null, ...entry };
    state.activity.push(row);
    // A task broke only if a failure is the last thing it did; one it recovered from is just a count.
    const task = state.tasks[state.tasks.length - 1];
    if (task) task.broke = entry.kind === 'fail';
    return row;
  };
  switch (e.type) {
    case 'session.start':
      state.started = Date.parse(d.startTime || e.timestamp);
      state.cwd = d.context?.cwd || null;
      state.branch = d.context?.branch || null;
      state.model = d.selectedModel || null;
      state.auto = d.selectedModel === 'auto';
      break;
    case 'session.auto_mode_resolved':
      state.model = d.chosenModel || state.model;
      break;
    case 'session.model_change':
      state.model = d.newModel || state.model;
      break;
    case 'session.effort':
      state.effort = d.effort || state.effort;
      break;
    case 'session.branch':
      state.branch = d.branch || state.branch;
      break;
    case 'session.title_changed':
      state.title = d.title || state.title;
      break;
    case 'session.compaction_complete':
      state.compactions += 1;
      if (d.postTokens) state.context = d.postTokens;
      log({ kind: 'note', icon: '⇣', tone: 'violet', tool: 'compacted', text: d.preTokens ? `${count(d.preTokens)} → ${count(d.postTokens || 0)} context` : 'context compacted' });
      break;
    case 'user.message':
      if (!e.agentId) {
        state.prompt = (d.content || '').replace(/\s+/g, ' ').trim();
        const prev = state.tasks[state.tasks.length - 1];
        if (prev && !prev.endAt) prev.endAt = at;
        state.tasks.push(newTask(state.prompt, at));
        log({ kind: 'you', icon: '›', tone: 'accent', text: state.prompt });
      }
      break;
    case 'assistant.message': {
      const text = String(d.content || '').trim();
      if (!text) break;
      if (who) who.says = { text, at }; else state.says = { text, at };
      log({ kind: 'say', icon: '“', tone: 'violet', tool: 'says', text: text.replace(/\s+/g, ' '), full: text });
      break;
    }
    case 'assistant.turn_start':
      if (who) who.busy = true; else { wake(state, at); state.turns += 1; }
      break;
    case 'assistant.turn_end':
      if (!who && state.running.size === 0) settle(state, at);
      break;
    case 'session.busy':
      if (!state.busy) wake(state, at);
      break;
    case 'session.idle':
      settle(state, at);
      break;
    case 'session.usage_record': {
      const u = d.usage || {};
      const [input, write, read, output] = [u.inputTokens || 0, u.cacheWriteTokens || 0, u.cacheReadTokens || 0, u.outputTokens || 0];
      state.tokens += input + write + output;
      const price = modelInfo(u.model || who?.model || state.model).price;
      if (price) state.cost += (input * price[0] + write * price[0] * 1.25 + read * price[2] + output * price[1]) / 1e6;
      if (!who && u.model) state.model = u.model;
      if (!who && d.contextTokens) state.context = d.contextTokens;
      if (who && u.model && !who.model) who.model = u.model;
      break;
    }
    case 'session.usage_checkpoint':
      state.premium = d.totalPremiumRequests ?? state.premium;
      break;
    case 'tool.execution_start': {
      const [kind, , icon, tone] = kindOf(d.toolName || '');
      const full = targetOf(d.arguments);
      const task = taskOf(state, at);
      const row = kind === 'agent' ? null : log({ kind, icon, tone, tool: toolLabel(d.toolName), text: full.replace(/\s+/g, ' '), full, call: d.toolCallId });
      state.running.set(d.toolCallId, { agent: who?.name || 'main', kind, name: toolLabel(d.toolName), target: full.replace(/\s+/g, ' '), at, row });
      state.tools += 1;
      task.tools += 1;
      if (who) who.tools += 1;
      if (/edit|create/.test(kind) && full) {
        const was = state.files.get(full);
        state.files.set(full, { kind: was?.kind === 'create' ? 'create' : kind, added: was?.added || 0, removed: was?.removed || 0, counted: was?.counted || false });
        task.files.add(full);
      }
      break;
    }
    case 'tool.execution_complete': {
      const call = state.running.get(d.toolCallId);
      state.running.delete(d.toolCallId);
      const ctx = d.toolTelemetry?.metrics?.context_current_tokens;
      if (ctx && !who) state.context = ctx;
      if (!call) break;
      const row = call.row;
      const result = typeof d.result === 'string' ? d.result : d.result?.content || '';
      const error = d.success === false ? (typeof d.error === 'string' ? d.error : d.error?.message || result || 'failed') : null;
      if (row) {
        row.end = at;
        if (result || error) row.output = tail(error || result);
        if (d.patch) row.patch = d.patch;
      }
      if (d.patch && call.row?.full) {
        const file = state.files.get(call.row.full);
        if (file) Object.assign(file, { kind: d.patch.created ? 'create' : file.kind, added: file.added + d.patch.added, removed: file.removed + d.patch.removed, counted: true });
      }
      if (error) {
        state.errors += 1;
        taskOf(state, at).errors += 1;
        taskOf(state, at).broke = true;
        const why = errorLine(error);
        if (row) Object.assign(row, { kind: 'fail', icon: '✖', tone: 'fail', error: why, text: `${why}  ${row.text}` });
        else log({ kind: 'fail', icon: '✖', tone: 'fail', tool: call.name, text: why, error: why, output: tail(error) });
        const was = state.streak.get(call.agent);
        state.streak.set(call.agent, { count: (was?.count || 0) + 1, tool: call.name, error: why });
      } else state.streak.delete(call.agent);
      break;
    }
    case 'subagent.started': {
      const agent = { key: e.agentId || d.toolCallId, name: d.agentName || d.agentDisplayName || 'subagent', display: d.agentDisplayName, model: d.model || null, effort: null, source: d.modelSelectionSource || null, status: 'running', started: at, duration: null, tools: 0, tokens: null, error: null, busy: true, task: Math.max(0, state.tasks.length - 1), says: null };
      taskOf(state, at).agents += 1;
      state.agents.set(agent.key, agent);
      state.byCall.set(d.toolCallId, agent);
      state.activity.push({ seq: ++state.seq, at, task: state.tasks.length - 1, agent: 'main', family: null, kind: 'agent', icon: '⑂', tone: 'accent', tool: 'spawn', text: `${agent.name}${agent.model ? ` on ${agent.model}` : ''}`, full: [agent.name, d.prompt].filter(Boolean).join('\n\n').slice(0, 4000) });
      break;
    }
    case 'subagent.configured': {
      const agent = who || [...state.agents.values()].reverse().find((a) => a.status === 'running');
      if (agent) { agent.model = d.model || agent.model; agent.effort = d.reasoningEffort || agent.effort; }
      break;
    }
    case 'subagent.completed':
    case 'subagent.failed': {
      const agent = state.byCall.get(d.toolCallId) || who;
      if (!agent) break;
      Object.assign(agent, {
        status: e.type === 'subagent.failed' ? 'failed' : d.cancelled ? 'cancelled' : 'done', busy: false,
        model: d.model || agent.model, source: d.modelSelectionSource || agent.source,
        duration: d.durationMs ?? (at && agent.started ? at - agent.started : null),
        tools: d.totalToolCalls ?? agent.tools, tokens: d.totalTokens ?? null, error: d.error || null,
      });
      state.activity.push({ seq: ++state.seq, at, task: state.tasks.length - 1, agent: agent.name, family: FAMILY(agent.model), kind: agent.status === 'failed' ? 'fail' : 'done', icon: agent.status === 'failed' ? '✖' : '✔', tone: agent.status === 'failed' ? 'fail' : 'ok', tool: agent.status, text: agent.error || plural(agent.tools, 'tool call'), full: agent.says?.text });
      break;
    }
    case 'session.error':
      state.errors += 1;
      taskOf(state, at).errors += 1;
      log({ kind: 'fail', icon: '✖', tone: 'fail', tool: 'error', text: d.message || d.errorType, full: d.message });
      // Shown as the reason it stopped until the session works again.
      if (!who) state.halt = String(d.message || d.errorType || 'error').replace(/\s+/g, ' ');
      break;
    case 'session.shutdown':
      settle(state, at);
      state.ended = true;
      state.endedAt = at;
      for (const f of d.codeChanges?.filesModified || []) if (!state.files.has(f)) state.files.set(f, { kind: 'edit', added: 0, removed: 0, counted: false });
      break;
    default:
  }
}

// Reads new whole lines from a growing log, keeping a half-written last line for next time.
export function createReader(file) {
  let offset = 0;
  let rest = '';
  return () => {
    if (!existsSync(file)) return [];
    const size = statSync(file).size;
    if (size < offset) { offset = 0; rest = ''; }
    if (size === offset) return [];
    const fd = openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    readSync(fd, buffer, 0, buffer.length, offset);
    closeSync(fd);
    offset = size;
    const lines = (rest + buffer.toString('utf8')).split('\n');
    rest = lines.pop();
    return lines.filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  };
}

const clock = (ms) => (ms ? new Date(ms).toTimeString().slice(0, 8) : '--:--:--');
const span = (ms) => {
  if (ms == null || ms < 0) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
};
// A wait in one unit, for places with no room for two: 45s, 12m, 3h.
const brief = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const stripLen = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
const money = (n) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`);

// Plain text broken into lines of at most w columns; long words are cut.
export function wrapText(text, w) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      for (let chunk = word; chunk; chunk = chunk.slice(w)) {
        const piece = chunk.slice(0, w);
        if (line && line.length + 1 + piece.length > w) { out.push(line); line = piece; } else line = line ? `${line} ${piece}` : piece;
        if (chunk.length <= w) break;
      }
    }
    out.push(line);
  }
  return out;
}

// What the main agent is doing, in one word: working, waiting on the user, or ended.
export function phase(state) {
  if (state.ended) return 'ended';
  return state.busy ? 'working' : state.tasks.length ? 'your turn' : 'starting';
}

// A short name for a session: its title, else its prompt, else its id.
export function sessionLabel(state) {
  const text = state.title || state.tasks.find((t) => t.prompt)?.prompt || state.id.slice(0, 8);
  return text.replace(/^\/tblock:/, '/');
}

// A tab reads as the folder the session runs in, then what it was asked.
export function tabNames(states) {
  const folder = states.map((s) => (s.cwd || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || null);
  return states.map((s, i) => ({ name: folder[i] || sessionLabel(s), label: folder[i] ? sessionLabel(s) : '' }));
}

// What git says the folder holds now. Agents also change files through the shell, which no tool call names.
export function parseGit(status = '', numstat = '') {
  const rows = String(status).split('\n').filter((l) => l.trim());
  const untracked = rows.filter((r) => r.startsWith('??')).length;
  let added = 0;
  let removed = 0;
  for (const l of String(numstat).split('\n')) {
    const m = l.match(/^(\d+)\t(\d+)\t/);
    if (m) { added += Number(m[1]); removed += Number(m[2]); }
  }
  return { changed: rows.length - untracked, untracked, added, removed };
}
const GIT = { windowsHide: true, timeout: 4000, encoding: 'utf8' };
function repoState(cwd, done) {
  execFile('git', ['-C', cwd, 'status', '--porcelain'], GIT, (err, status) => {
    if (err) return done(null);
    return execFile('git', ['-C', cwd, 'diff', '--numstat', 'HEAD'], GIT, (e, numstat) => done(parseGit(status, e ? '' : numstat)));
  });
}
function repoStateSync(cwd) {
  try {
    const run = (args) => execFileSync('git', ['-C', cwd, ...args], { ...GIT, stdio: ['ignore', 'pipe', 'ignore'] });
    const status = run(['status', '--porcelain']);
    let numstat = '';
    try { numstat = run(['diff', '--numstat', 'HEAD']); } catch { /* no commits yet */ }
    return parseGit(status, numstat);
  } catch { return null; }
}

// Something that needs a look: an agent failing again and again, or a busy session that has gone silent.
const SILENT_MS = 3 * 60 * 1000;
export function trouble(state, now = Date.now()) {
  if (state.halt && !state.busy) return { level: 'fail', text: `stopped · ${state.halt}` };
  for (const [agent, s] of state.streak) {
    if (s.count >= 3) return { level: 'fail', text: `${agent === 'main' ? '' : `${agent} `}failed ${s.count}× in a row · ${s.tool} · ${s.error}` };
  }
  if (state.busy && !state.ended && state.running.size === 0 && state.last && now - state.last > SILENT_MS) {
    return { level: 'warn', text: `no output for ${span(now - state.last)}` };
  }
  return null;
}

// Consecutive calls of one tool by one agent fold into one line with a count, so a run of twenty
// greps reads as "Grep ×20" with the latest target, and a long task stays readable.
// A folded line keeps the seq of its first call as its key, so a selection holds while the run grows.
export function foldSteps(entries) {
  const out = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    const foldable = !['you', 'agent', 'done', 'fail', 'say', 'note'].includes(entry.kind);
    if (last && foldable && last.foldable && last.agent === entry.agent && last.tool === entry.tool) {
      last.times += 1;
      last.at = entry.at;
      last.text = entry.text;
      last.latest = entry;
      last.calls.push(entry);
    } else out.push({ ...entry, key: entry.seq, times: 1, foldable, latest: entry, calls: [entry] });
  }
  return out;
}

// The folded steps of one task, without the prompt itself. The story keeps what was said, who was
// spawned, and what broke, and drops the tool calls between them.
const STORY = new Set(['say', 'agent', 'done', 'fail', 'note']);
export const stepsOf = (state, i, story = false) => foldSteps(state.activity.filter((a) => a.task === i && a.kind !== 'you' && (!story || STORY.has(a.kind))));

// The steps the cursor can move through: the latest task's, or every task's when they are all open.
export function selectable(state, expand, story = false) {
  const last = state.tasks.length - 1;
  if (last < 0) return [];
  return (expand ? state.tasks.map((_, i) => i) : [last]).flatMap((i) => stepsOf(state, i, story));
}

// What the viewer has open. layer: feed (following, or browsing with a selection), detail, overview, or help.
export const initialView = () => ({ layer: 'feed', selected: null, expand: false, story: false, bell: false, notify: false });

const KEYS = { up: ['\x1b[A', 'k'], down: ['\x1b[B', 'j'], enter: ['\r', '\n'], first: ['g', '\x1b[H', '\x1b[1~'], last: ['G', '\x1b[F', '\x1b[4~'], next: ['\t', '\x1b[C'], prev: ['\x1b[Z', '\x1b[D'] };
const is = (key, name) => KEYS[name].includes(key);

// One key press: the next view, and what the caller must do (quit, switch tab, clear the screen).
export function onKey(view, key, { steps = [], tabs = 1 } = {}) {
  const v = { ...view };
  const keys = steps.map((s) => s.key);
  const at = keys.indexOf(v.selected);
  if (key === 'q' || key === 'Q' || key === '\x03') return { view: v, act: 'quit' };
  if (key === '\x1b') {
    if (v.layer !== 'feed') return { view: { ...v, layer: 'feed' }, act: 'clear' };
    if (v.selected != null) return { view: { ...v, selected: null }, act: 'clear' };
    return { view: v, act: 'quit' };
  }
  if (key === '?' || key === 'h' || key === 'H') return { view: { ...v, layer: v.layer === 'help' ? 'feed' : 'help' }, act: 'clear' };
  if (v.layer === 'help') return { view: { ...v, layer: 'feed' }, act: 'clear' };
  if (key === 'o' || key === 'O') return { view: { ...v, layer: v.layer === 'overview' ? 'feed' : 'overview' }, act: 'clear' };
  if (/^[1-9]$/.test(key) && Number(key) <= tabs) return { view: { ...v, layer: 'feed', selected: null }, act: `tab:${Number(key) - 1}` };
  if (is(key, 'next') && tabs > 1 && v.layer !== 'detail') return { view: { ...v, selected: null }, act: 'tab:+1' };
  if (is(key, 'prev') && tabs > 1 && v.layer !== 'detail') return { view: { ...v, selected: null }, act: 'tab:-1' };
  if (v.layer === 'overview') return { view: v, act: null };
  if (key === 'e' || key === 'E') return { view: { ...v, expand: !v.expand, selected: null }, act: 'clear' };
  if (key === 's' || key === 'S') return { view: { ...v, story: !v.story, selected: null, layer: 'feed' }, act: 'clear' };
  if (key === 'b' || key === 'B') return { view: { ...v, bell: !v.bell }, act: null };
  if (key === 'n' || key === 'N') return { view: { ...v, notify: !v.notify }, act: null };
  if (!keys.length) return { view: v, act: null };
  if (is(key, 'up')) return { view: { ...v, selected: keys[at < 0 ? keys.length - 1 : Math.max(0, at - 1)] }, act: 'clear' };
  if (is(key, 'down')) return { view: { ...v, selected: at < 0 || at === keys.length - 1 ? (v.layer === 'detail' ? v.selected : null) : keys[at + 1] }, act: 'clear' };
  if (is(key, 'first')) return { view: { ...v, selected: keys[0] }, act: 'clear' };
  if (is(key, 'last')) return { view: { ...v, selected: null, layer: 'feed' }, act: 'clear' };
  if (is(key, 'enter')) {
    if (v.layer === 'detail') return { view: { ...v, layer: 'feed' }, act: 'clear' };
    return { view: { ...v, layer: 'detail', selected: at < 0 ? keys[keys.length - 1] : v.selected }, act: 'clear' };
  }
  return { view: v, act: null };
}

// A bar of n cells filled to frac, warming from green to amber to red as it fills.
function gauge(ui, frac, n) {
  const f = Math.max(0, Math.min(1, frac));
  const full = Math.round(f * n);
  const tone = f >= 0.85 ? 'fail' : f >= 0.6 ? 'warn' : 'ok';
  return ui.color ? `${ui.tone(tone, '█'.repeat(full))}${ui.dim('░'.repeat(n - full))}` : `[${'#'.repeat(full)}${'.'.repeat(n - full)}]`;
}

// When each subagent ran, as a bar on a shared time axis from t0 to t1.
function lane(ui, a, t0, t1, n, now) {
  const end = a.status === 'running' ? now : (a.started || t0) + (a.duration || 0);
  const at = (t) => Math.round(((t - t0) / Math.max(1, t1 - t0)) * n);
  const from = Math.min(n - 1, at(a.started || t0));
  const to = Math.max(from + 1, Math.min(n, at(end)));
  const tone = a.status === 'failed' ? 'fail' : a.status === 'running' ? 'accent' : FAMILY(a.model) || 'info';
  const bar = (a.status === 'running' ? `${'━'.repeat(to - from - 1)}╸` : '━'.repeat(to - from));
  return `${ui.dim('·'.repeat(from))}${ui.tone(tone, bar)}${ui.dim('·'.repeat(n - to))}`;
}

// A list of lines cut to `room`, keeping `focus` in view, with a marker for what was cut on each side.
function windowed(items, room, focus, ui, indent, noun) {
  if (items.length <= room) return items;
  let take = room;
  let start = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    start = focus == null ? items.length - take : Math.min(Math.max(0, focus - Math.floor(take / 2)), items.length - take);
    take = Math.max(1, room - (start > 0) - (start + take < items.length));
  }
  start = focus == null ? items.length - take : Math.min(Math.max(0, focus - Math.floor(take / 2)), items.length - take);
  const above = start;
  const below = items.length - start - take;
  return [
    ...(above ? [ui.dim(`${indent}↑ ${plural(above, `earlier ${noun}`)}`)] : []),
    ...items.slice(start, start + take),
    ...(below ? [ui.dim(`${indent}↓ ${plural(below, `later ${noun}`)}`)] : []),
  ];
}

// Draws the whole screen as lines, fitted to the terminal. Narrow terminals stack the sections and give
// the task feed what's left; from 150 columns the feed takes the left pane and the agents the right.
// `tabs` lists the sessions the viewer can switch between; `view` is what's selected or open.
export function render(state, ui, opts = {}) {
  const { now = Date.now(), cols = 100, rows = 40, following = true, version = '', tabs = [], pin = false, replay = null, git = null, once = false } = opts;
  const view = { ...initialView(), expand: !!opts.expand, bell: !!opts.bell, ...opts.view };
  const width = Math.max(40, cols - 1);
  const wide = width >= 150 && view.layer !== 'overview';
  // Paths inside the project print relative to it, and so do the project's paths inside a command:
  // "cd /c/code/app && npm test" reads as "npm test".
  const rootOf = (s) => (s.cwd || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const relTo = (s) => {
    const root = rootOf(s);
    const quote = (p) => p.split('/').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]+');
    // Git Bash spells C:/code as /c/code.
    const inCommand = root && new RegExp(`(^|[\\s"'=(])(?:${quote(root)}|${quote(root.replace(/^([a-z]):/, '/$1'))})(?:[\\\\/]+|(?=["'\\s;&|)]|$))`, 'gi');
    return (text) => {
      const norm = String(text || '').replace(/\\/g, '/');
      // Only paths (no spaces, a slash in them) get slashes swapped; commands print as they ran.
      if (root && norm.toLowerCase().startsWith(`${root}/`)) return norm.slice(root.length + 1);
      if (/^\S+$/.test(norm) && norm.includes('/')) return ui.tildify(norm);
      const local = inCommand ? String(text || '').replace(inCommand, (m, pre) => (/[\\/]$/.test(m) ? pre : `${pre}.`)).replace(/(^| {2})cd\s+(["']?)\.\2\s*(&&|;)\s*/, '$1') : text || '';
      return ui.tildify(local);
    };
  };
  const rel = relTo(state);
  const live = !state.ended && now - (state.last || 0) < 10 * 60 * 1000;
  const elapsed = state.started ? (state.ended ? state.endedAt : now) - state.started : null;
  const glyph = (s, seed = 0) => {
    const p = phase(s);
    if (trouble(s, now)?.level === 'fail') return ui.tone('fail', ui.color ? '▲' : '!');
    if (p === 'working') return ui.tone('accent', ui.spinner(now + seed));
    if (p === 'your turn') return ui.tone('warn', ui.color ? '●' : '!');
    return ui.dim(p === 'ended' ? '■' : '○');
  };
  const contextLine = (s, n) => {
    if (!s.context) return '';
    const { window } = modelInfo(s.model);
    const limit = window && s.context > window ? null : window;
    const parts = [limit ? `${count(s.context)} / ${count(limit)} · ${Math.round((s.context / limit) * 100)}%` : `${count(s.context)}`, s.compactions && `compacted ×${s.compactions}`].filter(Boolean).join(' · ');
    return limit ? `${gauge(ui, s.context / limit, n)}  ${ui.dim(parts)}` : ui.dim(`${parts} context`);
  };

  // Header: wordmark, a live or ended badge (or the replay controls), how long the session has run.
  const head = [];
  const badge = replay ? ui.tone('info', `${replay.playing ? '▶' : '❚❚'} replay ${replay.speed}×`)
    : state.ended ? ui.dim('■ ended') : live ? ui.tone('ok', `${ui.color ? '●' : '*'} live`) : ui.dim('○ quiet');
  const left = `  ${ui.bold(ui.color ? ui.tone('accent', 'tblock') : 'tblock')} ${ui.dim('›')} ${ui.bold('watch')}  ${badge}`;
  const cost = state.cost >= 0.005 ? `≈ ${money(state.cost)}  ` : '';
  const corner = ui.dim(`${cost}${replay ? clock(now) : span(elapsed)}${version ? `  v${version}` : ''}`);
  head.push('', `${left}${' '.repeat(Math.max(2, width - stripLen(left) - stripLen(corner) - 2))}${corner}`);

  // Session tabs: every live session with what it's doing, the one on screen highlighted.
  // Each tab is named for its folder, with what it was asked where there's room, and how long a
  // session has waited on you. Tabs wrap onto more rows before they get too narrow to read.
  if (tabs.length > 1) {
    const perRow = Math.min(tabs.length, Math.max(1, Math.floor((width - 2) / 34)));
    const cellW = Math.floor((width - 2) / perRow) - 2;
    const names = tabNames(tabs.map((t) => t.state));
    const cells = tabs.map((t, i) => {
      const { name, label } = names[i];
      const wait = phase(t.state) === 'your turn' ? ` ${brief(now - (t.state.idleSince || now))}` : '';
      const cell = `${i + 1} ${glyph(t.state, i * 53)} ${ui.clip(label ? `${name} · ${label}` : name, cellW - 5 - wait.length)}`;
      return ui.pad(t.state.id === state.id ? ui.bold(`${ui.tone('accent', '▸')}${cell}${wait}`) : `${ui.dim(` ${cell}`)}${wait ? ui.tone('warn', wait) : ''}`, cellW);
    });
    for (let i = 0; i < cells.length; i += perRow) head.push(`  ${cells.slice(i, i + perRow).join('  ')}`.trimEnd());
  }
  // Where it runs. Copilot and Claude Code name an untitled session after its prompt, which the task feed shows.
  const stem = (state.title || '').replace(/\s*(…|\.\.\.)$/, '').slice(0, 40);
  const titled = state.title && !state.tasks.some((t) => (t.prompt || '').startsWith(stem));
  const where = [state.harness === 'claude-code' ? 'Claude Code' : 'Copilot', titled && state.title, state.cwd && ui.tildify(state.cwd), state.branch && `⎇ ${state.branch}`].filter(Boolean).join('  ·  ');
  head.push(`  ${ui.dim(ui.clip(where || state.id, width - 4))}`, '');

  // Footer: what's followed, counts, and the keys for the layer on screen; a replay shows its scrubber.
  const footer = [];
  if (replay) {
    const n = Math.max(10, width - 30);
    const frac = (now - replay.t0) / Math.max(1, replay.t1 - replay.t0);
    const pos = Math.round(Math.max(0, Math.min(1, frac)) * (n - 1));
    const marks = new Set((replay.marks || []).map((t) => Math.round(((t - replay.t0) / Math.max(1, replay.t1 - replay.t0)) * (n - 1))));
    const bar = Array.from({ length: n }, (_, i) => (i === pos ? ui.tone('accent', '●') : i < pos ? ui.tone('info', marks.has(i) ? '┿' : '━') : ui.dim(marks.has(i) ? '┼' : '─'))).join('');
    footer.push(`  ${bar}  ${ui.dim(`${Math.round(frac * 100)}%`)}`);
  }
  const facts = [
    replay ? `replay ${state.id.slice(0, 8)}` : following && !once ? 'following new sessions' : `session ${state.id.slice(0, 8)}`,
    view.story && 'story: tool calls hidden',
    state.premium && `${state.premium} premium`,
    state.errors && plural(state.errors, 'error'),
  ].filter(Boolean);
  // The hints that drop first on a narrow terminal sit at the end; ? lists every key.
  const keys = view.layer === 'overview' ? [`1-${Math.min(9, tabs.length)} open`, 'o back', 'q quit']
    : view.layer === 'help' ? ['any key back', 'q quit']
      : view.layer === 'detail' ? ['↑↓ step', 'esc back', 'q quit']
        : replay ? ['space play', '←→ 30s', '[ ] task', '+- speed', '↑↓ select', 'q quit']
          : ['? keys', '↑↓ select', '⏎ open', tabs.length > 1 && 'tab switch', tabs.length > 1 && 'o overview', `s ${view.story ? 'all steps' : 'story'}`, `e ${view.expand ? 'fold' : 'expand'}`, `b bell ${view.bell ? 'on' : 'off'}`, `n notify ${view.notify ? 'on' : 'off'}`, 'q quit'].filter(Boolean);
  const factText = `  ${facts.join('  ·  ')}`;
  // Hints that don't fit drop from the end, but quitting is always shown.
  const fitted = [...keys];
  while (fitted.length > 1 && factText.length + 4 + fitted.join('  ·  ').length > width - 1) fitted.splice(fitted.length - 2, 1);
  const keyText = ui.color ? fitted.join('  ·  ') : '';
  footer.push(ui.dim(`${factText}${' '.repeat(Math.max(4, width - factText.length - keyText.length - 1))}${keyText}`.trimEnd()));

  // Fits the body between header and footer; a live screen pins the footer to the bottom row.
  const finish = (body) => {
    const used = head.length + body.length + footer.length;
    const gap = pin ? Math.max(1, rows - 1 - used) : 1;
    return [...head, ...body, ...Array(gap).fill(''), ...footer].flatMap((line) => String(line).split('\n'));
  };

  if (view.layer === 'overview') return finish(overview(tabs.length ? tabs : [{ state }], state, ui, { now, width, glyph, contextLine, relTo }));
  if (view.layer === 'help') return finish(help(ui, width, tabs.length > 1));

  // The main agent: model, effort, totals, the context it holds, what it last said, and what it's doing.
  const agentBlock = (w) => {
    const out = [ui.section('agent', w)];
    const current = state.tasks[state.tasks.length - 1];
    const mainIcon = state.busy ? ui.tone('accent', ui.spinner(now)) : state.ended ? ui.dim('■') : ui.tone('ok', '✔');
    const mainModel = state.model ? ui.model(state.model, FAMILY(state.model)) : ui.dim('model unknown');
    const ctx = contextLine(state, Math.min(24, Math.max(10, w - 44)));
    const gauged = ctx && modelInfo(state.model).window;
    const stats = [`turn ${state.turns}`, `${state.tools} tools`, !gauged && state.context && `${count(state.context)} context`, state.tokens && `${count(state.tokens)} tokens`].filter(Boolean).join('  ·  ');
    out.push(`  ${mainIcon}  ${ui.bold('main')}   ${mainModel}${state.auto ? ui.dim(' (auto)') : ''}${state.effort ? ` ${ui.effort(state.effort, { word: false })}` : ''}   ${ui.dim(stats)}`);
    if (gauged) out.push(`     ${ui.dim('context')}  ${ctx}`);
    const p = phase(state);
    const t = trouble(state, now);
    if (t) out.push(`     ${ui.tone(t.level, `▲ ${ui.clip(t.text, w - 10)}`)}`);
    const mainRun = [...state.running.values()].filter((r) => r.agent === 'main' && r.kind !== 'agent');
    if (p === 'working') {
      if (state.says) out.push(`     ${ui.dim('says')}     ${ui.clip(`“${state.says.text.replace(/\s+/g, ' ')}”`, w - 16)}`);
      const doing = mainRun.at(-1);
      const lead = `${ui.tone('accent', 'working')} ${ui.dim(span(now - (current?.at || now)))}`;
      out.push(`     ${lead}${doing ? `   ${ui.tone('accent', '→')} ${ui.bold(doing.name)} ${ui.dim(span(now - (doing.at || now)))}  ${ui.dim(ui.clip(rel(doing.target), Math.max(10, w - 34 - doing.name.length)))}` : ''}`);
    } else if (p === 'your turn') {
      out.push(`     ${ui.tone('warn', 'your turn')} ${ui.dim(`· waiting ${span(now - (state.idleSince || now)) || '0s'}`)}`);
      // The agent's last words are usually the question it's waiting on, so they show in full.
      if (state.says) {
        const lines = wrapText(state.says.text, Math.max(20, w - 9));
        const shown = lines.length > 6 ? [...lines.slice(0, 5), `… ${plural(lines.length - 5, 'more line')}, ⏎ opens it`] : lines;
        out.push(...shown.map((l) => `     ${ui.tone('warn', '│')} ${l}`));
      }
    }
    out.push('');
    return out;
  };

  // Subagents of the latest task, and any still running; earlier ones fold into a count. Each row ends in
  // a lane on a shared time axis, so parallel runs and stragglers show at a glance.
  const subagentBlock = (w, compact = false) => {
    const agents = [...state.agents.values()];
    if (!agents.length) return [];
    const out = [];
    const latest = Math.max(0, state.tasks.length - 1);
    const shownAgents = view.expand ? agents : agents.filter((a) => a.task === latest || a.status === 'running');
    out.push(ui.section(`subagents  ${agents.filter((a) => a.status === 'running').length} running · ${agents.length} total`, w));
    if (shownAgents.length) {
      const t0 = Math.min(...shownAgents.map((a) => a.started || now));
      const t1 = Math.max(...shownAgents.map((a) => (a.status === 'running' ? now : (a.started || now) + (a.duration || 0))), t0 + 1000);
      const laneCells = w >= 110 ? 24 : 12;
      const build = (compact, laneN = laneCells) => shownAgents.map((a) => {
        const icon = a.status === 'running' ? ui.tone('accent', ui.spinner(now + a.name.length * 37))
          : a.status === 'failed' ? ui.tone('fail', '✖') : a.status === 'cancelled' ? ui.dim('◌') : ui.tone('ok', '✔');
        const verdict = modelVerdict(a.source);
        const time = a.status === 'running' ? span(now - (a.started || now)) : span(a.duration);
        // The right-hand pane has no room for counts, so a row there keeps the verdict as a glyph.
        if (compact) return [`${icon}  ${ui.bold(ui.clip(a.name, 18))}`, a.model ? ui.model(a.model, FAMILY(a.model)) : ui.dim('…'), ui.dim(time), verdict ? ui.tone(verdict.level, verdict.level === 'ok' ? '✔' : verdict.level === 'warn' ? '▲' : '○') : '', lane(ui, a, t0, t1, Math.max(8, Math.min(24, w - 60)), now)];
        return [
          `${icon}  ${ui.bold(ui.clip(a.name, 26))}`,
          a.model ? ui.model(a.model, FAMILY(a.model)) : ui.dim('…'),
          a.effort ? ui.effort(a.effort, { word: false }) : '',
          ui.dim(time),
          ui.dim(`${a.tools} tools${a.tokens ? ` · ${count(a.tokens)} tok` : ''}`),
          verdict ? ui.tone(verdict.level, `${verdict.level === 'ok' ? '✔' : verdict.level === 'warn' ? '▲' : '○'} ${verdict.text}`) : '',
          ...(laneN ? [lane(ui, a, t0, t1, laneN, now)] : []),
        ];
      });
      // A row that would run off the edge gives up lane cells first, then the lane, then the counts.
      const widest = (table, gap) => Math.max(...ui.table(table, { gap }).split('\n').map(stripLen));
      let table = build(compact);
      let gap = compact ? 2 : 3;
      if (!compact && widest(table, 3) > w) {
        const spare = laneCells - (widest(table, 3) - w);
        table = build(false, spare >= 6 ? spare : 0);
        if (widest(table, 3) > w) { table = build(true); gap = 2; }
      }
      const lines = ui.table(table, { gap }).split('\n');
      out.push(...lines);
    }
    for (const a of shownAgents.filter((x) => x.error)) out.push(`     ${ui.tone('fail', '✖')} ${ui.dim(ui.clip(`${a.name}: ${a.error}`, w - 8))}`);
    const earlier = agents.length - shownAgents.length;
    if (earlier) out.push(ui.dim(`     + ${plural(earlier, 'subagent')} from earlier tasks${ui.color ? '  ·  e shows them' : ''}`));
    out.push('');
    return out;
  };

  // Files the agents changed, with the lines added and removed where the harness recorded a patch.
  const filesBlock = (w, max = 6) => {
    // Scratch files, memory notes, and anything else outside the project fold into one count.
    const root = rootOf(state);
    const every = [...state.files.entries()];
    const files = root ? every.filter(([f]) => { const p = f.replace(/\\/g, '/').toLowerCase(); return p.startsWith(`${root}/`) || !/^([a-z]:|\/|~)/.test(p); }) : every;
    const outside = every.length - files.length;
    const repo = git && (git.changed || git.untracked) ? git : null;
    if (!every.length && !repo) return [];
    const added = files.reduce((n, [, f]) => n + f.added, 0);
    const removed = files.reduce((n, [, f]) => n + f.removed, 0);
    const lines = (a, r) => [a && `+${a}`, r && `−${r}`].filter(Boolean).join(' ');
    const stat = (f) => (f.counted ? `${f.added ? ui.tone('ok', `+${f.added}`) : ''}${f.added && f.removed ? ' ' : ''}${f.removed ? ui.tone('fail', `−${f.removed}`) : ''}` : '');
    const out = [ui.section(`files  ${files.length} changed${added || removed ? ` · ${lines(added, removed)}` : ''}`, w)];
    const colW = w >= 90 ? Math.floor((w - 4) / 2) : w - 4;
    const shown = files.slice(-max).map(([f, info]) => {
      const s = stat(info);
      const name = ui.clip(rel(f).replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/'), Math.max(12, colW - stripLen(s) - 4));
      return `${ui.tone(info.kind === 'create' ? 'ok' : 'pink', info.kind === 'create' ? '✚' : '✎')} ${name}${s ? `  ${s}` : ''}`;
    });
    if (files.length > max) out.push(ui.dim(`  ↑ ${plural(files.length - max, 'earlier file')}`));
    const perRow = colW < w - 4 ? 2 : 1;
    for (let i = 0; i < shown.length; i += perRow) out.push(`  ${perRow === 2 ? ui.pad(shown[i], colW + 2) : shown[i]}${perRow === 2 ? shown[i + 1] || '' : ''}`.trimEnd());
    if (outside) out.push(ui.dim(`  + ${outside} outside the project`));
    // Git's own count catches what the shell changed, which no edit call names.
    if (repo) out.push(`  ${ui.dim('git now')}  ${ui.dim([repo.changed && `${repo.changed} modified`, repo.untracked && `${repo.untracked} untracked`, lines(repo.added, repo.removed)].filter(Boolean).join(' · '))}`);
    out.push('');
    return out;
  };

  // Tasks: one summary line per earlier task, and the steps of the latest one; or one step opened up.
  const feedBlock = (w, room) => {
    const subNames = state.activity.filter((a) => a.agent !== 'main').map((a) => a.agent.length);
    const nameWidth = subNames.length ? Math.min(18, Math.max(...subNames)) : 0;
    const verbWidth = w >= 110 ? 24 : 19;
    const stepLine = (a) => {
      const who = nameWidth ? `${ui.pad(a.agent === 'main' ? '' : a.family ? ui.tone(a.family, ui.clip(a.agent, nameWidth)) : ui.clip(a.agent, nameWidth), nameWidth)}  ` : '';
      const verb = ui.pad(a.tool ? ui.dim(ui.clip(`${a.tool}${a.times > 1 ? ` ×${a.times}` : ''}`, verbWidth - 1)) : '', verbWidth);
      const raw = ui.clip(a.kind === 'say' ? `“${a.text}”` : rel(a.text), Math.max(10, w - nameWidth - verbWidth - 21));
      const text = a.kind === 'fail' ? ui.tone('fail', raw) : a.kind === 'say' ? ui.dim(raw) : raw;
      const mark = a.key === view.selected ? `   ${ui.tone('accent', '▶')} ` : '     ';
      const line = `${mark}${ui.dim(clock(a.at))}  ${who}${a.tone ? ui.tone(a.tone, a.icon) : a.icon}  ${verb}${text}`;
      return a.key === view.selected ? ui.bold(line) : line;
    };
    // Every task line puts its counts in one right-hand column, as wide as the widest of them.
    const factsOf = (t, i) => {
      const isLatest = i === state.tasks.length - 1;
      return [plural(t.tools, 'tool'), t.agents && plural(t.agents, 'agent'), t.files.size && plural(t.files.size, 'file'), t.errors && plural(t.errors, 'error'), span((t.endAt || (isLatest && !state.ended ? now : t.at)) - t.at)].filter(Boolean).join(' · ');
    };
    const factsWidth = Math.min(44, Math.max(0, ...state.tasks.map((t, i) => factsOf(t, i).length)));
    const taskLine = (t, i, open) => {
      const isLatest = i === state.tasks.length - 1;
      const icon = isLatest ? glyph(state) : t.broke ? ui.tone('fail', '✖') : ui.tone('ok', '✔');
      const tf = ui.clip(factsOf(t, i), factsWidth);
      const prompt = t.prompt ? `“${t.prompt}”` : 'before the first prompt';
      const lead = `  ${ui.dim(open ? '▾' : '▸')} ${icon} ${ui.dim(clock(t.at).slice(0, 5))}  `;
      const promptRoom = Math.max(12, w - stripLen(lead) - factsWidth - 4);
      const shown = ui.clip(prompt, promptRoom);
      const styled = !t.prompt ? ui.dim(shown) : open ? ui.bold(shown) : shown;
      const tinted = t.errors ? tf.replace(plural(t.errors, 'error'), ui.tone('fail', plural(t.errors, 'error'))) : tf;
      return `${lead}${styled}${' '.repeat(promptRoom - stripLen(shown) + 2)}${ui.dim(' '.repeat(factsWidth - tf.length))}${ui.dim(tinted)}`;
    };

    const out = [ui.section(view.layer === 'detail' ? 'step' : `tasks  ${state.tasks.length}`, w)];
    if (view.layer === 'detail') return [...out, ...detail(selectable(state, view.expand, view.story).find((s) => s.key === view.selected), w, room - 1)];
    if (!state.tasks.length) return [...out, ui.dim('  waiting for the agent…')];
    if (view.expand) {
      const items = [];
      let focus = null;
      state.tasks.forEach((t, i) => {
        items.push(taskLine(t, i, true));
        for (const s of stepsOf(state, i, view.story)) { if (s.key === view.selected) focus = items.length; items.push(stepLine(s)); }
      });
      return [...out, ...windowed(items, room - 1, focus, ui, '  ', 'line')];
    }
    const last = state.tasks.length - 1;
    let older = state.tasks.slice(0, last).map((t, i) => taskLine(t, i, false));
    const steps = stepsOf(state, last, view.story);
    // Earlier tasks keep at most a third of the room; the latest task's steps get the rest.
    const olderRoom = Math.min(older.length, Math.max(1, Math.floor(room / 3)));
    if (older.length > olderRoom) older = [ui.dim(`  ↑ ${plural(older.length - olderRoom + 1, 'earlier task')}`), ...older.slice(older.length - olderRoom + 1)];
    const stepRoom = Math.max(1, room - 1 - older.length - 1);
    const focus = steps.findIndex((s) => s.key === view.selected);
    return [...out, ...older, taskLine(state.tasks[last], last, true), ...windowed(steps.map(stepLine), stepRoom, focus < 0 ? null : focus, ui, '     ', 'step')];
  };

  // One step opened up: what ran, who ran it, how it ended, its full target, and its output or diff.
  const detail = (step, w, room) => {
    if (!step) return [ui.dim('  nothing selected · ↑↓ picks a step')];
    const e = step.latest || step;
    const out = [];
    const took = e.end && e.at ? span(e.end - e.at) : e.kind === 'fail' || e.kind === 'say' ? '' : state.running.has(e.call) ? `running ${span(now - e.at)}` : '';
    out.push(`  ${e.tone ? ui.tone(e.tone, e.icon) : e.icon}  ${ui.bold(e.tool || e.kind)}${step.times > 1 ? ui.dim(` ×${step.times}, showing the latest`) : ''}   ${ui.dim([e.agent, clock(e.at), took].filter(Boolean).join(' · '))}`);
    if (e.error) out.push(`     ${ui.tone('fail', `✖ ${e.error}`)}`);
    // A folded run lists each call, newest last, before the latest one's output.
    if (step.times > 1) {
      const calls = step.calls.slice(-10);
      out.push('', `  ${ui.dim(step.calls.length > calls.length ? `calls  the last ${calls.length} of ${step.calls.length}` : 'calls')}`);
      for (const c of calls) out.push(`    ${ui.dim(clock(c.at))}  ${ui.clip(rel(c.text), w - 18)}`);
    }
    const body = (label, text, tone) => {
      if (!text) return;
      out.push('', `  ${ui.dim(label)}`);
      for (const l of String(text).split('\n').flatMap((line) => wrapText(rel(line), w - 6))) out.push(`    ${tone ? ui.tone(tone, l) : l}`);
    };
    body(e.kind === 'say' ? 'said' : e.kind === 'agent' ? 'brief' : e.kind === 'done' ? 'last words' : 'target', e.full || (e.kind === 'say' ? e.text : ''));
    if (e.patch) {
      out.push('', `  ${ui.dim('diff')}  ${ui.tone('ok', `+${e.patch.added}`)} ${ui.tone('fail', `−${e.patch.removed}`)}`);
      const tones = { '+': 'ok', '-': 'fail', '@': 'info' };
      for (const l of e.patch.lines) out.push(`    ${tones[l[0]] ? ui.tone(tones[l[0]], ui.clip(l, w - 6)) : ui.dim(ui.clip(l, w - 6))}`);
    } else if (e.output) body(e.kind === 'fail' ? 'error output' : 'output', e.output);
    if (out.length > room) return [...out.slice(0, room - 1), ui.dim(`    … ${plural(out.length - room + 1, 'more line')}`)];
    return out;
  };

  // Assemble: stacked when narrow, two panes when wide. The screen shows rows - 1 lines, and the
  // footer keeps at least one blank line above it.
  const bodyRows = Math.max(8, rows - 1 - head.length - footer.length - 1);
  if (!wide) {
    // An opened step gets the whole body; esc brings the rest back.
    if (view.layer === 'detail') return finish(feedBlock(width, bodyRows));
    // Files sit under the feed, as they always have; the agent blocks go above it.
    const above = [...agentBlock(width), ...subagentBlock(width)];
    const files = filesBlock(width);
    const room = Math.max(5, bodyRows - above.length - (files.length ? files.length + 1 : 0));
    return finish([...above, ...feedBlock(width, room), ...(files.length ? ['', ...files] : [])]);
  }
  const leftW = Math.floor(width * 0.58);
  const rightW = width - leftW - 3;
  const right = [...agentBlock(rightW), ...subagentBlock(rightW, true), ...filesBlock(rightW, 12)];
  const leftLines = feedBlock(leftW, bodyRows);
  const height = pin ? bodyRows : Math.max(leftLines.length, right.length);
  const body = [];
  for (let i = 0; i < height; i += 1) {
    const l = ui.fit(leftLines[i] || '', leftW);
    const r = ui.fit(right[i] || '', rightW + 2);
    body.push(`${l}${' '.repeat(Math.max(0, leftW - stripLen(l)))} ${ui.dim('│')}${r}`.trimEnd());
  }
  return finish(body);
}

// Every key and glyph on one screen.
function help(ui, width, many) {
  const rows = [
    ['↑ ↓  j k', 'select a step'],
    ['⏎', 'open it: the full command, its output, the diff, or what was said'],
    ['g  G', 'first step · back to following the newest'],
    ['esc', 'step back'],
    ['s', 'story: only what was said, who was spawned, and what broke'],
    ['e', 'open every task, not just the latest'],
    ...(many ? [['tab  ← →', 'next and previous session'], ['1-9', 'jump to a session'], ['o', 'every session as a card']] : []),
    ['b', 'ring the bell when a session hands back to you'],
    ['n', 'raise a desktop notification then too'],
    ['q', 'quit'],
  ].map(([k, what]) => [ui.bold(k), ui.dim(what)]);
  const marks = [
    [ui.tone('accent', ui.spinner(0)), 'working'], [ui.tone('warn', '●'), 'your turn, with how long it has waited'],
    [ui.tone('fail', '▲'), 'failed three times in a row, or went quiet'], [ui.dim('■'), 'ended'],
    [ui.tone('ok', '✔'), 'the subagent ran on its role\'s model'], [ui.tone('warn', '▲'), 'it fell back to the session model'],
  ].map(([m, what]) => [m, ui.dim(what)]);
  return [ui.section('keys', width), ...ui.table(rows, { indent: 4 }).split('\n'), '', ui.section('marks', width), ...ui.table(marks, { indent: 4 }).split('\n'), '',
    ui.dim('    tblock watch --replay plays a session back · --session=<id> pins one · --once prints a snapshot')];
}

// Every session at once, one card each: what it's doing, its context, and anything wrong.
function overview(tabs, active, ui, { now, width, glyph, contextLine, relTo }) {
  const perRow = Math.max(1, Math.floor((width - 2) / 44));
  const cardW = Math.floor((width - 2) / perRow) - 2;
  const names = tabNames(tabs.map((t) => t.state));
  const cards = tabs.map((t, i) => {
    const s = t.state;
    const title = names[i].label ? `${names[i].name} · ${names[i].label}` : names[i].name;
    const rel = relTo(s);
    const p = phase(s);
    const doing = [...s.running.values()].filter((r) => r.agent === 'main' && r.kind !== 'agent').at(-1);
    const bad = trouble(s, now);
    const lines = [
      `${s.id === active.id ? ui.tone('accent', '▸') : ' '}${ui.bold(`${i + 1}`)} ${glyph(s, i * 53)} ${ui.bold(ui.clip(title, cardW - 6))}`,
      `   ${s.model ? ui.model(s.model, FAMILY(s.model)) : ui.dim('model unknown')}  ${ui.dim(`${p}${p === 'working' ? ` ${span(now - (s.tasks.at(-1)?.at || now))}` : p === 'your turn' ? ` ${span(now - (s.idleSince || now))}` : ''}`)}`,
      `   ${contextLine(s, 12) || ui.dim('no context yet')}`,
      `   ${doing ? `${ui.tone('accent', '→')} ${doing.name} ${ui.dim(ui.clip(rel(doing.target), cardW - doing.name.length - 8))}` : s.says ? ui.dim(ui.clip(`“${s.says.text.replace(/\s+/g, ' ')}”`, cardW - 4)) : ui.dim('…')}`,
      `   ${bad ? ui.tone(bad.level, ui.clip(`▲ ${bad.text}`, cardW - 4)) : ui.dim([plural(s.tools, 'tool'), s.agents.size && plural(s.agents.size, 'agent'), s.files.size && plural(s.files.size, 'file'), s.cost >= 0.005 && `≈ ${money(s.cost)}`].filter(Boolean).join(' · '))}`,
    ];
    return lines.map((l) => ui.fit(l, cardW));
  });
  const out = [ui.section(`overview  ${plural(tabs.length, 'session')}`, width)];
  for (let i = 0; i < cards.length; i += perRow) {
    const row = cards.slice(i, i + perRow);
    for (let line = 0; line < 5; line += 1) out.push(`  ${row.map((c) => `${c[line]}${' '.repeat(Math.max(0, cardW - stripLen(c[line])))}`).join('  ')}`.trimEnd());
    out.push('');
  }
  return out;
}

// Every session from both harnesses, newest first.
function allSessions(copilotHome, claudeHome) {
  const copilot = listSessions(sessionsDir(copilotHome)).map((x) => ({ ...x, dir: sessionsDir(copilotHome) }));
  return [...copilot, ...listClaudeSessions(claudeProjectsDir(claudeHome))].sort((a, b) => b.mtime - a.mtime);
}

const fresh = (s) => {
  const state = createState(s.id, s.harness === 'copilot' ? workspaceName(s.dir, s.id) : null);
  state.harness = s.harness;
  return state;
};
const sourceOf = (s) => (s.harness === 'copilot' ? createReader(s.log) : createClaudeSource(s));

// A session's events, read incrementally: Copilot's log as is, Claude Code's translated.
function open(s) {
  const state = fresh(s);
  const read = sourceOf(s);
  return { id: s.id, state, pull: () => read().forEach((e) => applyEvent(state, e)) };
}

// The sessions a viewer would see right now, read once: for a snapshot, and for trying a layout out.
export function snapshot({ copilotHome, claudeHome, prefix = null, now = Date.now() }) {
  const list = allSessions(copilotHome, claudeHome);
  const first = prefix ? list.find((s) => s.id.startsWith(prefix)) : list[0];
  if (!first) return null;
  const tabs = [first, ...list.filter((s) => s !== first && now - s.mtime < LIVE_MS)].slice(0, MAX_TABS).map((s) => { const v = open(s); v.pull(); return v; });
  return { active: tabs[0], tabs, git: tabs[0].state.cwd ? repoStateSync(tabs[0].state.cwd) : null };
}

// A finished log played back on a virtual clock: seek anywhere, and the state is the fold up to then.
export function createReplay(events, makeState) {
  const timed = events.map((e) => ({ e, t: Date.parse(e.timestamp) })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const t0 = timed[0]?.t ?? Date.now();
  const t1 = timed.at(-1)?.t ?? t0;
  const marks = timed.filter((x) => x.e.type === 'user.message' && !x.e.agentId).map((x) => x.t);
  let state = makeState();
  let i = 0;
  let at = t0;
  const seek = (t) => {
    const target = Math.max(t0, Math.min(t1, t));
    if (target < at) { state = makeState(); i = 0; }
    while (i < timed.length && timed[i].t <= target) applyEvent(state, timed[i++].e);
    at = target;
    return state;
  };
  seek(t0);
  return {
    t0, t1, marks, seek,
    get at() { return at; },
    get state() { return state; },
    // When the next event lands, so playback can skip a long quiet stretch.
    next: () => timed[i]?.t ?? null,
  };
}

// The OS command that shows a desktop notification, or null where there is none to use.
export function notifyCommand(platform, title, body) {
  const t = String(title).slice(0, 80);
  const b = String(body).replace(/\s+/g, ' ').slice(0, 180);
  if (platform === 'win32') {
    const q = (s) => s.replace(/'/g, "''");
    const script = [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
      '$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
      `$x.GetElementsByTagName('text').Item(0).AppendChild($x.CreateTextNode('${q(t)}')) | Out-Null`,
      `$x.GetElementsByTagName('text').Item(1).AppendChild($x.CreateTextNode('${q(b)}')) | Out-Null`,
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($x))",
    ].join('; ');
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]];
  }
  if (platform === 'darwin') return ['osascript', ['-e', `display notification ${JSON.stringify(b)} with title ${JSON.stringify(t)}`]];
  if (platform === 'linux') return ['notify-send', [t, b]];
  return null;
}

function notify(title, body) {
  const cmd = notifyCommand(process.platform, title, body);
  if (!cmd) return;
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref(); } catch { /* no notifier; the bell still works */ }
}

// A session counts as live while its log changed in the last half hour; at most nine get tabs.
const LIVE_MS = 30 * 60 * 1000;
const MAX_TABS = 9;
const SPEEDS = [1, 2, 5, 10, 30, 60, 120];

// Full-screen terminal: alternate buffer, hidden cursor, restored on exit.
function screen(env) {
  const write = (s) => process.stdout.write(s);
  // Windows Terminal shows a progress ring on the tab while the session on screen is working.
  const progress = (on) => (env.WT_SESSION ? `\x1b]9;4;${on ? '3;0' : '0;0'}\x07` : '');
  write('\x1b[?1049h\x1b[?25l');
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    write(`${progress(false)}\x1b]0;\x07\x1b[?25h\x1b[?1049l`);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // A resize leaves the old frame's edges on screen, so clear before the next draw.
  process.stdout.on('resize', () => write('\x1b[2J'));
  const keys = (fn) => {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (buf) => fn(buf.toString()));
  };
  // Every line is trimmed to the terminal, so none wraps and pushes the frame down.
  const draw = (ui, lines, prefix = '') => {
    const { columns, rows } = process.stdout;
    write(`${prefix}\x1b[H${lines.slice(0, rows - 1).map((l) => `${ui.fit(l, columns - 1)}\x1b[K`).join('\n')}\x1b[J`);
  };
  return { write, progress, stop, keys, draw };
}

// Runs the live view, a replay, or prints one snapshot when output isn't a terminal or --once is given.
export async function watch({ ui, copilotHome, claudeHome, version, session, once, replay, env = process.env }) {
  const sessions = () => allSessions(copilotHome, claudeHome);
  const prefix = session || (typeof replay === 'string' ? replay : null);
  const first = prefix ? sessions().find((s) => s.id.startsWith(prefix)) : sessions()[0];
  if (!first) {
    throw new Error(prefix
      ? `no Copilot or Claude Code session starting "${prefix}" in ${sessionsDir(copilotHome)} or ${claudeProjectsDir(claudeHome)}`
      : `no Copilot or Claude Code sessions yet (looked in ${sessionsDir(copilotHome)} and ${claudeProjectsDir(claudeHome)}). Start a chat in Claude Code, Copilot CLI, or VS Code's agents window, then run tblock watch again`);
  }
  const tty = process.stdout.isTTY && ui.color;
  if (replay) {
    if (!tty) throw new Error('watch --replay needs a terminal; --once prints a snapshot instead');
    return playBack(first, { ui, version, env });
  }

  // Tabs keep the order sessions were first seen in, so they don't shuffle while you read them.
  const views = new Map();
  const add = (s) => { if (!views.has(s.id)) { const v = open(s); v.pull(); views.set(s.id, v); } return views.get(s.id); };
  let active = add(first);
  // Liveness goes by when a log last changed on disk, not by the times written inside it.
  const refreshTabs = (list, now) => {
    const changed = new Map(list.map((s) => [s.id, s.mtime]));
    for (const [id, v] of views) if (v !== active && !(now - (changed.get(id) || 0) < LIVE_MS)) views.delete(id);
    for (const s of list) if (now - s.mtime < LIVE_MS && views.size < MAX_TABS) add(s);
  };
  const initial = sessions();
  refreshTabs(initial, Date.now());
  const tabs = () => [...views.values()];

  if (once || !tty) {
    const git = active.state.cwd ? repoStateSync(active.state.cwd) : null;
    process.stdout.write(`${render(active.state, ui, { cols: process.stdout.columns || Number(env.COLUMNS) || 100, rows: 1000, following: !session, once: true, version, tabs: tabs(), expand: true, git }).join('\n')}\n`);
    return;
  }

  // Git's view of the folder on screen, asked again every few seconds without holding up a frame.
  const repos = new Map();
  const askGit = (cwd, now) => {
    const was = repos.get(cwd);
    if (!cwd || (was && now - was.asked < 5000)) return;
    repos.set(cwd, { ...was, asked: now });
    repoState(cwd, (state) => repos.set(cwd, { asked: repos.get(cwd).asked, state }));
  };

  const term = screen(env);
  let view = initialView();
  const show = (v) => { active = v; term.write('\x1b[2J'); };
  term.keys((key) => {
    const list = tabs();
    const { view: next, act } = onKey(view, key, { steps: selectable(active.state, view.expand, view.story), tabs: list.length });
    view = next;
    if (act === 'quit') term.stop();
    else if (act === 'clear') term.write('\x1b[2J');
    else if (act === 'tab:+1' || act === 'tab:-1') show(list[(list.indexOf(active) + (act === 'tab:+1' ? 1 : -1) + list.length) % list.length]);
    else if (act?.startsWith('tab:')) show(list[Number(act.slice(4))]);
  });

  // Sessions that already exist never take over the view: several run at once, and the newest-written
  // one changes every few seconds. A session that starts after watch does takes over; switch with tab.
  const known = new Set(initial.map((s) => s.id));
  const wasBusy = new Map();
  let lastTitle = '';
  let lastBusy = null;
  let tick = 0;
  setInterval(() => {
    const now = Date.now();
    for (const v of views.values()) v.pull();
    if (++tick % 10 === 0) {
      const list = sessions();
      refreshTabs(list, now);
      const fresher = session ? null : list.find((s) => !known.has(s.id));
      for (const s of list) known.add(s.id);
      if (fresher) { view = { ...view, layer: view.layer === 'overview' ? 'overview' : 'feed', selected: null }; show(add(fresher)); }
    }
    // A session that just finished its turn is waiting on you: ring the bell, or raise a notification.
    let ring = false;
    for (const v of views.values()) {
      if (wasBusy.get(v.id) && phase(v.state) === 'your turn') {
        ring = true;
        if (view.notify) notify(`tblock · ${ui.clip(sessionLabel(v.state), 60)}`, v.state.says?.text || 'Your turn');
      }
      wasBusy.set(v.id, v.state.busy);
    }
    // The window title counts what every session is doing, so it reads at a glance from another tab.
    const all = tabs().map((v) => phase(v.state));
    const working = all.filter((x) => x === 'working').length;
    const waiting = all.filter((x) => x === 'your turn').length;
    const stuck = tabs().filter((v) => trouble(v.state, now)).length;
    const title = `tblock watch · ${[working && `${working} working`, waiting && `${waiting} your turn`, stuck && `${stuck} need a look`].filter(Boolean).join(' · ') || 'quiet'}`;
    const { columns, rows } = process.stdout;
    askGit(active.state.cwd, now);
    const lines = render(active.state, ui, { now, cols: columns, rows, following: !session, version, tabs: tabs(), view, pin: true, git: repos.get(active.state.cwd)?.state });
    const busy = active.state.busy;
    term.draw(ui, lines, `${title !== lastTitle ? `\x1b]0;${title}\x07` : ''}${busy !== lastBusy ? term.progress(busy) : ''}${ring && view.bell ? '\x07' : ''}`);
    lastTitle = title;
    lastBusy = busy;
  }, 100);
}

// Plays a recorded session back: space pauses, arrows seek, [ ] jump between prompts, + - change speed.
function playBack(s, { ui, version, env }) {
  const events = sourceOf(s)();
  const rp = createReplay(events, () => fresh(s));
  const term = screen(env);
  let view = initialView();
  let playing = true;
  let speed = 10;
  term.keys((key) => {
    const t = rp.at;
    if (key === ' ') { playing = !playing; if (playing && t >= rp.t1) rp.seek(rp.t0); return; }
    if (key === '\x1b[C' || key === '\x1b[D') { rp.seek(t + (key === '\x1b[C' ? 30e3 : -30e3)); term.write('\x1b[2J'); return; }
    if (key === ']') { rp.seek(rp.marks.find((m) => m > t) ?? rp.t1); term.write('\x1b[2J'); return; }
    if (key === '[') { rp.seek([...rp.marks].reverse().find((m) => m < t - 1000) ?? rp.t0); term.write('\x1b[2J'); return; }
    if (key === '+' || key === '=') { speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]; return; }
    if (key === '-' || key === '_') { speed = SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]; return; }
    const { view: next, act } = onKey(view, key, { steps: selectable(rp.state, view.expand, view.story), tabs: 1 });
    view = next;
    if (act === 'quit') term.stop();
    else if (act === 'clear') term.write('\x1b[2J');
  });
  let last = Date.now();
  setInterval(() => {
    const real = Date.now();
    if (playing) {
      let t = rp.at + (real - last) * speed;
      // A quiet stretch longer than 20 seconds of session time plays as two.
      const next = rp.next();
      if (next && next - rp.at > 20e3 && t < next - 2e3) t = Math.max(t, next - 2e3);
      rp.seek(t);
      if (rp.at >= rp.t1) playing = false;
    }
    last = real;
    const { columns, rows } = process.stdout;
    const lines = render(rp.state, ui, { now: rp.at, cols: columns, rows, following: false, version, view, pin: true, replay: { playing, speed, t0: rp.t0, t1: rp.t1, marks: rp.marks } });
    term.draw(ui, lines);
  }, 100);
}
