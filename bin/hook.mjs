#!/usr/bin/env node
// tblock's guard: the two hooks the plugin ships. Both do nothing until `tblock guard on`.
//   hook.mjs session-start <harness>   tells a new session its roles and what the repo has set up
//   hook.mjs pre-tool <harness>        has the harness ask the user before a command that leaves the machine
// A hook must never break a session, so every failure exits 0 and says nothing. Node built-ins only.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outwardAction } from './outward.mjs';
import { formatEntry, readRoles } from './roles.mjs';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = [['probe.json', 'logs'], ['tickets.json', 'ticket labels'], ['grafana.json', 'Grafana']];

function readInput() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

// The shell command a tool call would run, whatever the harness calls the tool and its argument.
export function commandOf(input = {}) {
  const args = input.tool_input || input.toolInput || input.arguments || {};
  return [args.command, args.cmd, args.script].find((v) => typeof v === 'string') || '';
}

export function preTool(input, file) {
  if (!file?.meta.guard) return null;
  const action = outwardAction(commandOf(input));
  if (!action) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `tblock guard: "${action}" leaves this machine. tblock always pauses for that, so this one is yours to approve.`,
    },
  };
}

export function sessionStart(input, file, harness, root = PLUGIN) {
  if (!file?.meta.guard) return null;
  const roles = file.harnesses[harness]?.roles || {};
  const lines = [`tblock ${JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).version} is installed at ${root}. Its mode is ${join(root, 'skills', 'tblock-mode', 'SKILL.md')}.`];
  const set = Object.entries(roles).map(([name, entries]) => `${name}: ${entries.map(formatEntry).join(', ')}`);
  lines.push(set.length
    ? `tblock roles for this harness${file.meta.preset ? ` (preset ${file.meta.preset})` : ''}. ${set.join('. ')}. A role not listed runs on the session model. This is the roles file's content, so tblock-mode need not read it again.`
    : 'tblock has no roles for this harness, so every subagent runs on the session model.');
  const cwd = input.cwd || process.cwd();
  const have = PROJECT.filter(([f]) => existsSync(join(cwd, '.tblock', f))).map(([, label]) => label);
  const missing = PROJECT.map(([, label]) => label).filter((label) => !have.includes(label));
  if (have.length) lines.push(`This repo's .tblock folder sets up ${have.join(', ')}${missing.length ? `, and not ${missing.join(' or ')}` : ''}.`);
  lines.push('tblock guard is on: the harness asks the user before a push, a PR or MR, a ticket, or a publish. That prompt is the user\'s yes for that one command. Still name the action and why before you run it.');
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } };
}

// Matched by name, since a harness may spell this script's path with other slashes or drive-letter case.
if (basename(process.argv[1] || '') === 'hook.mjs') {
  try {
    const [event, harness = 'claude-code'] = process.argv.slice(2);
    const file = readRoles(homedir());
    const input = readInput();
    const out = event === 'pre-tool' ? preTool(input, file) : event === 'session-start' ? sessionStart(input, file, harness) : null;
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* stay silent */ }
}
