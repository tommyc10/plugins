#!/usr/bin/env node
// Builds the delegate agent for both harnesses from skills/tblock-mode/delegate.md, so the agent
// starts with its brief already in its instructions and never has to find and read a file first.
// Run after editing delegate.md; the validator fails when the agent files are out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTMATTER = `---
name: delegate
description: "Worker for one bounded job inside a tblock-mode run: a code change, a fix, or a helper task. The agent running tblock-mode keeps the playbook and spawns a fresh delegate for each job; never use a delegate to run tblock-mode itself. It carries tblock's delegate brief, and ends with a fixed report of what it changed, checked, and left unchecked."
---
`;

const WHERE = `Your brief gives the absolute path of tblock-mode's SKILL.md. A principle named below in backticks is the SKILL.md in the folder of that name, beside the tblock-mode folder. With no path in the brief, look for \`skills/tblock-mode/\` under the installed plugins (\`~/.copilot/installed-plugins/\` in GitHub Copilot, \`~/.claude/plugins/cache/\` in Claude Code) and use the highest tblock version. Don't follow the playbook, subagent, or reply rules in tblock-mode's SKILL.md. They are for your parent.`;

export function delegateAgents(root) {
  const brief = readFileSync(join(root, 'skills/tblock-mode/delegate.md'), 'utf8').replace(/\r\n/g, '\n');
  // A link can't resolve from an agent file, so a principle is named by its folder instead.
  const body = brief
    .replace(/\[([^\]]+)\]\(\.\.\/(principle-[a-z0-9-]+)\/SKILL\.md\)/g, '$1 (`$2`)')
    .replace(/\[tblock-mode\]\(SKILL\.md\)/g, "tblock-mode's SKILL.md")
    .replace(/^(# tblock delegate\n\n[^\n]+\n)/, `$1\n${WHERE}\n`);
  if (/\]\((?!https?:)/.test(body)) throw new Error('skills/tblock-mode/delegate.md has a local link build-agents.mjs does not rewrite');
  const text = `${FRONTMATTER}\n${body.trimEnd()}\n\n<!-- Built from skills/tblock-mode/delegate.md by scripts/build-agents.mjs. Edit that file, then rebuild. -->\n`;
  return { 'agents/delegate.md': text, 'com.github.copilot/agents/delegate.agent.md': text };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const [path, text] of Object.entries(delegateAgents(root))) {
    writeFileSync(join(root, path), text);
    console.log(`built ${path}`);
  }
}
