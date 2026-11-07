// Writes a Copilot session log with two tblock subagents, for tests and for previewing tblock watch.
// One subagent ran on its role's model; the other fell back to the session model.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Windows paths, built from parts so no escaping can eat the backslashes.
const win = (...parts) => ['C:', ...parts].join(String.fromCharCode(92));

export const DEMO_ID = 'demo0001-0000-4000-8000-000000000000';

// The session's events as JSON lines, timed from `start` a second or few apart.
export function watchSessionEvents({ ended = true, start = Date.parse('2026-11-07T14:00:00Z') } = {}) {
  let t = start;
  const at = (s) => new Date((t += s * 1000)).toISOString();
  const ev = (type, data, extra = {}) => JSON.stringify({ type, data, id: `${type}-${t}`, timestamp: at(extra.after ?? 1), parentId: null, ...(extra.agentId && { agentId: extra.agentId }) });
  const tool = (name, args, agentId, call) => [ev('tool.execution_start', { toolCallId: call, toolName: name, arguments: args }, { agentId }), ev('tool.execution_complete', { toolCallId: call, success: true }, { agentId, after: 2 })];
  const lines = [
    ev('session.start', { startTime: new Date(start).toISOString(), selectedModel: 'auto', context: { cwd: win('work', 'dashboard'), branch: 'feature/alerts' } }, { after: 0 }),
    ev('session.auto_mode_resolved', { chosenModel: 'claude-sonnet-5.5' }),
    ev('user.message', { content: 'Add a severity filter to the alerts page and prove it in the browser' }),
    ev('assistant.turn_start', { turnId: '0' }),
    ...tool('rg', { pattern: 'severity' }, null, 'c1'),
    ...tool('view', { path: win('work', 'dashboard', 'src', 'alerts', 'AlertsPage.tsx') }, null, 'c2'),
    ev('tool.execution_start', { toolCallId: 'spawn1', toolName: 'task', arguments: { agent_type: 'tblock-code' } }),
    ev('subagent.started', { toolCallId: 'spawn1', agentName: 'tblock-code', agentDisplayName: 'tblock code', model: 'gpt-5.6-terra', modelSelectionSource: 'configured_required' }, { agentId: 'sub-code' }),
    ev('subagent.configured', { model: 'gpt-5.6-terra', reasoningEffort: 'medium', multiTurn: false }, { agentId: 'sub-code' }),
    ...tool('edit', { path: win('work', 'dashboard', 'src', 'alerts', 'AlertsPage.tsx') }, 'sub-code', 'c3'),
    ...tool('create', { path: win('work', 'dashboard', 'src', 'alerts', 'SeverityFilter.tsx') }, 'sub-code', 'c4'),
    ...tool('bash', { command: 'npm test -- alerts' }, 'sub-code', 'c5'),
    ev('subagent.completed', { toolCallId: 'spawn1', agentName: 'tblock-code', agentDisplayName: 'tblock code', model: 'gpt-5.6-terra', modelSelectionSource: 'configured_required', durationMs: 48000, totalToolCalls: 3, totalTokens: 41200 }, { agentId: 'sub-code', after: 3 }),
    ev('tool.execution_start', { toolCallId: 'spawn2', toolName: 'task', arguments: { agent_type: 'tblock-reviewers-1' } }),
    ev('subagent.started', { toolCallId: 'spawn2', agentName: 'tblock-reviewers-1', agentDisplayName: 'tblock reviewers 1', model: 'claude-sonnet-5.5', modelSelectionSource: 'session_inheritance' }, { agentId: 'sub-rev' }),
    ev('subagent.configured', { model: 'claude-sonnet-5.5', reasoningEffort: 'high', multiTurn: false }, { agentId: 'sub-rev' }),
    ...tool('view', { path: win('work', 'dashboard', 'src', 'alerts', 'SeverityFilter.tsx') }, 'sub-rev', 'c6'),
    ...tool('web_fetch', { url: 'http://localhost:5173/alerts' }, 'sub-rev', 'c7'),
  ];
  if (ended) {
    lines.push(
      ev('subagent.completed', { toolCallId: 'spawn2', agentName: 'tblock-reviewers-1', model: 'claude-sonnet-5.5', modelSelectionSource: 'session_inheritance', durationMs: 31000, totalToolCalls: 2, totalTokens: 18800 }, { agentId: 'sub-rev' }),
      ev('assistant.turn_end', { turnId: '0' }),
      ev('session.usage_checkpoint', { totalPremiumRequests: 3 }),
      ev('session.shutdown', { codeChanges: { filesModified: [win('work', 'dashboard', 'src', 'alerts', 'AlertsPage.tsx')] } }),
    );
  }
  return lines;
}

export function writeWatchSession(copilotHome, { id = DEMO_ID, lines = watchSessionEvents() } = {}) {
  const dir = join(copilotHome, 'session-state', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'events.jsonl'), lines.length ? `${lines.join('\n')}\n` : '');
  writeFileSync(join(dir, 'workspace.yaml'), `id: ${id}\nname: Alerts severity filter\n`);
  return { dir, id };
}
