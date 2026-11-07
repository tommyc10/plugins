// `tblock watch`: a live view of Copilot and Claude Code agent sessions. Copilot's runtime writes an event
// log for the CLI and VS Code's agents window (~/.copilot/session-state/<id>/events.jsonl); Claude Code
// writes transcripts that watch-claude.mjs turns into the same events.
// It shows the main agent, each subagent with its model and effort, whether the role's model was
// honoured, every tool call grouped by the task it served, and the files changed. Node built-ins only.
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { claudeProjectsDir, createClaudeSource, listClaudeSessions } from './watch-claude.mjs';

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
    tasks: [], idleSince: null,
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
  state.idleSince = null;
  taskOf(state, at).endAt = null;
}

// Folds one event into the state. Unknown events are ignored, so new runtime versions don't break it.
export function applyEvent(state, e) {
  const d = e.data || {};
  const at = e.timestamp ? Date.parse(e.timestamp) : null;
  if (at) state.last = at;
  const who = agentOf(state, e);
  const log = (entry) => state.activity.push({ at, task: state.tasks.length - 1, agent: who?.name || (e.agentId ? `agent ${e.agentId.slice(0, 6)}` : 'main'), family: who ? FAMILY(who.model) : null, ...entry });
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
    case 'user.message':
      if (!e.agentId) {
        state.prompt = (d.content || '').replace(/\s+/g, ' ').trim();
        const prev = state.tasks[state.tasks.length - 1];
        if (prev && !prev.endAt) prev.endAt = at;
        state.tasks.push(newTask(state.prompt, at));
        log({ kind: 'you', icon: '›', tone: 'accent', text: state.prompt });
      }
      break;
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
      state.tokens += (u.inputTokens || 0) + (u.outputTokens || 0);
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
      const target = targetOf(d.arguments);
      const task = taskOf(state, at);
      state.running.set(d.toolCallId, { agent: who?.name || 'main', kind, name: d.toolName, target, at });
      state.tools += 1;
      task.tools += 1;
      if (who) who.tools += 1;
      if (/edit|create/.test(kind) && target) { state.files.set(target, kind); task.files.add(target); }
      if (kind !== 'agent') log({ kind, icon, tone, tool: d.toolName, text: target });
      break;
    }
    case 'tool.execution_complete': {
      const call = state.running.get(d.toolCallId);
      state.running.delete(d.toolCallId);
      const ctx = d.toolTelemetry?.metrics?.context_current_tokens;
      if (ctx && !who) state.context = ctx;
      if (d.success === false && call) {
        state.errors += 1;
        taskOf(state, at).errors += 1;
        log({ kind: 'fail', icon: '✖', tone: 'fail', tool: call.name, text: `${call.target || call.name} failed` });
      }
      break;
    }
    case 'subagent.started': {
      const agent = { key: e.agentId || d.toolCallId, name: d.agentName || d.agentDisplayName || 'subagent', display: d.agentDisplayName, model: d.model || null, effort: null, source: d.modelSelectionSource || null, status: 'running', started: at, duration: null, tools: 0, tokens: null, error: null, busy: true, task: Math.max(0, state.tasks.length - 1) };
      taskOf(state, at).agents += 1;
      state.agents.set(agent.key, agent);
      state.byCall.set(d.toolCallId, agent);
      state.activity.push({ at, task: state.tasks.length - 1, agent: 'main', family: null, kind: 'agent', icon: '⑂', tone: 'accent', tool: 'spawn', text: `${agent.name}${agent.model ? ` on ${agent.model}` : ''}` });
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
      state.activity.push({ at, task: state.tasks.length - 1, agent: agent.name, family: FAMILY(agent.model), kind: agent.status === 'failed' ? 'fail' : 'done', icon: agent.status === 'failed' ? '✖' : '✔', tone: agent.status === 'failed' ? 'fail' : 'ok', tool: agent.status, text: agent.error || plural(agent.tools, 'tool call') });
      break;
    }
    case 'session.error':
      state.errors += 1;
      taskOf(state, at).errors += 1;
      log({ kind: 'fail', icon: '✖', tone: 'fail', tool: 'error', text: d.message || d.errorType });
      break;
    case 'session.shutdown':
      settle(state, at);
      state.ended = true;
      state.endedAt = at;
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const stripLen = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;

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

