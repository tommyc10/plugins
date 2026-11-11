#!/usr/bin/env node
// tblock terminal-art showcase. Node built-ins only.
//
//   node prototypes/art-opus/showcase.mjs                 play every scene in sequence
//   node prototypes/art-opus/showcase.mjs <scene|group>…  play some (see --list)
//   flags: --still   print each scene's final frame (automatic when stdout is not a TTY)
//          --mono    force monochrome (also NO_COLOR=1)      --256  force 256-colour
//          --speed=2 play faster                              --list list scenes
import { Frame, render, visibleWidth } from './engine.mjs';
import { W } from './common.mjs';
import { forge, hyperspace, dune, dragon } from './scenes-launch.mjs';
import { thinking, lanes } from './scenes-work.mjs';
import { doctor, roles, models, preset, watch } from './scenes-commands.mjs';
import { success, failure } from './scenes-outcomes.mjs';
import { cockpit, starforge, horizon, fleet, dropout } from './scenes-hyperspace.mjs';

const WARP = [cockpit, starforge, horizon, fleet, dropout];
const SCENES = [forge, hyperspace, dune, dragon, thinking, lanes, doctor, roles, models, preset, watch, success, failure, ...WARP];
const GROUPS = {
  all: SCENES,
  splash: [forge, hyperspace, dune, dragon],
  warp: [hyperspace, ...WARP],
  working: [thinking, lanes],
  commands: [doctor, roles, models, preset, watch],
  outcomes: [success, failure],
  forge: [forge], tiers: [models], loaders: [thinking, lanes],
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const out = process.stdout;
const env = process.env;
const speed = Number((args.find((a) => a.startsWith('--speed=')) || '').split('=')[1]) || 1;

if (flag('list')) {
  for (const s of SCENES) out.write(`  ${s.name.padEnd(12)} ${s.title}  (${s.dur}s, ${s.h} rows)\n`);
  out.write(`\n  groups: ${Object.keys(GROUPS).join(', ')}\n`);
  process.exit(0);
}

const names = args.filter((a) => !a.startsWith('--'));
const picked = names.length ? names.flatMap((n) => {
  const hit = GROUPS[n] || SCENES.filter((s) => s.name === n);
  if (!hit.length) { process.stderr.write(`showcase: unknown scene "${n}" (try --list)\n`); process.exit(2); }
  return hit;
}) : SCENES;

const tty = Boolean(out.isTTY);
const mono = flag('mono') || 'NO_COLOR' in env || (!tty && !env.FORCE_COLOR);
const truecolor = /truecolor|24bit/i.test(env.COLORTERM || '') || 'WT_SESSION' in env || /vscode|iTerm|WezTerm|ghostty/i.test(env.TERM_PROGRAM || '');
const mode = mono ? 'mono' : flag('256') || !truecolor ? '256' : 'true';
const still = flag('still') || !tty;
const cols = tty ? Math.min(out.columns || W, W) : W;

const caption = (s, i) => {
  const n = String(i + 1).padStart(2, '0');
  if (mode === 'mono') return `-- ${n}/${String(picked.length).padStart(2, '0')}  ${s.name} · ${s.title} `.padEnd(W, '-');
  const head = `── ${n}/${String(picked.length).padStart(2, '0')}  `;
  const rest = `${s.name} · ${s.title} `;
  const rule = '─'.repeat(Math.max(0, cols - visibleWidth(head + rest)));
  return `\x1b[38;2;90;84;96m${head}\x1b[1;38;2;255;112;84m${s.name}\x1b[22;38;2;150;140;150m · ${s.title} \x1b[38;2;64;60;70m${rule}\x1b[0m`;
};

const frameFor = (s, t) => {
  const f = new Frame(W, s.h, mode === 'mono');
  s.draw(f, Math.min(t, s.dur));
  return render(f, mode, cols);
};

if (still) {
  picked.forEach((s, i) => {
    out.write(`${caption(s, i)}\n`);
    out.write(`${frameFor(s, s.dur).join('\n')}\n\n`);
  });
  process.exit(0);
}

// ── animated ──────────────────────────────────────────────────────────
const restore = () => out.write('\x1b[?2026l\x1b[0m\x1b[?25h');
process.on('exit', restore);
process.on('SIGINT', () => { restore(); out.write('\n'); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
out.write('\x1b[?25l');
for (const [i, s] of picked.entries()) {
  out.write(`${caption(s, i)}\n`);
  out.write('\n'.repeat(s.h - 1));
  out.write(`\x1b[${s.h - 1}A\r`);
  const start = performance.now();
  for (;;) {
    const t = ((performance.now() - start) / 1000) * speed;
    const lines = frameFor(s, t);
    out.write(`\x1b[?2026h${lines.join('\n')}\r${s.h > 1 ? `\x1b[${s.h - 1}A` : ''}\x1b[?2026l`);
    if (t >= s.dur) break;
    await sleep(1000 / 45);
  }
  out.write(`\x1b[${s.h - 1}B\r\n\n`);
  if (i < picked.length - 1) await sleep(900 / speed);
}
restore();
