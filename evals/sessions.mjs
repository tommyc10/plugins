// Reads real GitHub Copilot sessions into the trace shape rules.mjs scores, from both places Copilot keeps them:
// VS Code's Chat panel (<Code>/User/workspaceStorage/<hash>/chatSessions/*.jsonl, an operation log) and the
// Copilot CLI or VS Code's agents window (~/.copilot/session-state/<id>/events.jsonl). Node built-ins only.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createReader, listSessions, sessionsDir } from '../bin/watch.mjs';

// Each harness's tool names, mapped to the canonical names the rules use.
const CANONICAL = {
  Read: ['read_file', 'view', 'read', 'copilot_readFile'],
  Edit: ['replace_string_in_file', 'multi_replace_string_in_file', 'insert_edit_into_file', 'edit_file', 'edit_notebook_file', 'edit', 'str_replace', 'str_replace_editor', 'apply_patch'],
  Write: ['create_file', 'create', 'write'],
  Bash: ['run_in_terminal', 'powershell', 'bash', 'shell'],
  Skill: ['skill'],
  Agent: ['task', 'runSubagent', 'run_subagent'],
};
const CANONICAL_OF = new Map(Object.entries(CANONICAL).flatMap(([name, raws]) => raws.map((raw) => [raw.toLowerCase(), name])));

export function normalizeTool(raw, args = {}) {
  const name = CANONICAL_OF.get(String(raw).toLowerCase()) || raw;
  const file = args.filePath || args.file_path || args.path;
  return { name, raw, input: { ...args, ...(file ? { file_path: String(file) } : {}), ...(args.command ? { command: String(args.command) } : {}) } };
}

const parseArgs = (a) => { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return {}; } };
const SKILL_PATH = /[\\/]skills[\\/]([a-z0-9-]+)[\\/]SKILL\.md$/i;

function finish(run) {
  run.reply = run.texts.filter((t) => t.main).at(-1)?.text ?? '';
  for (const t of run.tools) {
    if (t.name === 'Skill' && t.input.skill) run.skills.add(String(t.input.skill).replace(/^tblock:/, ''));
    const m = t.name === 'Read' && String(t.input.file_path || '').match(SKILL_PATH);
    if (m) run.skills.add(m[1]);
  }
  const slash = run.prompt?.match(/^\/(?:tblock:)?([a-z0-9-]+)/);
  if (slash) run.skills.add(slash[1]);
  run.tblock = run.skills.has('tblock-mode');
  run.edits = run.tools.filter((t) => t.main && (t.name === 'Edit' || t.name === 'Write')).length;
  return run;
}

const newRun = (harness, id) => ({ harness, id, title: null, cwd: null, repo: null, branch: null, headCommit: null, started: null, last: null, prompt: null, messages: [], followUps: 0, model: null, premium: null, tokens: { input: 0, output: 0 }, tools: [], texts: [], skills: new Set() });

// VS Code's Chat panel log: line 0 is a snapshot, then kind 1 sets the value at path k, and kind 2 splices v into the array at k from index i.
export function replayChatLog(text) {
  let state = null;
  const at = (path) => path.reduce((o, k) => o?.[k], state);
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.kind === 0) state = e.v;
    else if (!state) continue;
    else if (e.kind === 1) { const parent = at(e.k.slice(0, -1)); if (parent) parent[e.k.at(-1)] = e.v; } else if (e.kind === 2) {
      const list = at(e.k);
      if (Array.isArray(list)) { if (e.i === undefined) list.push(...e.v); else list.splice(e.i, list.length - e.i, ...e.v); }
    } else if (e.kind === 3) { const parent = at(e.k.slice(0, -1)); if (parent) delete parent[e.k.at(-1)]; }
  }
  return state;
}

