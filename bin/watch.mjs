// `tblock watch`: a live view of a Copilot agent session, read from the event log the Copilot runtime
// writes for the CLI and VS Code's agents window (~/.copilot/session-state/<id>/events.jsonl).
// It shows the main agent, each subagent with its model and effort, whether the role's model was
// honoured, every tool call, and the files changed. Node built-ins only.
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FAMILY = (model = '') => (/claude|opus|sonnet|haiku|fable/i.test(model) ? 'claude' : /gpt|codex/i.test(model) ? 'gpt' : /gemini/i.test(model) ? 'gemini' : null);

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

// What a tool call acted on, from the first argument that names a target.
function targetOf(args = {}) {
  for (const key of ['path', 'file_path', 'filePath', 'command', 'pattern', 'query', 'url', 'skill', 'description', 'agent_type', 'title']) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key].replace(/\s+/g, ' ').trim();
  }
  if (Array.isArray(args.paths) && args.paths.length) return args.paths.join(', ');
  return '';
}

// How Copilot chose a subagent's model: honoured the role, inherited the session's, or picked its own.
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
    .map((id) => ({ id, log: join(dir, id, 'events.jsonl') }))
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
    model: null, auto: false, busy: false, turns: 0, tools: 0, tokens: 0, premium: 0, context: null, prompt: null,
    agents: new Map(), byCall: new Map(), running: new Map(), activity: [], files: new Map(), errors: 0, last: null,
  };
}

const agentOf = (state, e) => (e.agentId && state.agents.get(e.agentId)) || null;

