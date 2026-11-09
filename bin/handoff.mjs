// `tblock handoff`: a brief of one agent session, read from its transcript and the repo as it stands,
// so another session, the other harness, or a person can pick the work up. Node built-ins only.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readClaudeRuns, readCopilotRuns } from './log.mjs';
import { HARNESS_NAME } from './roles.mjs';

const samePath = (a, b) => String(a || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === String(b || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const clip = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()} […]` : text);
const stamp = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : 'unknown');

function git(cwd, ...args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

// What the repo holds now, which the transcript can't know: the branch may have moved since.
function repoState(run) {
  if (!run.cwd || git(run.cwd, 'rev-parse', '--show-toplevel') === null) return null;
  const since = run.started ? new Date(run.started).toISOString() : null;
  return {
    branch: git(run.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'),
    uncommitted: (git(run.cwd, 'status', '--short') || '').split('\n').filter(Boolean),
    commits: since ? (git(run.cwd, 'log', `--since=${since}`, '--format=%h %s') || '').split('\n').filter(Boolean) : [],
  };
}

export function pickRun(runs, { session, cwd, current }) {
  const newest = (list) => [...list].sort((a, b) => (b.last || 0) - (a.last || 0))[0] || null;
  if (session) {
    const hits = runs.filter((r) => r.id.startsWith(session));
    if (!hits.length) throw new Error(`no session id starts with "${session}". Run tblock log to see recent sessions.`);
    return newest(hits);
  }
  // The session asking for the brief is the one picking up, never the one handed off.
  const others = runs.filter((r) => r.id !== current);
  const pick = newest(others.filter((r) => samePath(r.cwd, cwd)));
  if (!pick) throw new Error(`no earlier session in ${cwd} in the last 30 days. Name one with --session=<id prefix>; tblock log lists them.`);
  return pick;
}

export function brief(run, repo) {
  const first = run.prompts[0]?.text || run.prompt || '';
  // A compaction writes its summary as a user message; the user never typed it.
  const later = run.prompts.slice(1).filter((p) => !p.text.startsWith('This session is being continued from a previous conversation'));
  const reply = (run.reply || '').trim();
  const waiting = reply.split('\n').map((l) => l.trim()).filter(Boolean).at(-1)?.endsWith('?');
  const agents = Object.entries(Object.groupBy(run.agents, (a) => `${a.name}${a.model ? ` on ${a.model}` : ''}`)).map(([k, list]) => (list.length > 1 ? `${k} ×${list.length}` : k));
  const out = [
    `# Handoff: ${clip((run.title || first || run.id).replace(/\s+/g, ' '), 80)}`,
    '',
    `- **Session.** ${HARNESS_NAME[run.harness] || run.harness} \`${run.id}\`, ${stamp(run.started)} to ${stamp(run.last)} UTC.`,
    `- **Folder.** \`${run.cwd || 'unknown'}\`${run.branch ? `, on \`${run.branch}\` when it ran` : ''}.`,
    `- **Transcript.** \`${run.path}\`. Read it for anything this brief leaves out.`,
    '',
    '## The task',
    '',
    clip(first, 2000) || '_No prompt recorded._',
  ];
  if (later.length) {
    out.push('', '## What the user said after', '', 'Each line is a later message. They are directives the task picked up along the way, so they bind the pickup too.', '');
    for (const p of later) out.push(`- ${stamp(p.at).slice(11)} ${clip(p.text, 400)}`);
  }
  out.push('', '## Where it stopped', '', waiting ? 'The last reply ends in a question, so the session was waiting on the user.' : 'The last reply, as the session left it.', '', reply ? clip(reply, 4000) : '_No reply recorded._');
  if (run.files.size) out.push('', '## Files the session changed', '', ...[...run.files].sort().map((f) => `- \`${f}\``));
  if (agents.length) out.push('', '## Subagents it ran', '', ...agents.map((a) => `- ${a}`));
  if (run.links.size) out.push('', '## MRs and PRs it named', '', ...[...run.links].map((l) => `- ${l}`));
  out.push('', '## The repo now', '');
  if (!repo) out.push('_The folder is not a git repository, or no longer exists._');
  else {
    out.push(`- **Branch.** \`${repo.branch}\`${run.branch && repo.branch !== run.branch ? `. The session ran on \`${run.branch}\`, so check out that branch before trusting the rest.` : '.'}`);
    out.push(`- **Commits since the session started.** ${repo.commits.length || 'None'}${repo.commits.length ? ':' : '.'}`, ...repo.commits.slice(0, 30).map((c) => `  - ${c}`));
    out.push(`- **Uncommitted.** ${repo.uncommitted.length || 'Nothing'}${repo.uncommitted.length ? ':' : '.'}`, ...repo.uncommitted.slice(0, 40).map((c) => `  - \`${c.trim()}\``));
  }
  out.push('', 'The transcript says what the session claimed. The repo section says what is on disk. Where they disagree, the repo is right.', '');
  return out.join('\n');
}

export function handoff({ json, flags, cwd, claudeHome, copilotHome, now = new Date(), env = process.env }) {
  const unknown = flags.filter((f) => !f.startsWith('--session=') && !f.startsWith('--out='));
  if (unknown.length) throw new Error(`handoff takes --session=<id prefix> and --out=<file>, not ${unknown.join(' ')}`);
  const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);
  const since = new Date(now - 30 * 864e5);
  const runs = [...readClaudeRuns(claudeHome, since), ...readCopilotRuns(copilotHome, since)];
  const run = pickRun(runs, { session: flag('session'), cwd, current: env.CLAUDE_CODE_SESSION_ID });
  const repo = repoState(run);
  if (json) return `${JSON.stringify({ ...run, links: [...run.links], files: [...run.files], usage: Object.fromEntries(run.usage), repo }, null, 2)}\n`;
  const text = brief(run, repo);
  if (!flag('out')) return text;
  writeFileSync(flag('out'), text);
  return `Wrote the handoff brief to ${flag('out')}\n`;
}