// Consecutive calls of one tool by one agent fold into one line with a count, so a run of twenty
// greps reads as "Grep ×20" with the latest target, and a long task stays readable.
export function foldSteps(entries) {
  const out = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    const foldable = !['you', 'agent', 'done', 'fail'].includes(entry.kind);
    if (last && foldable && last.foldable && last.agent === entry.agent && last.tool === entry.tool) {
      last.times += 1;
      last.at = entry.at;
      last.text = entry.text;
    } else out.push({ ...entry, times: 1, foldable });
  }
  return out;
}

// Draws the whole screen as lines, fitted to the terminal; the task feed takes the rows left over.
// `tabs` lists the sessions the viewer can switch between; `expand` opens every task, not only the latest.
export function render(state, ui, { now = Date.now(), cols = 100, rows = 40, following = true, version = '', tabs = [], expand = false, bell = false } = {}) {
  const width = Math.max(40, Math.min(cols - 1, 120));
  const out = [];
  // Paths inside the project print relative to it.
  const root = (state.cwd || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const rel = (text) => {
    const norm = String(text || '').replace(/\\/g, '/');
    // Only paths (no spaces, a slash in them) get slashes swapped; commands print as they ran.
    if (root && norm.toLowerCase().startsWith(`${root}/`)) return norm.slice(root.length + 1);
    return /^\S+$/.test(norm) && norm.includes('/') ? ui.tildify(norm) : ui.tildify(text || '');
  };
  const live = !state.ended && now - (state.last || 0) < 10 * 60 * 1000;
  const elapsed = state.started ? (state.ended ? state.endedAt : now) - state.started : null;
  const glyph = (s, seed = 0) => {
    const p = phase(s);
    if (p === 'working') return ui.tone('accent', ui.spinner(now + seed));
    if (p === 'your turn') return ui.tone('warn', ui.color ? '●' : '!');
    return ui.dim(p === 'ended' ? '■' : '○');
  };

  // Header: wordmark, a live or ended badge, how long the session has run.
  const badge = state.ended ? ui.dim('■ ended') : live ? ui.tone('ok', `${ui.color ? '●' : '*'} live`) : ui.dim('○ quiet');
  const left = `  ${ui.bold(ui.color ? ui.tone('accent', 'tblock') : 'tblock')} ${ui.dim('›')} ${ui.bold('watch')}  ${badge}`;
  const right = ui.dim(`${span(elapsed)}${version ? `  v${version}` : ''}`);
  out.push('', `${left}${' '.repeat(Math.max(2, width - stripLen(left) - stripLen(right) - 2))}${right}`);

  // Session tabs: every live session with what it's doing, the one on screen highlighted.
  if (tabs.length > 1) {
    const room = Math.max(8, Math.floor((width - 4) / tabs.length) - 6);
    const cells = tabs.map((t, i) => {
      const label = `${i + 1} ${glyph(t.state, i * 53)} ${ui.clip(sessionLabel(t.state), room)}`;
      return t.state.id === state.id ? ui.bold(`${ui.tone('accent', '▸')}${label}`) : ui.dim(` ${label}`);
    });
    out.push(`  ${cells.join('  ')}`);
  }
  // Where it runs. Copilot and Claude Code name an untitled session after its prompt, which the task feed shows.
  const titled = state.title && !(state.prompt || '').startsWith(state.title.replace(/\s*(…|\.\.\.)$/, '').slice(0, 40));
  const where = [state.harness === 'claude-code' ? 'Claude Code' : 'Copilot', titled && state.title, state.cwd && ui.tildify(state.cwd), state.branch && `⎇ ${state.branch}`].filter(Boolean).join('  ·  ');
  out.push(`  ${ui.dim(ui.clip(where || state.id, width - 4))}`, '');

  // The main agent: model, effort, totals, and what it's doing right now.
  out.push(ui.section('agent', width));
  const current = state.tasks[state.tasks.length - 1];
  const mainIcon = state.busy ? ui.tone('accent', ui.spinner(now)) : state.ended ? ui.dim('■') : ui.tone('ok', '✔');
  const mainModel = state.model ? ui.model(state.model, FAMILY(state.model)) : ui.dim('model unknown');
  const stats = [`turn ${state.turns}`, `${state.tools} tools`, state.context && `${count(state.context)} context`, state.tokens && `${count(state.tokens)} tokens`].filter(Boolean).join('  ·  ');
  out.push(`  ${mainIcon}  ${ui.bold('main')}   ${mainModel}${state.auto ? ui.dim(' (auto)') : ''}${state.effort ? ` ${ui.effort(state.effort, { word: false })}` : ''}   ${ui.dim(stats)}`);
  const p = phase(state);
  const mainRun = [...state.running.values()].filter((r) => r.agent === 'main' && r.kind !== 'agent');
  if (p === 'working') {
    const doing = mainRun.at(-1);
    const head = `${ui.tone('accent', 'working')} ${ui.dim(span(now - (current?.at || now)))}`;
    out.push(`     ${head}${doing ? `   ${ui.tone('accent', '→')} ${ui.bold(doing.name)} ${ui.dim(span(now - (doing.at || now)))}  ${ui.dim(ui.clip(rel(doing.target), width - 34 - doing.name.length))}` : ''}`);
  } else if (p === 'your turn') {
    out.push(`     ${ui.tone('warn', 'your turn')} ${ui.dim(`· waiting ${span(now - (state.idleSince || now)) || '0s'}`)}`);
  }
  out.push('');

  // Subagents of the latest task, and any still running; earlier ones fold into a count.
  const agents = [...state.agents.values()];
  const latest = Math.max(0, state.tasks.length - 1);
  const shownAgents = expand ? agents : agents.filter((a) => a.task === latest || a.status === 'running');
  if (agents.length) {
    out.push(ui.section(`subagents  ${agents.filter((a) => a.status === 'running').length} running · ${agents.length} total`, width));
    if (shownAgents.length) {
      const rowsOut = shownAgents.map((a) => {
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
    }
    for (const a of shownAgents.filter((x) => x.error)) out.push(`     ${ui.tone('fail', '✖')} ${ui.dim(ui.clip(`${a.name}: ${a.error}`, width - 8))}`);
    const earlier = agents.length - shownAgents.length;
    if (earlier) out.push(ui.dim(`     + ${plural(earlier, 'subagent')} from earlier tasks${ui.color ? '  ·  e shows them' : ''}`));
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
  const facts = [
    following ? 'following new sessions' : `session ${state.id.slice(0, 8)}`,
    state.premium && `${state.premium} premium`,
    state.errors && plural(state.errors, 'error'),
  ].filter(Boolean);
  const keys = [tabs.length > 1 && 'tab/←→ switch', tabs.length > 1 && `1-${Math.min(9, tabs.length)} jump`, `e ${expand ? 'fold' : 'expand'}`, `b bell ${bell ? 'on' : 'off'}`, 'q quit'].filter(Boolean);
  footer.push(ui.dim(`  ${facts.join('  ·  ')}${ui.color ? `      ${keys.join('  ·  ')}` : ''}`));

  // Tasks fill what's left: one summary line per earlier task, and the steps of the latest one.
  const lineCount = (list) => list.reduce((n, line) => n + String(line).split('\n').length, 0);
  // Leaves room for the heading, the blank line above the footer, and the last screen row.
  const room = Math.max(4, rows - lineCount(out) - lineCount(footer) - 3);
  const subNames = state.activity.filter((a) => a.agent !== 'main').map((a) => a.agent.length);
  const nameWidth = subNames.length ? Math.min(18, Math.max(...subNames)) : 0;
  const stepLine = (a) => {
    const who = nameWidth ? `${ui.pad(a.agent === 'main' ? '' : a.family ? ui.tone(a.family, ui.clip(a.agent, nameWidth)) : ui.clip(a.agent, nameWidth), nameWidth)}  ` : '';
    const verb = ui.pad(a.tool ? ui.dim(ui.clip(`${a.tool}${a.times > 1 ? ` ×${a.times}` : ''}`, 13)) : '', 14);
    const text = ui.clip(rel(a.text), Math.max(10, width - nameWidth - 34));
    return `     ${ui.dim(clock(a.at))}  ${who}${a.tone ? ui.tone(a.tone, a.icon) : a.icon}  ${verb}${a.kind === 'fail' ? ui.tone('fail', text) : text}`;
  };
  // Every task line puts its counts in one right-hand column, as wide as the widest of them.
  const factsOf = (t, i) => {
    const isLatest = i === state.tasks.length - 1;
    return [plural(t.tools, 'tool'), t.agents && plural(t.agents, 'agent'), t.files.size && plural(t.files.size, 'file'), t.errors && plural(t.errors, 'error'), span((t.endAt || (isLatest && !state.ended ? now : t.at)) - t.at)].filter(Boolean).join(' · ');
  };
  const factsWidth = Math.min(44, Math.max(0, ...state.tasks.map((t, i) => factsOf(t, i).length)));
  const taskLine = (t, i, open) => {
    const isLatest = i === state.tasks.length - 1;
    const icon = isLatest ? glyph(state) : t.errors ? ui.tone('fail', '✖') : ui.tone('ok', '✔');
    const facts = ui.clip(factsOf(t, i), factsWidth);
    const prompt = t.prompt ? `“${t.prompt}”` : 'before the first prompt';
    const lead = `  ${ui.dim(open ? '▾' : '▸')} ${icon} ${ui.dim(clock(t.at).slice(0, 5))}  `;
    const promptRoom = Math.max(12, width - stripLen(lead) - factsWidth - 4);
    const shown = ui.clip(prompt, promptRoom);
    const styled = !t.prompt ? ui.dim(shown) : open ? ui.bold(shown) : shown;
    const tinted = t.errors ? facts.replace(plural(t.errors, 'error'), ui.tone('fail', plural(t.errors, 'error'))) : facts;
    return `${lead}${styled}${' '.repeat(promptRoom - stripLen(shown) + 2)}${ui.dim(' '.repeat(factsWidth - facts.length))}${ui.dim(tinted)}`;
  };
  const stepsOf = (i) => foldSteps(state.activity.filter((a) => a.task === i && a.kind !== 'you')).map(stepLine);

  out.push(ui.section(`tasks  ${state.tasks.length}`, width));
  const feed = [];
  if (!state.tasks.length) feed.push(ui.dim('  waiting for the agent…'));
  else if (expand) {
    state.tasks.forEach((t, i) => { feed.push(taskLine(t, i, true), ...stepsOf(i)); });
    if (feed.length > room) feed.splice(0, feed.length - room + 1, ui.dim(`  ↑ ${feed.length - room + 1} earlier lines`));
  } else {
    const last = state.tasks.length - 1;
    let older = state.tasks.slice(0, last).map((t, i) => taskLine(t, i, false));
    let steps = stepsOf(last);
    // Earlier tasks keep at most a third of the room; the latest task's newest steps get the rest.
    const olderRoom = Math.min(older.length, Math.max(1, Math.floor(room / 3)));
    if (older.length > olderRoom) older = [ui.dim(`  ↑ ${plural(older.length - olderRoom + 1, 'earlier task')}`), ...older.slice(older.length - olderRoom + 1)];
    const stepRoom = Math.max(1, room - older.length - 1);
    if (steps.length > stepRoom) steps = [ui.dim(`     ↑ ${plural(steps.length - stepRoom + 1, 'earlier step')}`), ...steps.slice(steps.length - stepRoom + 1)];
    feed.push(...older, taskLine(state.tasks[last], last, true), ...steps);
  }
  out.push(...feed, '', ...footer);
  // Tables come back as one multi-line string; split them so each line is fitted on its own.
  return out.flatMap((line) => String(line).split('\n'));
}

// Every session from both harnesses, newest first.
function allSessions(copilotHome, claudeHome) {
  const copilot = listSessions(sessionsDir(copilotHome)).map((x) => ({ ...x, dir: sessionsDir(copilotHome) }));
  return [...copilot, ...listClaudeSessions(claudeProjectsDir(claudeHome))].sort((a, b) => b.mtime - a.mtime);
}

// A session's events, read incrementally: Copilot's log as is, Claude Code's translated.
function open(s) {
  const state = createState(s.id, s.harness === 'copilot' ? workspaceName(s.dir, s.id) : null);
  state.harness = s.harness;
  const read = s.harness === 'copilot' ? createReader(s.log) : createClaudeSource(s);
  return { id: s.id, state, pull: () => read().forEach((e) => applyEvent(state, e)) };
}

// A session counts as live while its log changed in the last half hour; at most nine get tabs.
const LIVE_MS = 30 * 60 * 1000;
const MAX_TABS = 9;

// Runs the live view, or prints one snapshot when output isn't a terminal or --once is given.
export async function watch({ ui, copilotHome, claudeHome, version, session, once, env = process.env }) {
  const sessions = () => allSessions(copilotHome, claudeHome);
  const first = session ? sessions().find((s) => s.id.startsWith(session)) : sessions()[0];
  if (!first) {
    throw new Error(session
      ? `no Copilot or Claude Code session starting "${session}" in ${sessionsDir(copilotHome)} or ${claudeProjectsDir(claudeHome)}`
      : `no Copilot or Claude Code sessions yet (looked in ${sessionsDir(copilotHome)} and ${claudeProjectsDir(claudeHome)}). Start a chat in Claude Code, Copilot CLI, or VS Code's agents window, then run tblock watch again`);
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

  const tty = process.stdout.isTTY && ui.color;
  if (once || !tty) {
    process.stdout.write(`${render(active.state, ui, { cols: process.stdout.columns || 100, rows: 1000, following: !session, version, tabs: tabs(), expand: true }).join('\n')}\n`);
    return;
  }

  // Full-screen: alternate buffer, hidden cursor, redraw in place, restore on exit.
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

  let expand = false;
  let bell = false;
  const show = (v) => { active = v; write('\x1b[2J'); };
  const step = (by) => {
    const list = tabs();
    show(list[(list.indexOf(active) + by + list.length) % list.length]);
  };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (buf) => {
      const key = buf.toString();
      if (['q', 'Q', '\x03', '\x1b'].includes(key)) stop();
      else if (key === '\t' || key === '\x1b[C') step(1);
      else if (key === '\x1b[Z' || key === '\x1b[D') step(-1);
      else if (/^[1-9]$/.test(key) && tabs()[Number(key) - 1]) show(tabs()[Number(key) - 1]);
      else if (key === 'e' || key === 'E') { expand = !expand; write('\x1b[2J'); }
      else if (key === 'b' || key === 'B') bell = !bell;
    });
  }

  // A resize leaves the old frame's edges on screen, so clear before the next draw.
  process.stdout.on('resize', () => write('\x1b[2J'));
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
      const fresh = session ? null : list.find((s) => !known.has(s.id));
      for (const s of list) known.add(s.id);
      if (fresh) show(add(fresh));
    }
    // A session that just finished its turn rings the bell when it's on: it's waiting on you.
    let ring = false;
    for (const v of views.values()) {
      if (wasBusy.get(v.id) && phase(v.state) === 'your turn') ring = true;
      wasBusy.set(v.id, v.state.busy);
    }
    // The window title counts what every session is doing, so it reads at a glance from another tab.
    const all = tabs().map((v) => phase(v.state));
    const working = all.filter((x) => x === 'working').length;
    const waiting = all.filter((x) => x === 'your turn').length;
    const title = `tblock watch · ${[working && `${working} working`, waiting && `${waiting} your turn`].filter(Boolean).join(' · ') || 'quiet'}`;
    const { columns, rows } = process.stdout;
    const lines = render(active.state, ui, { now, cols: columns, rows, following: !session, version, tabs: tabs(), expand, bell });
    // Every line is trimmed to the terminal, so none wraps and pushes the frame down.
    const busy = active.state.busy;
    write(`${title !== lastTitle ? `\x1b]0;${title}\x07` : ''}${busy !== lastBusy ? progress(busy) : ''}${ring && bell ? '\x07' : ''}\x1b[H${lines.slice(0, rows - 1).map((l) => `${ui.fit(l, columns - 1)}\x1b[K`).join('\n')}\x1b[J`);
    lastTitle = title;
    lastBusy = busy;
  }, 100);
}
