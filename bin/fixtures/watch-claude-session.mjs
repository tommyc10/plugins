// Writes a Claude Code session for tests of tblock watch: a slash-command prompt, a few main-agent
// tools, one subagent spawned with a model (its own transcript and meta file), and one without.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const win = (...parts) => ['C:', ...parts].join(String.fromCharCode(92));

export const CLAUDE_DEMO_ID = 'c1aude00-0000-4000-8000-000000000000';

// `trouble` adds an MCP call, a compaction, and three failing test runs in a row before the reply.
export function claudeSessionRecords({ start = Date.parse('2026-11-07T15:00:00Z'), finished = true, trouble = false } = {}) {
  let t = start;
  const at = (s = 1) => new Date((t += s * 1000)).toISOString();
  const base = { cwd: win('work', 'dashboard'), gitBranch: 'feature/alerts', sessionId: CLAUDE_DEMO_ID, isSidechain: false };
  const usage = (input, output) => ({ input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: output });
  const reply = (id, content, stop, extra = {}) => ({ ...base, type: 'assistant', timestamp: at(), effort: 'high', message: { id, model: 'claude-opus-5-5', role: 'assistant', stop_reason: stop, content, usage: usage(100, 50) }, ...extra });
  const result = (id, extra = {}) => ({ ...base, type: 'user', timestamp: at(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, ...extra });
  const file = win('work', 'dashboard', 'src', 'alerts', 'AlertsPage.tsx');
  const sub = (agentId, s) => ({ cwd: base.cwd, sessionId: CLAUDE_DEMO_ID, isSidechain: true, agentId, timestamp: at(s) });

  const main = [
    { type: 'custom-title', customTitle: '$tblock:tblock-mode add a severity filter', sessionId: CLAUDE_DEMO_ID },
    { ...base, type: 'user', timestamp: at(0), turnOrigin: 'human', message: { role: 'user', content: '<command-message>tblock:tblock-mode</command-message>\n<command-name>/tblock:tblock-mode</command-name>\n<command-args>add a severity filter</command-args>' } },
    { ...base, type: 'user', timestamp: at(), isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: …' }] } },
    reply('m1', [{ type: 'thinking', thinking: '' }], 'tool_use'),
    reply('m1', [{ type: 'tool_use', id: 't1', name: 'Grep', input: { pattern: 'severity' } }], 'tool_use'),
    result('t1'),
    reply('m2', [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'Add the filter', subagent_type: 'tblock:delegate', model: 'sonnet', prompt: '…' } }], 'tool_use'),
  ];
  const coder = [
    { ...sub('agent1', 1), type: 'user', message: { role: 'user', content: '…' } },
    { ...sub('agent1', 1), type: 'assistant', effort: 'medium', message: { id: 's1', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'st1', name: 'Edit', input: { file_path: file } }], usage: usage(10, 5) } },
    { ...sub('agent1', 1), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'st1', content: 'ok' }] }, toolUseResult: { filePath: file, structuredPatch: [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 4, lines: [' const rows = alerts;', '-const shown = rows;', '+const [severity, setSeverity] = useState("all");', '+const shown = rows.filter((a) => severity === "all" || a.severity === severity);', '+// filtered by severity'] }] } },
    { ...sub('agent1', 1), type: 'assistant', effort: 'medium', message: { id: 's2', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }], usage: usage(10, 5) } },
  ];
  main.push(
    result('a1', { timestamp: at(), toolUseResult: { status: 'completed', agentId: 'agent1', resolvedModel: 'claude-sonnet-5-5', totalDurationMs: 42000, totalTokens: 31000, totalToolUseCount: 1 } }),
    reply('m3', [{ type: 'tool_use', id: 'a2', name: 'Agent', input: { description: 'Review the filter', subagent_type: 'general-purpose', prompt: '…' } }], 'tool_use'),
    result('a2', { toolUseResult: { status: 'completed', agentId: 'agent2', resolvedModel: 'claude-opus-5-5', totalDurationMs: 9000, totalTokens: 12000, totalToolUseCount: 0 } }),
    // The thinking block carries the reply's end_turn before its text lands.
    reply('m4', [{ type: 'thinking', thinking: '' }], 'end_turn'),
  );
  if (trouble) {
    main.push(
      reply('m5', [{ type: 'tool_use', id: 'mcp1', name: 'mcp__t3-code__t3_background_wait', input: { taskId: 'b1' } }], 'tool_use'),
      result('mcp1'),
      { ...base, type: 'system', subtype: 'compact_boundary', timestamp: at(), compactMetadata: { preTokens: 820000, postTokens: 41000 } },
    );
    for (const n of [1, 2, 3]) {
      main.push(
        reply(`m6${n}`, [{ type: 'tool_use', id: `b${n}`, name: 'Bash', input: { command: 'npm test -- alerts' } }], 'tool_use'),
        { ...base, type: 'user', timestamp: at(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `b${n}`, is_error: true, content: 'Exit code 1\n> vitest run alerts\nFAIL src/alerts/AlertsPage.test.tsx\nAssertionError: expected 3 rows, got 5' }] } },
      );
    }
  }
  if (finished) main.push(reply('m4', [{ type: 'text', text: 'Added the filter. The severity tests still fail on the empty state.\nShould I keep the old empty-state copy, or use the new one from the design?' }], 'end_turn'));
  return { main, subagents: { agent1: { records: coder, meta: { agentType: 'tblock:delegate', toolUseId: 'a1', model: 'sonnet', finished: true } } } };
}

const jsonl = (records) => `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;

export function writeClaudeSession(claudeHome, records = claudeSessionRecords()) {
  const folder = join(claudeHome, 'projects', 'C--work-dashboard');
  mkdirSync(join(folder, CLAUDE_DEMO_ID, 'subagents'), { recursive: true });
  writeFileSync(join(folder, `${CLAUDE_DEMO_ID}.jsonl`), jsonl(records.main));
  for (const [id, { records: lines, meta }] of Object.entries(records.subagents)) {
    writeFileSync(join(folder, CLAUDE_DEMO_ID, 'subagents', `agent-${id}.jsonl`), jsonl(lines));
    writeFileSync(join(folder, CLAUDE_DEMO_ID, 'subagents', `agent-${id}.meta.json`), JSON.stringify(meta));
  }
  return { folder, id: CLAUDE_DEMO_ID };
}
