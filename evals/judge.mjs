#!/usr/bin/env node
// Blind pairwise judging of two result folders from run.mjs. Each pair is one case and run number: the judge sees
// the task, each side's diff and reply with tblock's fingerprints stripped, in both orders, on each judge model.
// Usage: node evals/judge.mjs <results A> <results B> [--models sonnet,opus] [--arm-a with] [--arm-b with] [--max-cost-usd 3]
//        node evals/judge.mjs <results A> --self        pairs each run with the next run of the same case: the noise band
//        node evals/judge.mjs <results A> <results B> --export pairs.md [--pairs 20]   blind pairs for a person to label
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { principleNames } from './rules.mjs';

const evals = dirname(fileURLToPath(import.meta.url));
const root = resolve(evals, '..');

// What marks a reply as tblock's: the size line, the bro version, and the principles it names.
export function stripFingerprints(reply, principles = []) {
  let text = String(reply || '').replace(/\n*\*\*Bro version\.?\*\*[\s\S]*$/i, '');
  text = text.replace(/(^|\n)\W*Size:\s*\**\s*(small|standard|deep)\**[^.\n]*\.[ \t]*/gi, '$1');
  text = text.split('\n').filter((line) => !/^\W*Size:\W*(small|standard|deep)\W*$/i.test(line)).join('\n');
  text = text.replace(/\n+\**Principles? (applied|used)\.?\**:?[\s\S]*?(?=\n\n\*\*|\n\n#|$)/i, '');
  const named = principles.filter((name) => text.includes(name));
  for (const name of named) text = text.split('\n').filter((line) => !line.includes(name)).join('\n');
  return text.replace(/\*\*Goal\.?\*\*\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function tally(judgments) {
  const n = judgments.length;
  const count = (fn) => judgments.filter(fn).length;
  const b = count((j) => j.winner === 'B');
  const a = count((j) => j.winner === 'A');
  const ties = count((j) => j.winner === 'tie');
  return { n, a, b, ties, preferB: n ? (b + ties / 2) / n : null, firstShownWon: n ? count((j) => j.shownFirst === j.winner) / n : null };
}

// A bootstrap interval on the preference for B, resampling pairs so both orders of a pair stay together.
export function interval(judgments, { rounds = 2000, seed = 7 } = {}) {
  const byPair = new Map();
  for (const j of judgments) { if (!byPair.has(j.pair)) byPair.set(j.pair, []); byPair.get(j.pair).push(j); }
  const pairs = [...byPair.values()];
  if (!pairs.length) return null;
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const scores = [];
  for (let i = 0; i < rounds; i += 1) scores.push(tally(pairs.map(() => pairs[Math.floor(random() * pairs.length)]).flat()).preferB);
  scores.sort((x, y) => x - y);
  return [scores[Math.floor(rounds * 0.025)], scores[Math.floor(rounds * 0.975)]];
}

function diffOf(caseDir, files) {
  const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--stat=200', '-p', join(caseDir, 'fixture'), files], { encoding: 'utf8', maxBuffer: 20e6 });
  return (r.stdout || '').replaceAll(join(caseDir, 'fixture'), 'before').replaceAll(files, 'after').split('\n').filter((l) => !/^(index |diff --git)/.test(l)).join('\n').slice(0, 24000);
}

function load(dir, arm) {
  const { runs } = JSON.parse(readFileSync(join(dir, 'scorecard.json'), 'utf8'));
  const cases = JSON.parse(readFileSync(join(dir, 'eval.json'), 'utf8')).cases;
  return runs.filter((r) => r.arm === arm && !r.invalid && existsSync(join(dir, 'runs', `${r.case}-${r.arm}-${r.run}`, 'files'))).map((r) => {
    const c = cases.find((x) => x.name === r.case);
    const caseDir = resolve(root, c.dir);
    const prompt = String(readFileSync(join(caseDir, 'case.yaml'), 'utf8').match(/prompt:\s*>-\n([\s\S]*?)\n\s*max_turns/)?.[1] || readFileSync(join(caseDir, 'case.yaml'), 'utf8').match(/prompt:\s*"(.*)"/)?.[1] || '');
    return { case: r.case, run: r.run, task: prompt.replace(/\s+/g, ' ').replace('/tblock:tblock-mode ', '').trim(), reply: r.reply, diff: diffOf(caseDir, join(dir, 'runs', `${r.case}-${r.arm}-${r.run}`, 'files')) };
  });
}

const side = (label, x, principles) => `## Engineer ${label}\n\n### The change\n\n\`\`\`diff\n${x.diff || '(no files changed)'}\n\`\`\`\n\n### The message they sent back\n\n${stripFingerprints(x.reply, principles)}`;

export function question(first, second, principles) {
  return `Two engineers were given the same task. For each you see the change they made and the message they sent back.\n\n# The task\n\n${first.task}\n\n${side('A', first, principles)}\n\n${side('B', second, principles)}\n\n# Your verdict\n\nYou asked for this work. Which result would you rather receive? Weigh, in this order: whether the change is correct and complete for the task, whether it left nearby behaviour alone, whether the message's claims are backed by something that was run, and whether the message is clear about what was not checked. Length is not a virtue. Reply with one line of JSON and nothing else: {"winner":"A"|"B"|"tie","reason":"<one sentence>"}`;
}

function ask(model, prompt) {
  return new Promise((done) => {
    const child = spawn('claude', ['-p', '--model', model, '--system-prompt', 'You are a careful senior engineer reviewing two pieces of work. You answer with one line of JSON.', '--tools', '', '--disable-slash-commands',
      '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      try {
        const r = JSON.parse(out);
        const verdict = JSON.parse(String(r.result).match(/\{[\s\S]*\}/)[0]);
        done({ winner: ['A', 'B', 'tie'].includes(verdict.winner) ? verdict.winner : null, reason: verdict.reason, cost: r.total_cost_usd || 0 });
      } catch { done({ winner: null, cost: 0 }); }
    });
    child.stdin.end(prompt);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const take = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? argv.splice(i, 2)[1] : fallback; };
  const models = take('--models', 'sonnet,opus').split(',');
  const armA = take('--arm-a', 'with');
  const armB = take('--arm-b', 'with');
  const cap = Number(take('--max-cost-usd', 3));
  const exportTo = take('--export', null);
  const wanted = Number(take('--pairs', 20));
  const only = take('--case', null);
  const self = argv.includes('--self');
  // A side may be several result folders joined by commas, such as a batch and the runs that filled its gaps.
  const [specA, specB = specA] = argv.filter((a) => !a.startsWith('--'));
  const dirsA = specA.split(',').map((d) => resolve(d));
  const dirsB = specB.split(',').map((d) => resolve(d));
  const [dirA, dirB] = [dirsA[0], dirsB[0]];
  const loadAll = (dirs, arm) => {
    const runs = dirs.flatMap((d) => load(d, arm));
    const seen = {};
    return runs.map((r) => ({ ...r, run: (seen[r.case] = (seen[r.case] || 0) + 1) }));
  };
  const principles = [...principleNames(root).values()].flatMap((set) => [...set]);
  const a = loadAll(dirsA, armA).filter((r) => !only || r.case === only);
  const b = loadAll(dirsB, armB);
  const pairs = a.flatMap((x) => {
    const y = self ? a.find((r) => r.case === x.case && r.run === x.run + 1) : b.find((r) => r.case === x.case && r.run === x.run);
    return y ? [{ id: `${x.case}#${x.run}`, a: x, b: y }] : [];
  });

  if (exportTo) {
    // Each pair is shown once, with the side that is really B chosen by the pair's position, and the key kept apart.
    const chosen = pairs.filter((_, i) => i % Math.max(1, Math.floor(pairs.length / wanted)) === 0).slice(0, wanted);
    const key = chosen.map((p, i) => ({ pair: i + 1, id: p.id, shownAsA: i % 2 ? 'B' : 'A' }));
    writeFileSync(exportTo, chosen.map((p, i) => `# Pair ${i + 1}\n\n${question(i % 2 ? p.b : p.a, i % 2 ? p.a : p.b, principles).replace(/# Your verdict[\s\S]*$/, '# Your verdict\n\nWinner (A, B or tie): ')}`).join('\n\n---\n\n'));
    writeFileSync(`${exportTo}.key.json`, JSON.stringify(key, null, 1));
    console.log(`Wrote ${chosen.length} blind pairs to ${exportTo} and the key to ${exportTo}.key.json. Label them, then compare with the judges.`);
    process.exit(0);
  }

  const jobs = pairs.flatMap((p) => models.flatMap((model) => [{ p, model, swapped: false }, { p, model, swapped: true }]));
  const judgments = [];
  let cost = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length && cost < cap) {
      const { p, model, swapped } = jobs[next++];
      const r = await ask(model, swapped ? question(p.b, p.a, principles) : question(p.a, p.b, principles));
      cost += r.cost;
      if (!r.winner) continue;
      // Map the judge's letter back to the real sides: with the order swapped, the judge's A is the real B.
      const winner = r.winner === 'tie' ? 'tie' : (r.winner === 'A') !== swapped ? 'A' : 'B';
      judgments.push({ pair: p.id, case: p.a.case, model, swapped, winner, shownFirst: swapped ? 'B' : 'A', reason: r.reason });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const name = self ? 'judgments-self.json' : 'judgments.json';
  writeFileSync(join(dirB, name), JSON.stringify({ a: dirA, b: dirB, armA, armB, self, judgments }, null, 1));
  const line = (label, js) => { const t = tally(js); const ci = interval(js); return `${label.padEnd(18)} n=${String(t.n).padStart(3)}  A ${t.a}  B ${t.b}  tie ${t.ties}  prefers B ${(t.preferB * 100).toFixed(0)}% [${ci ? ci.map((x) => (x * 100).toFixed(0)).join(' to ') : '-'}]  first shown won ${(t.firstShownWon * 100).toFixed(0)}%`; };
  console.log(`${pairs.length} pairs, ${judgments.length} of ${jobs.length} judgments, $${cost.toFixed(2)}. ${self ? 'Self-comparison: 50% is expected, and the interval is the noise band.' : `A is ${armA} in ${dirA.split('/').pop()}, B is ${armB} in ${dirB.split('/').pop()}.`}`);
  console.log(line('all judges', judgments));
  for (const model of models) console.log(line(model, judgments.filter((j) => j.model === model)));
  for (const c of [...new Set(judgments.map((j) => j.case))]) console.log(line(c, judgments.filter((j) => j.case === c)));
}