export function chatSessionToRun(session, { id, folder } = {}) {
  const run = newRun('vscode-chat', id || session.sessionId);
  run.title = session.customTitle || null;
  run.cwd = folder || null;
  let order = 0;
  const requests = (session.requests || []).filter((r) => r.message?.text);
  requests.forEach((r, i) => {
    if (i === 0) run.prompt = r.message.text.trim();
    run.messages.push(r.message.text);
    run.started ??= r.timestamp || session.creationDate || null;
    run.last = r.result?.timings?.totalElapsed ? r.timestamp + r.result.timings.totalElapsed : r.timestamp || run.last;
    run.model = String(r.modelId || run.model || '').replace(/^copilot\//, '') || null;
    const multiplier = String(r.result?.details || '').match(/(\d+(?:\.\d+)?)x\s*$/);
    if (multiplier) run.premium = (run.premium || 0) + Number(multiplier[1]);
    const meta = r.result?.metadata || {};
    run.tokens.input += meta.promptTokens || 0;
    run.tokens.output += meta.outputTokens || 0;
    for (const round of meta.toolCallRounds || []) {
      if (round.response?.trim()) { order += 1; run.texts.push({ order, main: true, text: round.response }); }
      for (const call of round.toolCalls || []) { order += 1; run.tools.push({ order, main: true, ...normalizeTool(call.name, parseArgs(call.arguments)) }); }
    }
  });
  run.followUps = Math.max(0, requests.length - 1);
  return finish(run);
}

const folderOf = (workspaceDir) => {
  const file = join(workspaceDir, 'workspace.json');
  if (!existsSync(file)) return null;
  const uri = JSON.parse(readFileSync(file, 'utf8')).folder;
  if (!uri?.startsWith('file://')) return uri || null;
  try { return fileURLToPath(uri); } catch { return null; }
};

export function codeUserDir(env = process.env) {
  if (env.TBLOCK_CODE_USER) return env.TBLOCK_CODE_USER;
  if (process.platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code', 'User');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Code', 'User');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Code', 'User');
}

export function readChatSessions(userDir, since) {
  const runs = [];
  const storage = join(userDir, 'workspaceStorage');
  const dirs = existsSync(storage) ? readdirSync(storage).map((d) => join(storage, d)) : [];
  dirs.push(join(userDir, 'globalStorage', 'emptyWindowChatSessions'));
  for (const dir of dirs) {
    const chats = basename(dir) === 'emptyWindowChatSessions' ? dir : join(dir, 'chatSessions');
    if (!existsSync(chats)) continue;
    const folder = chats === dir ? null : folderOf(dir);
    for (const f of readdirSync(chats).filter((x) => /\.jsonl?$/.test(x))) {
      const file = join(chats, f);
      if (statSync(file).mtimeMs < since.getTime()) continue;
      let session;
      try { const text = readFileSync(file, 'utf8'); session = f.endsWith('.jsonl') ? replayChatLog(text) : JSON.parse(text); } catch { continue; }
      if (!session?.requests?.length) continue;
      const run = chatSessionToRun(session, { id: f.replace(/\.jsonl?$/, ''), folder });
      if (run.prompt) runs.push(run);
    }
  }
  return runs;
}

export function cliEventsToRun(events, id) {
  const run = newRun('copilot-cli', id);
  let order = 0;
  for (const e of events) {
    const d = e.data || {};
    const at = e.timestamp ? Date.parse(e.timestamp) : null;
    if (at) { run.started ??= at; run.last = at; }
    const main = !e.agentId;
    if (e.type === 'session.start') Object.assign(run, { cwd: d.context?.cwd || null, repo: d.context?.repository || null, branch: d.context?.branch || null, headCommit: d.context?.headCommit || null });
    if (e.type === 'user.message' && main) {
      run.messages.push(String(d.content || ''));
      if (!run.prompt) run.prompt = String(d.content || '').trim();
      else run.followUps += 1;
    }
    if (e.type === 'skill.invoked' && d.name) run.skills.add(d.name);
    if (e.type === 'session.usage_record' && d.usage) { run.tokens.input += d.usage.inputTokens || 0; run.tokens.output += d.usage.outputTokens || 0; if (main) run.model = d.usage.model || run.model; }
    if (e.type === 'session.shutdown') run.premium = d.accountingSnapshot?.totalPremiumRequestCost ?? run.premium;
    if (e.type === 'external_tool.requested' && d.toolName === 'rename_chat' && d.arguments?.title) run.title = d.arguments.title;
    if (e.type === 'assistant.message') {
      if (String(d.content || '').trim()) { order += 1; run.texts.push({ order, main, text: d.content }); }
      for (const t of d.toolRequests || []) { order += 1; run.tools.push({ order, main, ...normalizeTool(t.name, parseArgs(t.arguments)) }); }
    }
  }
  return finish(run);
}

export function readCliSessions(copilotHome, since) {
  return listSessions(sessionsDir(copilotHome)).filter((s) => s.mtime >= since.getTime()).flatMap((s) => {
    const run = cliEventsToRun(createReader(s.log)(), s.id);
    return run.prompt ? [run] : [];
  });
}

export function readAllSessions({ since, copilotHome = join(homedir(), '.copilot'), userDir = codeUserDir() }) {
  return [...readChatSessions(userDir, since), ...readCliSessions(copilotHome, since)].sort((a, b) => (b.started || 0) - (a.started || 0));
}

// The Chat panel records no commit, so take the last commit on HEAD before the session started. Good while that history is intact.
export function baseCommitFor(run) {
  if (run.headCommit) return { commit: run.headCommit, estimated: false };
  if (!run.cwd || !existsSync(run.cwd) || !run.started) return { commit: null, estimated: true };
  const r = spawnSync('git', ['-C', run.cwd, 'rev-list', '-1', `--before=${Math.floor(run.started / 1000)}`, 'HEAD'], { encoding: 'utf8' });
  return { commit: r.status === 0 ? r.stdout.trim() || null : null, estimated: true };
}
