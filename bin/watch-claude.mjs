// Claude Code sessions for `tblock watch`. Claude Code writes one transcript per session at
// ~/.claude/projects/<project>/<id>.jsonl, and one per subagent at <id>/subagents/agent-<agentId>.jsonl
// beside a .meta.json that names the Agent call that spawned it. This file turns those records into
// the events watch.mjs already folds (the Copilot runtime's names), so both harnesses share one view.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createReader } from './watch.mjs';

export function claudeProjectsDir(claudeHome) {
  return join(claudeHome, 'projects');
}

// Sessions in every project, newest first, by when their transcript last changed.
export function listClaudeSessions(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const project of readdirSync(dir)) {
    const folder = join(dir, project);
    let names;
    try { names = readdirSync(folder); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const log = join(folder, name);
      out.push({ id: name.slice(0, -'.jsonl'.length), log, folder, harness: 'claude-code', mtime: statSync(log).mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// "<command-name>/x</command-name><command-args>y</command-args>" reads as "/x y".
function promptText(content) {
  const text = typeof content === 'string' ? content : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1];
  const shown = name ? `${name} ${text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] || ''}` : text;
  return shown.replace(/\s+/g, ' ').trim();
}

const contextOf = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

// Reads a Claude Code session and its subagents; each call returns the new events, oldest first.
export function createClaudeSource(session) {
  const main = createReader(session.log);
  const subDir = join(session.folder, session.id, 'subagents');
  const subs = new Map(); // agentId -> { read, meta, call, configured }
  const agentCalls = new Map(); // Agent tool_use id -> its input
  const seenMessages = new Set();
  let started = false;
  let branch = null;
  let mainModel = null;

  const translate = (r, sub) => {
    const at = r.timestamp;
    const ev = (type, data) => ({ type, data, timestamp: at, ...(sub && { agentId: sub.call }) });
    const out = [];
    if (!sub && !started && at && r.cwd) {
      started = true;
      out.push(ev('session.start', { startTime: at, context: { cwd: r.cwd, branch: r.gitBranch || null } }));
      branch = r.gitBranch;
    }
    // Every record carries the branch, so a checkout mid-session shows up.
    if (!sub && started && r.gitBranch && r.gitBranch !== branch) {
      branch = r.gitBranch;
      out.push(ev('session.branch', { branch }));
    }
    // A session started from a slash command is titled "$skill args".
    if (r.type === 'custom-title' && !sub) out.push(ev('session.title_changed', { title: String(r.customTitle || '').replace(/^\$/, '/') }));
    if (r.type === 'user' && !r.isMeta) {
      const content = r.message?.content;
      const results = Array.isArray(content) ? content.filter((b) => b.type === 'tool_result') : [];
      for (const b of results) {
        const input = agentCalls.get(b.tool_use_id);
        const res = r.toolUseResult;
        if (!sub && input && res && typeof res === 'object' && res.status !== 'async_launched') {
          const failed = b.is_error || res.status === 'failed' || res.status === 'error';
          out.push(ev(failed ? 'subagent.failed' : 'subagent.completed', {
            toolCallId: b.tool_use_id, model: res.resolvedModel, durationMs: res.totalDurationMs,
            totalToolCalls: res.totalToolUseCount, totalTokens: res.totalTokens,
            cancelled: res.status === 'cancelled' || res.status === 'killed',
            modelSelectionSource: input.model ? 'explicit_override' : res.resolvedModel && mainModel && res.resolvedModel !== mainModel ? 'agent_definition_default' : 'session_inheritance',
            error: failed ? promptText(b.content).slice(0, 200) || 'failed' : undefined,
          }));
        }
        out.push(ev('tool.execution_complete', { toolCallId: b.tool_use_id, success: !b.is_error }));
      }
      if (!results.length && !sub && !r.isSidechain && r.turnOrigin !== undefined) {
        out.push(ev('user.message', { content: promptText(content) }), ev('assistant.turn_start', {}));
      }
    }
    if (r.type === 'assistant' && r.message) {
      const m = r.message;
      if (!sub) {
        if (r.effort) out.push(ev('session.effort', { effort: r.effort }));
        if (m.model && m.model !== '<synthetic>') mainModel = m.model;
      } else if (!sub.configured && m.model) {
        sub.configured = true;
        out.push(ev('subagent.configured', { model: m.model, reasoningEffort: r.effort || null }));
      }
      if (m.id && m.usage && !seenMessages.has(m.id)) {
        seenMessages.add(m.id);
        out.push(ev('session.usage_record', {
          usage: { inputTokens: (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), outputTokens: m.usage.output_tokens || 0, model: m.model },
          contextTokens: contextOf(m.usage),
        }));
      }
      for (const b of m.content || []) {
        if (b.type !== 'tool_use') continue;
        out.push(ev('tool.execution_start', { toolCallId: b.id, toolName: b.name, arguments: b.input }));
        if (b.name === 'Agent' || b.name === 'Task') {
          agentCalls.set(b.id, b.input || {});
          if (!sub) out.push(ev('subagent.started', { toolCallId: b.id, agentName: b.input?.description || b.input?.subagent_type || 'subagent', agentDisplayName: b.input?.subagent_type, model: b.input?.model || null, modelSelectionSource: b.input?.model ? 'explicit_override' : null }));
        }
      }
      // One reply is split into a record per block, each carrying the reply's stop reason, so the
      // thinking block says end_turn before the text has arrived; only a later block ends the turn.
      const blocks = (m.content || []).map((b) => b.type);
      if (!sub && m.stop_reason === 'end_turn' && blocks.some((t) => t !== 'thinking' && t !== 'redacted_thinking')) out.push(ev('assistant.turn_end', {}), ev('session.idle', {}));
      else if (!sub && m.stop_reason) out.push(ev('session.busy', {}));
    }
    return out;
  };

  // A background subagent's Agent call returns at launch; its meta file says when it finished.
  const finish = (sub, at) => {
    if (sub.finished || !sub.meta?.finished) return [];
    sub.finished = true;
    return [{ type: 'subagent.completed', data: { toolCallId: sub.call }, timestamp: at, agentId: sub.call }];
  };

  return () => {
    const events = [];
    for (const r of main()) if (!r.isSidechain) events.push(...translate(r, null));
    if (existsSync(subDir)) {
      for (const name of readdirSync(subDir)) {
        const m = name.match(/^agent-(.+)\.jsonl$/);
        if (!m) continue;
        let sub = subs.get(m[1]);
        if (!sub) {
          const metaFile = join(subDir, `agent-${m[1]}.meta.json`);
          if (!existsSync(metaFile)) continue;
          let meta;
          try { meta = JSON.parse(readFileSync(metaFile, 'utf8')); } catch { continue; }
          if (!meta.toolUseId) continue;
          sub = { read: createReader(join(subDir, name)), metaFile, meta, call: meta.toolUseId, configured: false, finished: false };
          subs.set(m[1], sub);
        }
        let last = null;
        for (const r of sub.read()) { if (r.timestamp) last = r.timestamp; events.push(...translate(r, sub)); }
        if (!sub.finished && agentCalls.get(sub.call)?.run_in_background) {
          try { sub.meta = JSON.parse(readFileSync(sub.metaFile, 'utf8')); } catch { /* half-written; next tick */ }
          events.push(...finish(sub, last || new Date().toISOString()));
        }
      }
    }
    // Main and subagent logs interleave in time; fold them in the order they happened.
    return events.map((e, i) => ({ e, i, t: Date.parse(e.timestamp) || 0 })).sort((a, b) => a.t - b.t || a.i - b.i).map(({ e }) => e);
  };
}