// Folds one event into the state. Unknown events are ignored, so new runtime versions don't break it.
export function applyEvent(state, e) {
  const d = e.data || {};
  const at = e.timestamp ? Date.parse(e.timestamp) : null;
  if (at) state.last = at;
  const who = agentOf(state, e);
  const log = (entry) => state.activity.push({ at, agent: who?.name || (e.agentId ? `agent ${e.agentId.slice(0, 6)}` : 'main'), family: who ? FAMILY(who.model) : null, ...entry });
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
    case 'session.title_changed':
      state.title = d.title || state.title;
      break;
    case 'user.message':
      if (!e.agentId) { state.prompt = (d.content || '').replace(/\s+/g, ' ').trim(); log({ kind: 'you', icon: '›', tone: 'accent', text: state.prompt }); }
      break;
    case 'assistant.turn_start':
      if (who) who.busy = true; else { state.busy = true; state.turns += 1; }
      break;
    case 'assistant.turn_end':
      if (!who) state.busy = state.running.size > 0;
      break;
    case 'session.idle':
      state.busy = false;
      break;
    case 'session.usage_record': {
      const u = d.usage || {};
      state.tokens += (u.inputTokens || 0) + (u.outputTokens || 0);
      if (!who && u.model) state.model = u.model;
      if (who && u.model && !who.model) who.model = u.model;
      break;
    }
    case 'session.usage_checkpoint':
      state.premium = d.totalPremiumRequests ?? state.premium;
      break;
    case 'tool.execution_start': {
      const [kind, , icon, tone] = kindOf(d.toolName || '');
      const target = targetOf(d.arguments);
      state.running.set(d.toolCallId, { agent: who?.name || 'main', kind, name: d.toolName, target, at });
      state.tools += 1;
      if (who) who.tools += 1;
      if (/edit|create/.test(kind) && target) state.files.set(target, kind);
      if (kind !== 'agent') log({ kind, icon, tone, tool: d.toolName, text: target });
      break;
    }
    case 'tool.execution_complete': {
      const call = state.running.get(d.toolCallId);
      state.running.delete(d.toolCallId);
      const ctx = d.toolTelemetry?.metrics?.context_current_tokens;
      if (ctx && !who) state.context = ctx;
      if (d.success === false && call) { state.errors += 1; log({ kind: 'fail', icon: '✖', tone: 'fail', tool: call.name, text: `${call.target || call.name} failed` }); }
      break;
    }
    case 'subagent.started': {
      const agent = { key: e.agentId || d.toolCallId, name: d.agentName || d.agentDisplayName || 'subagent', display: d.agentDisplayName, model: d.model || null, effort: null, source: d.modelSelectionSource || null, status: 'running', started: at, duration: null, tools: 0, tokens: null, error: null, busy: true };
      state.agents.set(agent.key, agent);
      state.byCall.set(d.toolCallId, agent);
      state.activity.push({ at, agent: 'main', family: null, kind: 'agent', icon: '⑂', tone: 'accent', tool: 'spawn', text: `${agent.name}${agent.model ? ` on ${agent.model}` : ''}` });
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
      state.activity.push({ at, agent: agent.name, family: FAMILY(agent.model), kind: agent.status === 'failed' ? 'fail' : 'done', icon: agent.status === 'failed' ? '✖' : '✔', tone: agent.status === 'failed' ? 'fail' : 'ok', tool: agent.status, text: agent.error || `${agent.tools} tool calls` });
      break;
    }
    case 'session.error':
      state.errors += 1;
      log({ kind: 'fail', icon: '✖', tone: 'fail', tool: 'error', text: d.message || d.errorType });
      break;
    case 'session.shutdown':
      state.ended = true;
      state.endedAt = at;
      state.busy = false;
      for (const f of d.codeChanges?.filesModified || []) if (!state.files.has(f)) state.files.set(f, 'edit');
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
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

// Draws the whole screen as lines, fitted to the terminal; the activity feed takes the rows left over.
export function render(state, ui, { now = Date.now(), cols = 100, rows = 40, following = true, version = '' } = {}) {
  const width = Math.max(40, Math.min(cols - 1, 120));
  const out = [];
  // Paths inside the project print relative to it.
  const root = (state.cwd || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const rel = (text) => {
    const norm = String(text || '').replace(/\\/g, '/');
    return root && norm.toLowerCase().startsWith(`${root}/`) ? norm.slice(root.length + 1) : ui.tildify(text || '');
  };
  const live = !state.ended && now - (state.last || 0) < 10 * 60 * 1000;
  const elapsed = state.started ? (state.ended ? state.endedAt : now) - state.started : null;

  // Header: wordmark, session title, where it runs, and a live or ended badge.
  const badge = state.ended ? ui.dim('■ ended') : live ? ui.tone('ok', `${ui.color ? '●' : '*'} live`) : ui.dim('○ quiet');
  const left = `  ${ui.bold(ui.color ? ui.tone('accent', 'tblock') : 'tblock')} ${ui.dim('›')} ${ui.bold('watch')}  ${badge}`;
  const right = ui.dim(`${span(elapsed)}${version ? `  v${version}` : ''}`);
  out.push('', `${left}${' '.repeat(Math.max(2, width - stripLen(left) - stripLen(right) - 2))}${right}`);
  // Copilot names an untitled session after its prompt, which the task line already shows.
  const titled = state.title && !(state.prompt || '').startsWith(state.title.replace(/…$/, '').slice(0, 40));
  const where = [titled && state.title, state.cwd && ui.tildify(state.cwd), state.branch && `⎇ ${state.branch}`].filter(Boolean).join('  ·  ');
  out.push(`  ${ui.dim(ui.clip(where || state.id, width - 4))}`, '');

  // The main agent: what it's doing now.
  out.push(ui.section('agent', width));
  const mainRun = [...state.running.values()].filter((r) => r.agent === 'main' && r.kind !== 'agent');
  const mainIcon = state.busy ? ui.tone('accent', ui.spinner(now)) : state.ended ? ui.dim('■') : ui.tone('ok', '✔');
  const mainModel = state.model ? ui.model(state.model, FAMILY(state.model)) : ui.dim('model unknown');
  const stats = [`turn ${state.turns}`, `${state.tools} tools`, state.context && `${count(state.context)} context`, state.tokens && `${count(state.tokens)} tokens`].filter(Boolean).join('  ·  ');
  out.push(`  ${mainIcon}  ${ui.bold('main')}   ${mainModel}${state.auto ? ui.dim(' (auto)') : ''}   ${ui.dim(stats)}`);
  if (state.prompt) out.push(`     ${ui.dim('task')}  ${ui.clip(state.prompt, width - 14)}`);
  for (const r of mainRun.slice(-2)) out.push(`     ${ui.tone('accent', '→')} ${ui.bold(r.name)}  ${ui.dim(ui.clip(rel(r.target), width - 12 - r.name.length))}`);
  out.push('');

  // Subagents: model, effort, time, and whether Copilot honoured the role's model.
  const agents = [...state.agents.values()];
  if (agents.length) {
    out.push(ui.section(`subagents  ${agents.filter((a) => a.status === 'running').length} running · ${agents.length} total`, width));
    const rowsOut = agents.map((a) => {
      const icon = a.status === 'running' ? ui.tone('accent', ui.spinner(now + a.name.length * 37))
        : a.status === 'failed' ? ui.tone('fail', '✖') : a.status === 'cancelled' ? ui.dim('◌') : ui.tone('ok', '✔');
      const verdict = modelVerdict(a.source);
      const time = a.status === 'running' ? span(now - (a.started || now)) : span(a.duration);
      return [
        `${icon}  ${ui.bold(ui.clip(a.name, 26))}`,
        a.model ? ui.model(a.model, FAMILY(a.model)) : ui.dim('…'),
        a.effort ? ui.effort(a.effort, { word: false }) : '',
        ui.dim(time),
        ui.dim(`${a.tools} tools${a.tokens ? ` · ${count(a.tokens)} tok` : ''}`),
        verdict ? ui.tone(verdict.level, `${verdict.level === 'ok' ? '✔' : verdict.level === 'warn' ? '▲' : '○'} ${verdict.text}`) : '',
      ];
    });
    out.push(ui.table(rowsOut, { gap: 3 }));
    for (const a of agents.filter((x) => x.error)) out.push(`     ${ui.tone('fail', '✖')} ${ui.dim(ui.clip(`${a.name}: ${a.error}`, width - 8))}`);
    out.push('');
  }

  // Files the agents changed.
  const files = [...state.files.entries()];
  const footer = [];
  if (files.length) {
    footer.push(ui.section(`files  ${files.length} changed`, width));
    const shown = files.slice(-6).map(([f, kind]) => `${ui.tone(kind === 'create' ? 'ok' : 'pink', kind === 'create' ? '✚' : '✎')} ${ui.clip(rel(f).replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/'), 38)}`);
    for (let i = 0; i < shown.length; i += 2) footer.push(`  ${ui.pad(shown[i], 44)}${shown[i + 1] || ''}`);
    footer.push('');
  }
  const keys = ui.dim(`  ${following ? 'following the newest session' : `session ${state.id.slice(0, 8)}`}  ·  ${state.premium ? `${state.premium} premium  ·  ` : ''}${state.errors ? `${state.errors} errors  ·  ` : ''}q to quit`);
  footer.push(keys);

  // Activity fills what's left, newest at the bottom.
  const lineCount = (list) => list.reduce((n, line) => n + String(line).split('\n').length, 0);
  // Leaves room for the activity heading, the blank line above the footer, and the last screen row.
  const room = Math.max(3, rows - lineCount(out) - lineCount(footer) - 3);
  out.push(ui.section('activity', width));
  const nameWidth = Math.min(22, Math.max(4, ...state.activity.slice(-room).map((a) => a.agent.length)));
  const feed = state.activity.slice(-room).map((a) => {
    const agent = ui.pad(a.family ? ui.tone(a.family, ui.clip(a.agent, nameWidth)) : a.agent === 'main' ? ui.dim('main') : ui.clip(a.agent, nameWidth), nameWidth);
    const verb = ui.pad(a.tool ? ui.dim(ui.clip(a.tool, 11)) : '', 13);
    const text = ui.clip(a.kind === 'you' ? `“${a.text}”` : rel(a.text), Math.max(10, width - nameWidth - 30));
    return `  ${ui.dim(clock(a.at))}  ${agent}  ${a.tone ? ui.tone(a.tone, a.icon) : a.icon}  ${verb}${a.kind === 'fail' ? ui.tone('fail', text) : text}`;
  });
  if (!feed.length) feed.push(ui.dim('  waiting for the agent…'));
  out.push(...feed, '', ...footer);
  // Tables come back as one multi-line string; split them so each line is fitted on its own.
  return out.flatMap((line) => String(line).split('\n'));
}

const stripLen = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;

// Runs the live view, or prints one snapshot when output isn't a terminal or --once is given.
export async function watch({ ui, copilotHome, version, session, once }) {
  const dir = sessionsDir(copilotHome);
  const pick = () => (session ? listSessions(dir).find((s) => s.id.startsWith(session)) : listSessions(dir)[0]);
  let current = pick();
  if (!current) {
    throw new Error(session ? `no Copilot session starting "${session}" in ${dir}` : `no Copilot sessions in ${dir} yet. Start a chat in Copilot CLI or VS Code's agents window, then run tblock watch again`);
  }
  let state = createState(current.id, workspaceName(dir, current.id));
  let read = createReader(current.log);
  const pull = () => read().forEach((e) => applyEvent(state, e));
  pull();

  const tty = process.stdout.isTTY && ui.color;
  if (once || !tty) {
    process.stdout.write(`${render(state, ui, { cols: process.stdout.columns || 100, rows: 1000, following: !session, version }).join('\n')}\n`);
    return;
  }

  // Full-screen: alternate buffer, hidden cursor, redraw in place, restore on exit.
  const write = (s) => process.stdout.write(s);
  write('\x1b[?1049h\x1b[?25l');
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    write('\x1b[?25h\x1b[?1049l');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => { if (['q', 'Q', '\x03', '\x1b'].includes(key.toString())) stop(); });
  }

  // A resize leaves the old frame's edges on screen, so clear before the next draw.
  process.stdout.on('resize', () => write('\x1b[2J'));
  let tick = 0;
  setInterval(() => {
    pull();
    // Every second, follow a newer session if one has started.
    if (!session && ++tick % 10 === 0) {
      const newest = pick();
      if (newest && newest.id !== current.id) {
        current = newest;
        state = createState(current.id, workspaceName(dir, current.id));
        read = createReader(current.log);
        pull();
      }
    }
    const { columns, rows } = process.stdout;
    const lines = render(state, ui, { cols: columns, rows, following: !session, version });
    // Every line is trimmed to the terminal, so none wraps and pushes the frame down.
    write(`\x1b[H${lines.slice(0, rows - 1).map((l) => `${ui.fit(l, columns - 1)}\x1b[K`).join('\n')}\x1b[J`);
  }, 100);
}
