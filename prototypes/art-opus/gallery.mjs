#!/usr/bin/env node
// Writes every scene's final frame (truecolor) as an HTML gallery, for viewing without a terminal.
//   node prototypes/art-opus/gallery.mjs [scene…] [--out=path] [--at=0.5]   (--at = fraction of each scene's duration)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Frame, render } from './engine.mjs';
import { W } from './common.mjs';
import { forge, hyperspace, dune, dragon } from './scenes-launch.mjs';
import { thinking, lanes } from './scenes-work.mjs';
import { doctor, roles, models, preset, watch } from './scenes-commands.mjs';
import { success, failure } from './scenes-outcomes.mjs';
import { cockpit, starforge, horizon, fleet, dropout } from './scenes-hyperspace.mjs';

const SCENES = [forge, hyperspace, dune, dragon, thinking, lanes, doctor, roles, models, preset, watch, success, failure, cockpit, starforge, horizon, fleet, dropout];
const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const out = (args.find((a) => a.startsWith('--out=')) || '').slice(6) || join(dirname(fileURLToPath(import.meta.url)), 'gallery.html');
const at = Number((args.find((a) => a.startsWith('--at=')) || '').slice(5)) || 1;
const picked = names.length ? SCENES.filter((s) => names.includes(s.name)) : SCENES;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toHtml(line) {
  let fg = null; let bg = null; let bold = false; let html = ''; let buf = '';
  const flush = () => {
    if (!buf) return;
    const st = [fg && `color:rgb(${fg})`, bg && `background:rgb(${bg})`, bold && 'font-weight:700'].filter(Boolean).join(';');
    html += st ? `<span style="${st}">${esc(buf)}</span>` : esc(buf);
    buf = '';
  };
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    if (!part.startsWith('\x1b[')) { buf += part; continue; }
    flush();
    const p = part.slice(2, -1).split(';').map(Number);
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === 0) { fg = null; bg = null; bold = false; } else if (c === 1) bold = true; else if (c === 22) bold = false;
      else if (c === 39) fg = null; else if (c === 49) bg = null;
      else if (c === 38 && p[i + 1] === 2) { fg = p.slice(i + 2, i + 5).join(','); i += 4; } else if (c === 48 && p[i + 1] === 2) { bg = p.slice(i + 2, i + 5).join(','); i += 4; }
    }
  }
  flush();
  return html;
}

const blocks = picked.map((s) => {
  const f = new Frame(W, s.h, false);
  s.draw(f, s.dur * at);
  return `<h2>${esc(s.name)} <small>· ${esc(s.title)}</small></h2><pre>${render(f, 'true').map(toHtml).join('\n')}</pre>`;
});
const page = `<!doctype html><html><head><meta charset="utf-8"><title>tblock art</title><style>
body{background:#0c0a0f;color:#ddd;font-family:ui-sans-serif,system-ui;margin:16px}
h2{font-size:13px;font-weight:600;color:#ff7054;margin:18px 0 6px}small{color:#8a8290;font-weight:400}
pre{font-family:"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace;font-size:13px;line-height:1.0;margin:0;background:#0c0a0f;padding:8px;border-radius:6px;width:max-content}
</style></head><body>${blocks.join('\n')}</body></html>`;
writeFileSync(out, page);
process.stdout.write(`${out}\n`);
