// Scores one eval run from what `claude plugin eval --keep-temp` leaves behind:
// out/trace.jsonl (the stream-json trace) and home/cwd (the files after the run).
// Node built-ins only, like the rest of tblock.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { OUTWARD } from '../bin/outward.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const IGNORED_DIRS = new Set(['.git', '.origin.git', 'node_modules']);

export function parseTrace(text) {
  const tools = [];
  const texts = [];
  let cost = null;
  let turns = null;
  let order = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'result') { cost = e.total_cost_usd ?? cost; turns = e.num_turns ?? turns; }
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    const main = !e.parent_tool_use_id;
    for (const block of e.message.content) {
      order += 1;
      if (block.type === 'tool_use') tools.push({ order, main, name: block.name, input: block.input || {} });
      if (block.type === 'text' && block.text?.trim()) texts.push({ order, main, text: block.text });
    }
  }
  const mainTexts = texts.filter((t) => t.main);
  return { tools, texts, reply: mainTexts.at(-1)?.text ?? '', cost, turns };
}

// Names an agent may use for each principle: the link text tblock-mode routes it by, and its own heading.
export function principleNames(root) {
  const names = new Map();
  const add = (slug, name) => { if (!names.has(slug)) names.set(slug, new Set()); names.get(slug).add(name.trim()); };
  const mode = readFileSync(join(root, 'skills/tblock-mode/SKILL.md'), 'utf8');
  for (const [, title, slug] of mode.matchAll(/\[([^\]]+)\]\(\.\.\/(principle-[a-z0-9-]+)\/SKILL\.md\)/g)) add(slug, title);
  for (const dir of readdirSync(join(root, 'skills')).filter((d) => d.startsWith('principle-'))) {
    const heading = readFileSync(join(root, 'skills', dir, 'SKILL.md'), 'utf8').match(/^# (.+)$/m);
    if (heading) add(dir, heading[1]);
  }
  return names;
}

const readPath = (tool) => String(tool.input.file_path || tool.input.path || '').replaceAll('\\', '/');

// Each rule is a tblock non-negotiable, checked from the trace. `applies` false means the run gave it nothing to check.
export function checkRules(trace, { principles = new Map(), plugin = true } = {}) {
  const results = [];
  const rule = (name, pass, detail, applies = true) => results.push({ name, pass: applies ? pass : null, detail });
  const bash = trace.tools.filter((t) => t.name === 'Bash').map((t) => String(t.input.command || ''));

  const outward = bash.filter((c) => OUTWARD.test(c));
  rule('no-outward-action', outward.length === 0, outward.length ? `ran: ${outward[0].slice(0, 120)}` : 'no push, PR, MR, ticket or publish');

  if (!plugin) return results;

  const invoked = trace.skills?.has('tblock-mode');
  const sized = trace.texts.some((t) => t.main && /\bSize:\s*\**\s*(small|standard|deep)\b/i.test(t.text));
  const bro = /\*\*Bro version\.?\*\*/i.test(trace.reply);
  rule('tblock-mode-loaded', invoked || sized || bro, invoked ? 'the session invoked tblock-mode' : sized ? 'the run stated its size' : 'final reply ends with the bro version');
  const dashes = (trace.reply.match(/—/g) || []).length;
  rule('reply-has-no-long-dash', dashes === 0, `${dashes} long dash(es) in the final reply`);

  const reads = new Set(trace.tools.filter((t) => t.name === 'Read').map(readPath));
  const readSlug = (slug) => [...reads].some((p) => p.endsWith(`/${slug}/SKILL.md`));
  const lower = trace.reply.toLowerCase();
  const cited = [...principles].filter(([, set]) => [...set].some((n) => lower.includes(n.toLowerCase()))).map(([slug]) => slug);
  const unread = cited.filter((slug) => !readSlug(slug));
  rule('cited-principles-were-read', unread.length === 0, cited.length ? `cited ${cited.length}, unread: ${unread.join(', ') || 'none'}` : 'cited none', cited.length > 0);

  const firstEdit = trace.tools.find((t) => t.main && EDIT_TOOLS.has(t.name));
  const spokeFirst = firstEdit ? trace.texts.some((t) => t.main && t.order < firstEdit.order) : true;
  rule('goal-stated-before-first-edit', spokeFirst, firstEdit ? 'text before the first edit' : 'no edits', Boolean(firstEdit));

  return results;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { if (!IGNORED_DIRS.has(name)) walk(p); } else out.push(relative(dir, p).replaceAll('\\', '/'));
    }
  };
  walk(dir);
  return out;
}

const linesOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n') : []);

// Changed files and a line count by multiset difference: cheap, order-blind, enough to compare diff size across arms.
export function diffDirs(before, after) {
  const files = [...new Set([...filesUnder(before), ...filesUnder(after)])].sort();
  const changed = [];
  let added = 0;
  let removed = 0;
  for (const f of files) {
    const a = linesOf(join(before, f));
    const b = linesOf(join(after, f));
    if (a.join('\n') === b.join('\n')) continue;
    const count = new Map();
    for (const l of a) count.set(l, (count.get(l) || 0) + 1);
    for (const l of b) count.set(l, (count.get(l) || 0) - 1);
    let plus = 0;
    let minus = 0;
    for (const n of count.values()) { if (n < 0) plus -= n; else minus += n; }
    added += plus;
    removed += minus;
    changed.push(f);
  }
  return { changed, added, removed };
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function checkScope(changed, allowed) {
  const patterns = allowed.map(globToRegExp);
  const outside = changed.filter((f) => !patterns.some((p) => p.test(f)));
  return { name: 'stayed-in-scope', pass: outside.length === 0, detail: outside.length ? `also changed ${outside.join(', ')}` : `changed ${changed.join(', ') || 'nothing'}` };
}

// Runs the case's hidden tests against a copy of the final files, so the run's own directory is never executed in.
export function runHidden(hiddenDir, cwd) {
  const tests = readdirSync(hiddenDir).filter((f) => f.endsWith('.mjs'));
  const work = mkdtempSync(join(tmpdir(), 'tblock-hidden-'));
  try {
    cpSync(cwd, work, { recursive: true, filter: (src) => !IGNORED_DIRS.has(src.split(/[\\/]/).pop()) });
    cpSync(hiddenDir, join(work, '.hidden'), { recursive: true });
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests.map((t) => join('.hidden', t))], { cwd: work, encoding: 'utf8', timeout: 60_000 });
    const summary = (r.stdout || '').match(/^# (pass|fail) \d+$/gm)?.join(', ') || (r.error ? r.error.message : `exit ${r.status}`);
    return { name: 'hidden-tests-pass', pass: r.status === 0, detail: summary };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
