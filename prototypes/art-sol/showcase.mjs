#!/usr/bin/env node
// Original terminal studies. Standalone: this never imports or modifies the CLI.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const WIDTH = 88;
export const HEIGHT = 22;
const BG = [9, 11, 19];
const C = {
  rose: [255, 77, 109], orange: [255, 122, 69], gold: [255, 196, 87],
  white: [255, 241, 213], ink: [47, 52, 73], muted: [137, 147, 171],
  claude: [222, 128, 96], gpt: [52, 211, 153], gemini: [96, 165, 250],
  teal: [94, 234, 212], violet: [167, 139, 250], pink: [244, 114, 182],
};
const EMBER = [C.rose, C.orange, C.gold];
const EFFORT = [C.teal, C.gemini, C.violet, C.pink, C.rose];
const TAU = Math.PI * 2;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const fade = (c, n) => c.map((v, i) => Math.round(lerp(BG[i], v, clamp(n))));
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const mix = (stops, t) => {
  const at = clamp(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(at));
  return stops[i].map((v, k) => Math.round(lerp(v, stops[i + 1][k], at - i)));
};
const FONT = {
  A: ['01110','11011','11011','11111','11011','11011','11011'],
  B: ['11110','11011','11011','11110','11011','11011','11110'],
  C: ['01111','11000','11000','11000','11000','11000','01111'],
  D: ['11110','11011','11011','11011','11011','11011','11110'],
  E: ['11111','11000','11000','11110','11000','11000','11111'],
  F: ['11111','11000','11000','11110','11000','11000','11000'],
  G: ['01111','11000','11000','11011','11011','11011','01110'],
  H: ['11011','11011','11011','11111','11011','11011','11011'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  K: ['11011','11011','11110','11100','11110','11011','11011'],
  L: ['11000','11000','11000','11000','11000','11000','11111'],
  M: ['11011','11111','11111','11011','11011','11011','11011'],
  N: ['11001','11101','11101','11011','11011','11011','11001'],
  O: ['01110','11011','11011','11011','11011','11011','01110'],
  P: ['11110','11011','11011','11110','11000','11000','11000'],
  R: ['11110','11011','11011','11110','11100','11010','11011'],
  S: ['01111','11000','11000','01110','00011','00011','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['11011','11011','11011','11011','11011','11011','01110'],
  V: ['11011','11011','11011','11011','11011','01010','00100'],
  W: ['11011','11011','11011','11011','11111','11111','01010'],
  X: ['11011','11011','01010','00100','01010','11011','11011'],
  Y: ['11011','11011','01010','00100','00100','00100','00100'],
};

// One terminal cell = two independently colored pixels. Text sits above the raster.
export class Frame {
  constructor() {
    this.pixels = Array(WIDTH * HEIGHT * 2).fill(null);
    this.cells = new Map();
  }
  pixel(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    // Graphics never invade the two header/footer rows. BG means erase, also in mono.
    if (x >= 0 && x < WIDTH && y >= 4 && y < 40) this.pixels[y * WIDTH + x] = color.every((v, i) => v === BG[i]) ? null : color;
    return this;
  }
  line(x1, y1, x2, y2, color) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    for (let i = 0; i <= steps; i++) this.pixel(lerp(x1, x2, i / steps), lerp(y1, y2, i / steps), color);
    return this;
  }
  rect(x, y, w, h, color) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.pixel(x + xx, y + yy, color);
    return this;
  }
  ellipse(cx, cy, rx, ry, color, start = 0, end = TAU) {
    const steps = Math.ceil(Math.max(rx, ry) * (end - start) * 2);
    for (let i = 0; i <= steps; i++) {
      const a = lerp(start, end, i / steps);
      this.pixel(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, color);
    }
    return this;
  }
  polygon(points, color) {
    const minY = Math.floor(Math.min(...points.map(p => p[1])));
    const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const hits = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          hits.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i < hits.length - 1; i += 2) this.line(Math.ceil(hits[i]), y, Math.floor(hits[i + 1]), y, color);
    }
    return this;
  }
  text(x, y, text, color = C.white, bold = false) {
    for (const ch of text) {
      if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) this.cells.set(y * WIDTH + x, { ch, fg: color, bg: BG, bold });
      x++;
    }
    return this;
  }
  center(y, text, color = C.white, bold = false) { return this.text(Math.floor((WIDTH - [...text].length) / 2) - 2, y, '  ' + text + '  ', color, bold); }
  rule(y, x = 3, w = 82, color = C.ink) { return this.text(x, y, '─'.repeat(w), color); }
  box(x, y, w, h, color = C.ink) {
    this.rect(x, y * 2, w, h * 2, BG);
    this.text(x, y, `╭${'─'.repeat(w - 2)}╮`, color);
    this.text(x, y + h - 1, `╰${'─'.repeat(w - 2)}╯`, color);
    for (let r = 1; r < h - 1; r++) { this.text(x, y + r, '│', color); this.text(x + w - 1, y + r, '│', color); }
    return this;
  }
  word(word, x, y, { scale = 2, color = EMBER, reveal = 1, phase = 0, shadow = true } = {}) {
    const pixels = [];
    [...word].forEach((ch, j) => (FONT[ch] || FONT.X).forEach((row, yy) => [...row].forEach((bit, xx) => {
      if (bit === '1') for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const px = x + j * 6 * scale + xx * scale + dx, py = y + yy * scale + dy;
        if (px <= x + word.length * 6 * scale * reveal) pixels.push([px, py]);
      }
    })));
    if (shadow) for (const [px, py] of pixels) this.pixel(px + 1, py + 2, [82, 33, 54]);
    for (const [px, py] of pixels) this.pixel(px, py, mix(color, clamp((px - x) / (word.length * 6 * scale) + Math.sin(py * .4 + phase) * .11)));
    return this;
  }
}

function shell(name, number, subtitle) {
  const f = new Frame();
  f.text(3, 0, '▐ tblock', C.orange, true).text(15, 0, '/ ' + name.toUpperCase(), C.white, true);
  f.text(65, 0, `ART LAB   ${String(number).padStart(2, '0')} / 13`, C.muted);
  f.rule(1).text(3, 20, subtitle, C.muted);
  f.text(3, 21, 'EMBER / ORIGINAL TERMINAL STUDIES', C.orange);
  f.text(64, 21, 'ILLUSTRATIVE DATA', C.muted);
  return f;
}
function particles(f, t, count, { x = 44, y = 24, spread = 40, color = EMBER, rise = true } = {}) {
  for (let i = 0; i < count; i++) {
    const age = (hash(i + 99) + t * .22) % 1;
    const px = x + (hash(i + 4) - .5) * spread * 2 + Math.sin(t * 2 + i) * age * 3;
    const py = y + (rise ? -1 : 1) * age * (12 + hash(i + 32) * 14);
    f.pixel(px, py, fade(mix(color, hash(i + 11)), (1 - age) * .85));
  }
}
function trace(f, points, color, t, pace = 1) {
  for (let i = 1; i < points.length; i++) f.line(...points[i - 1], ...points[i], fade(color, .3));
  const at = ((t * pace) % 1) * (points.length - 1);
  const j = Math.floor(at), a = points[j], b = points[j + 1] || a;
  f.pixel(lerp(a[0], b[0], at - j), lerp(a[1], b[1], at - j), C.white);
}

function launch(t, p, still) {
  const f = shell('launch / needle jump', 1, 'A small command. A very large ignition.');
  const jump = still ? 1 : Math.min(1, p * 2);
  for (let i = 0; i < 100; i++) {
    const a = hash(i + 40) * TAU;
    const d = 4 + ((hash(i) + t * .32) % 1) * 42;
    const x = 44 + Math.cos(a) * d * 1.45, y = 21 + Math.sin(a) * d * .56;
    f.line(x, y, x + Math.cos(a) * (1 + jump * 6), y + Math.sin(a) * (1 + jump * 3), fade(i % 3 ? C.gemini : C.gold, .15 + d / 65));
  }
  // A miniature perspective launch rail below the monolith.
  for (let x = 0; x <= 88; x += 11) f.line(44, 29, x, 38, fade(C.orange, .23));
  for (let y = 31; y <= 38; y += 3) f.line(6, y, 81, y, fade(C.rose, .22));
  f.rect(7, 11, 75, 17, BG);
  f.word('TBLOCK', 9, 12, { reveal: still ? 1 : clamp(p * 1.65), phase: t * 3 });
  if (!still && p < .56) {
    const scan = 12 + Math.floor((p * 4 % 1) * 14);
    f.line(8, scan, 80, scan, C.white);
    for (let i = 0; i < 7; i++) f.rect(10 + hash(i + Math.floor(t * 15)) * 64, scan + i % 3, 3, 1, BG);
  }
  f.center(3, 'N E E D L E   J U M P   /   D R I V E   O N L I N E', C.gemini);
  f.center(15, 'MULTIPLE MINDS. ONE TRAJECTORY.', C.white, true);
  f.center(17, 'PLANNER  ━━━╋━━━  DELEGATE  ━━━╋━━━  REVIEWER', C.gold);
  f.center(18, 'claude            gpt            gemini', C.muted);
  return f;
}

function thinking(t, p, still) {
  const f = shell('thinking / arc ignition', 2, 'Indeterminate energy: the moving core never claims a percent.');
  f.text(7, 3, '01  /  ARC IGNITION', C.orange, true);
  f.text(7, 5, 'planner', C.white, true).text(24, 5, 'claude  ·  high effort', C.claude);
  const length = still ? 59 : Math.floor(8 + clamp(p * 2.2) * 51);
  for (let x = 0; x < length; x++) {
    const c = mix([C.rose, C.orange, C.gold, C.white], x / 59);
    f.rect(18 + x, 17, 1, 5, fade(c, .16 + Math.sin(t * 5 + x * .15) * .05));
    f.rect(18 + x, 18, 1, 3, fade(c, .65));
    f.pixel(18 + x, 19, C.white);
    if ((x + Math.floor(t * 12)) % 9 === 0) f.pixel(18 + x, 15, C.gold);
  }
  f.rect(7, 17, 10, 6, C.ink).rect(8, 18, 8, 4, C.muted);
  for (let x = 9; x < 16; x += 2) f.line(x, 18, x, 21, BG);
  f.rect(16, 16, 2, 8, C.orange);
  const core = 20 + (still ? 29 : ((t * 22) % 53));
  f.rect(core, 18, 3, 3, C.white);
  f.text(7, 13, '╰── field stable ──────────────────────────── reasoning active ─────╯', C.orange);
  f.text(7, 16, 'SIGNAL', C.muted).text(18, 16, '▁▂▃▅▇▆▄▂▁▂▄▆█▇▅▃▁▂▄▅▇▅▃▂▁', C.gold);
  f.text(7, 18, 'Constructing a plan before the first delegate wakes.', C.white);
  return f;
}

function orbit(t, p, still) {
  const f = shell('thinking / orbital quorum', 3, 'Three model families orbit a shared decision; effort bends the field.');
  const cx = 29, cy = 21;
  f.ellipse(cx, cy, 23, 11, fade(C.violet, .4));
  f.ellipse(cx, cy, 16, 14, fade(C.gemini, .28));
  f.ellipse(cx, cy, 10, 7, fade(C.orange, .4));
  for (let i = 0; i < 22; i++) f.pixel(5 + hash(i) * 48, 6 + hash(i + 50) * 28, fade(C.muted, .3));
  const colors = [C.claude, C.gpt, C.gemini], names = ['C', 'G', 'M'];
  colors.forEach((c, i) => {
    const a = (still ? .6 : t * .9) + i * TAU / 3;
    const x = cx + Math.cos(a) * 23, y = cy + Math.sin(a) * 11;
    for (let j = 1; j <= 14; j++) f.pixel(cx + Math.cos(a - j * .045) * 23, cy + Math.sin(a - j * .045) * 11, fade(c, 1 - j / 16));
    f.text(Math.round(x), Math.floor(y / 2), names[i], c, true);
    f.line(cx, cy, x, y, fade(c, .18));
  });
  f.text(25, 10, '◈ QUORUM', C.gold, true);
  f.text(57, 5, 'ORBITAL QUORUM', C.white, true);
  f.text(57, 7, 'C  claude   ·  propose', C.claude);
  f.text(57, 9, 'G  gpt      ·  explore', C.gpt);
  f.text(57, 11, 'M  gemini   ·  challenge', C.gemini);
  f.text(57, 14, '╭─ shared context ─────╮', C.ink);
  f.text(57, 15, '│  3 minds / 1 intent │', C.white);
  f.text(57, 16, '╰─────────────────────╯', C.ink);
  f.center(18, 'Independent trajectories. Convergent reasoning.', C.muted);
  return f;
}

function working(t, p, still) {
  const f = shell('working / silk mesh', 4, 'Parallel work as a living web: packets travel; roles remain legible.');
  const hub = [16, 20];
  const lanes = [
    { y: 5, label: 'delegate / 01', family: 'gpt', task: 'map the surface', color: C.gpt, fill: .78 },
    { y: 9, label: 'delegate / 02', family: 'claude', task: 'build the change', color: C.claude, fill: .56 },
    { y: 13, label: 'reviewer / 03', family: 'gemini', task: 'stress the edges', color: C.gemini, fill: .35 },
  ];
  for (let k = 0; k < 6; k++) f.ellipse(16, 20, 5 + k * 3.6, 4 + k * 1.3, fade(C.violet, .28), -1.38, 1.38);
  lanes.forEach((lane, i) => {
    const yy = lane.y * 2 + 2;
    trace(f, [hub, [25, 20], [34, yy], [39, yy]], lane.color, still ? .55 + i * .12 : t * .5 + i * .25);
    f.box(39, lane.y - 1, 43, 4, fade(lane.color, .55));
    f.text(42, lane.y, lane.label, lane.color, true).text(62, lane.y, lane.family, lane.color);
    const fill = still ? lane.fill : clamp(lane.fill - .15 + p * .2);
    const blocks = Math.floor(fill * 20);
    f.text(42, lane.y + 1, '━'.repeat(blocks) + '┄'.repeat(20 - blocks), lane.color);
    f.text(65, lane.y + 1, `${Math.round(fill * 100)}%`, C.white);
  });
  f.box(5, 8, 18, 5, C.orange).text(8, 9, '◈ PLANNER', C.gold, true).text(8, 11, 'context / fan', C.muted);
  f.text(8, 16, '╰─────────────── shared intent / isolated work ───────────────────╯', C.violet);
  f.text(8, 18, '3 active lanes    ·    1 review gate    ·    no orphaned threads', C.white);
  return f;
}

function doctor(t, p, still) {
  const f = shell('doctor / pulse bench', 5, 'A diagnostic instrument: the waveform becomes a quiet status rail.');
  f.text(6, 3, 'D O C T O R', C.white, true).text(54, 3, 'SYSTEM PULSE / SAMPLE 024', C.teal);
  for (let x = 6; x < 82; x += 4) f.line(x, 10, x, 21, fade(C.teal, .08));
  for (let y = 10; y < 22; y += 4) f.line(6, y, 81, y, fade(C.teal, .11));
  const wave = x => {
    const a = (x + (still ? 0 : t * 12)) % 24;
    return a < 5 ? Math.sin(a / 5 * TAU) * .5 : a < 7 ? -(a - 5) * 2.5 : a < 8 ? -5 + (a - 7) * 11 : a < 10 ? 6 - (a - 8) * 3 : a < 14 ? Math.sin((a - 10) / 4 * Math.PI) * 1.5 : 0;
  };
  for (let x = 6; x < 82; x++) f.line(x, 16 + wave(x), x + 1, 16 + wave(x + 1), mix([C.teal, C.gpt, C.gold], (x - 6) / 76));
  const items = [
    ['PASS', 'Runtime', 'Node available; built-ins ready', C.gpt],
    ['PASS', 'Roles', '7 role mappings parsed', C.gpt],
    ['WARN', 'Tier detection', 'Manual selection required', C.gold],
    ['PASS', 'Harness', 'Agent directory connected', C.gpt],
  ];
  items.forEach(([status, label, detail, c], i) => {
    const ready = still || p > .15 + i * .16;
    f.text(7, 12 + i, (ready ? status : 'SCAN').padEnd(8), ready ? c : C.muted, true);
    f.text(15, 12 + i, label.padEnd(17) + (ready ? detail : 'checking…'), C.white);
  });
  f.rule(17).text(7, 18, '3 PASS  /  1 WARN  /  0 FAIL     setup is usable', C.gold, true);
  return f;
}

function roles(t, p, still) {
  const f = shell('roles / switchboard', 6, 'Role assignment as a patch bay. A bright packet follows each route.');
  f.text(6, 3, 'R O L E S   /   ROUTE INTENT', C.white, true);
  const rows = [
    ['planner', 'claude', 'high', C.claude, 5],
    ['delegate', 'gpt', 'medium', C.gpt, 8],
    ['reviewer', 'gemini', 'xhigh', C.gemini, 11],
    ['integrator', 'gpt', 'high', C.gpt, 14],
  ];
  rows.forEach(([name, model, effort, c, y], i) => {
    f.text(7, y, `▐ ${name.padEnd(12)} ○`, C.white, true);
    const mid = 30 + i * 5;
    trace(f, [[24, y * 2], [mid, y * 2], [mid + 3, y * 2 + 2], [52, y * 2 + 2]], c, still ? .72 : t * .7 + i * .17);
    f.text(53, y, '◉ ' + model.padEnd(9), c, true);
    const effortCount = [4, 3, 5, 4][i];
    for (let k = 0; k < 6; k++) f.text(66 + k, y, k < effortCount ? '▰' : '▱', k < effortCount ? mix(EFFORT, k / 5) : C.ink);
    f.text(74, y, effort, C.muted);
  });
  f.text(7, 17, '╰─ roles set ───────────── roles sync ───────────── harness ──────╯', C.orange);
  f.text(7, 18, 'The right model, connected to the right responsibility.', C.white);
  return f;
}

function models(t, p, still) {
  const f = shell('models / spectral inventory', 7, 'Each model family gets a distinct aurora; labels do the identifying.');
  const families = [
    { x: 6, name: 'CLAUDE', color: C.claude, band: 'deliberate', effort: 'high' },
    { x: 33, name: 'GPT', color: C.gpt, band: 'adaptive', effort: 'xhigh' },
    { x: 60, name: 'GEMINI', color: C.gemini, band: 'expansive', effort: 'medium' },
  ];
  families.forEach((family, j) => {
    f.box(family.x - 1, 3, 24, 15, fade(family.color, .4));
    for (let x = 0; x < 20; x++) {
      const h = 3 + (Math.sin(x * .25 + (still ? j : t * 1.5 + j)) + 1) * 4;
      for (let y = 0; y < h; y++) f.pixel(family.x + x, 23 - y, fade(family.color, .15 + y / 13));
      f.pixel(family.x + x, 23 - h, mix([family.color, C.white], x / 30));
    }
    f.text(family.x + 2, 5, family.name, family.color, true);
    f.text(family.x + 2, 13, family.band, C.white);
    f.text(family.x + 2, 15, `effort / ${family.effort}`, C.muted);
  });
  f.center(18, 'DISCOVER  ──  COMPARE  ──  ASSIGN', C.gold, true);
  return f;
}

function tiers(t, p, still) {
  const f = shell('tiers / dune engine', 8, 'A buried engine surfaces through effort strata. Higher is hotter.');
  // Layered dunes, then a ribbed breaching creature built from offset ellipses.
  for (let x = 4; x < 84; x++) {
    for (let layer = 0; layer < 3; layer++) {
      const y = 27 + layer * 4 + Math.sin(x / 15 + layer * 1.8 + t * .08) * 3;
      f.line(x, y, x, 38, fade(mix(EMBER, layer / 2), .16 + layer * .08));
      f.pixel(x, y, fade(C.gold, .4 + layer * .16));
    }
  }
  const lift = still ? 1 : clamp(p * 1.7);
  for (let i = 10; i >= 0; i--) {
    const x = 23 + i * 1.05, y = 25 - Math.sin(i / 12 * Math.PI) * 12 * lift;
    f.ellipse(x, y, 7 - i * .16, 5, fade(mix(EMBER, i / 11), .55 + i / 30));
  }
  f.ellipse(23, 25, 7, 5, C.gold).ellipse(23, 25, 4, 3, C.rose);
  f.text(8, 3, 'T I E R S', C.white, true).text(49, 3, 'EFFORT / GEOLOGICAL SCALE', C.gold);
  const labels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  labels.forEach((label, i) => {
    const y = 15 - i * 2, x = 49 + i * 4;
    f.text(x, y, '▰'.repeat(3 + i), mix(EFFORT, i / 5));
    f.text(x + 9, y, ' ' + label + ' ', C.white);
    if (i < 5) f.text(x + 3, y - 1, '╭──', C.ink);
  });
  f.center(18, 'tiers detect  →  surface the options     tiers set  →  choose the heat', C.white);
  return f;
}

function preset(t, p, still) {
  const f = shell('preset / chamber', 9, 'A squared mechanical slide racks, then seats a new configuration.');
  f.text(7, 3, 'P R E S E T   /   CHAMBER A CONFIGURATION', C.white, true);
  const rack = still ? 0 : Math.sin(clamp(p * 1.8) * Math.PI) * 9;
  const x = 12 - rack;
  f.rect(13, 24, 62, 4, C.ink).line(17, 29, 71, 29, C.orange);
  f.rect(x, 13, 63, 9, fade(C.muted, .45)).line(x + 1, 12, x + 62, 12, C.white);
  f.rect(x + 1, 14, 61, 5, fade(C.gemini, .22));
  f.rect(x + 28, 14, 20, 6, BG).rect(x + 30, 16, 16, 2, C.gold);
  for (let i = 0; i < 7; i++) f.line(x + 3 + i * 2, 14, x + 2 + i * 2, 20, C.muted);
  f.rect(x + 57, 14, 5, 6, C.orange);
  f.text(18, 11, '╰──╥───────────────╥───────────────╥──────────────╯', C.orange);
  f.text(20, 13, '╔══╩══╗         ╔══╩══╗         ╔══╩══╗', C.muted);
  f.text(20, 14, '║ PLAN║         ║BUILD║         ║CHECK║', C.white);
  f.text(20, 15, '╚═════╝         ╚═════╝         ╚═════╝', C.muted);
  const seated = still || p > .7;
  f.center(17, seated ? '▰  BALANCED  /  SEATED  /  READY' : '▱  RACKING  /  ALIGNING ROLE MAP', seated ? C.gold : C.orange, true);
  f.center(18, 'planner: high     delegate: medium     reviewer: high', C.muted);
  return f;
}

function watch(t, p, still) {
  const f = shell('watch / night telemetry', 10, 'A live horizon with readable lane telemetry; the grid carries motion.');
  const vanX = 44, vanY = 17;
  for (let y = 6; y <= vanY; y++) for (let x = 29; x <= 59; x++) {
    if (((x - vanX) / 15) ** 2 + ((y - vanY) / 11) ** 2 <= 1) f.pixel(x, y, mix([C.rose, C.orange], (y - 6) / 11));
  }
  for (let y = 9; y < 17; y += 4) f.line(29, y, 59, y, BG);
  for (let x = -80; x <= 160; x += 18) f.line(vanX, vanY, x, 38, fade(C.violet, .4));
  for (let i = 0; i < 7; i++) {
    const z = ((i / 7 + (still ? 0 : t * .15)) % 1);
    const y = 18 + z * z * 20;
    f.line(3, y, 84, y, fade(C.pink, .17 + z * .2));
  }
  f.text(6, 3, 'W A T C H', C.white, true).text(57, 3, '● LIVE / SESSION 0A7F', C.gpt);
  f.box(7, 7, 74, 11, C.ink);
  f.text(10, 8, 'ROLE          MODEL       STATE                  ELAPSED', C.muted);
  const tick = still ? 24 : Math.floor(t) + 21;
  const data = [
    ['planner', 'claude', 'COMPLETE', '00:08', C.claude],
    ['delegate.1', 'gpt', 'EDITING', '00:' + String(tick).padStart(2, '0'), C.gpt],
    ['delegate.2', 'gemini', 'RESEARCHING', '00:' + String(tick - 3).padStart(2, '0'), C.gemini],
    ['reviewer', 'claude', 'QUEUED', '  -- ', C.claude],
  ];
  data.forEach(([role, model, state, elapsed, c], i) => {
    f.text(10, 10 + i, role.padEnd(14), C.white);
    f.text(24, 10 + i, model.padEnd(12), c);
    f.text(36, 10 + i, state.padEnd(23) + elapsed, i === 3 ? C.muted : C.white);
    f.text(73, 10 + i, i === 0 ? '✓' : i === 3 ? '┄' : ['▁', '▃', '▆', '█'][Math.floor(t * 8 + i) % 4], c);
  });
  f.text(10, 15, '↳ delegate.1   writing the smallest useful change', C.gold);
  f.center(18, '2 RUNNING     1 COMPLETE     1 QUEUED     /     context connected', C.white);
  return f;
}

function dragon(t, p, still) {
  const f = shell('banner / cinderwing', 11, 'An original furnace creature breathes the brand into molten lettering.');
  const breath = still ? 1 : clamp(p * 2);
  // Angular wings and a serpentine neck, rather than a borrowed silhouette.
  f.polygon([[7, 27], [5, 8], [18, 18], [20, 6], [31, 23], [24, 29]], fade(C.rose, .55));
  f.line(7, 27, 5, 8, C.rose).line(7, 27, 18, 18, C.orange).line(18, 18, 20, 6, C.gold);
  f.polygon([[8, 31], [12, 22], [22, 23], [26, 16], [33, 15], [36, 19], [31, 22], [27, 22], [23, 31]], C.orange);
  f.polygon([[25, 16], [24, 11], [30, 15], [31, 10], [34, 16]], C.gold);
  f.line(8, 30, 4, 34, C.rose).line(4, 34, 16, 35, C.rose);
  f.line(12, 29, 8, 35, C.gold).line(23, 28, 26, 34, C.gold);
  f.pixel(32, 17, C.white).pixel(33, 17, BG);
  for (let x = 36; x < 36 + 45 * breath; x++) {
    const height = (x - 35) * .19 + 1;
    const center = 20 + Math.sin(x * .3 + t * 9) * height * .18;
    for (let dy = -height; dy < height; dy++) {
      if (hash(Math.floor(x * 13 + dy * 7 + t * 15)) > .17) {
        const n = 1 - Math.abs(dy) / height;
        f.pixel(x, center + dy, fade(mix(EMBER, n), .3 + n * .6));
      }
    }
  }
  particles(f, t, 45, { x: 58, y: 26, spread: 25 });
  f.rect(40, 16, 38, 9, BG).line(40, 15, 77, 15, C.orange).line(40, 25, 77, 25, C.rose);
  f.word('TBLOCK', 42, 17, { scale: 1, reveal: breath, shadow: false, color: [C.white, C.gold, C.orange], phase: t });
  f.text(7, 3, 'C I N D E R W I N G   /   FORGED IN PARALLEL', C.gold, true);
  f.text(40, 14, '╰── ignition is a team sport ──────────╯', C.orange);
  f.text(12, 18, 'ONE INTENT. MANY MINDS. ENOUGH FIRE TO MOVE THE WORK.', C.white, true);
  return f;
}

function success(t, p, still) {
  const f = shell('outcome / seal struck', 12, 'A hot impact, a radial shower, then a durable completion seal.');
  const radius = still ? 17 : 4 + clamp(p * 2) * 15;
  for (let i = 0; i < 44; i++) {
    const a = hash(i + 120) * TAU;
    const r = radius + hash(i) * 7;
    const x = 44 + Math.cos(a) * r * 1.9, y = 20 + Math.sin(a) * r * .65;
    f.line(x, y, x + Math.cos(a) * 2, y + Math.sin(a), fade(mix(EMBER, hash(i + 40)), still ? .55 : 1 - p * .55));
  }
  f.ellipse(44, 20, 26, 13, C.orange).ellipse(44, 20, 24, 12, fade(C.gold, .4));
  f.line(32, 19, 40, 26, C.gold).line(40, 26, 57, 12, C.gold);
  f.line(32, 18, 40, 25, C.white).line(40, 25, 57, 11, C.white);
  f.center(3, 'S E A L   S T R U C K', C.gold, true);
  f.center(15, 'COMPLETE / ALL ROLES CONNECTED', C.white, true);
  f.center(17, '7 mappings written  ·  3 delegates synced  ·  review passed', C.gold);
  f.center(18, 'The work has landed.', C.muted);
  return f;
}

function failure(t, p, still) {
  const f = shell('outcome / fracture', 13, 'The monolith fractures; the actual cause and recovery stay in focus.');
  f.word('HALT', 21, 8, { color: [C.rose, C.orange], phase: t, shadow: true });
  // Break, offset shard, and falling debris. No whole-screen flashing.
  for (let y = 7; y < 25; y++) {
    const x = 43 + Math.sin(y * 1.4) * 3;
    f.line(x - 1, y, x + 1, y, BG);
    f.pixel(x + 2, y, C.white);
  }
  for (let i = 0; i < 18; i++) {
    const y = 24 + ((hash(i) + t * .12) % 1) * 8;
    f.pixel(20 + hash(i + 13) * 48, y, fade(C.rose, .4));
  }
  f.text(8, 14, '╭─ FAIL / CONFIGURATION ────────────────────────────────────────────╮', C.rose, true);
  f.text(8, 15, '│  reviewer has no model assigned.                                  │', C.white);
  f.text(8, 16, '│  recovery: tblock roles set reviewer=<model>                       │', C.gold);
  f.text(8, 17, '╰──────────────────────────────────────────────────────────────────╯', C.rose);
  f.center(18, 'No files changed. Reconnect the role, then run again.', C.muted);
  return f;
}

export const SCENES = [
  { name: 'launch', title: 'Needle jump', seconds: 3.8, draw: launch },
  { name: 'thinking', title: 'Arc ignition', seconds: 3.2, draw: thinking },
  { name: 'orbit', title: 'Orbital quorum', seconds: 3.8, draw: orbit },
  { name: 'working', title: 'Silk mesh', seconds: 4, draw: working },
  { name: 'doctor', title: 'Pulse bench', seconds: 3, draw: doctor },
  { name: 'roles', title: 'Switchboard', seconds: 3.3, draw: roles },
  { name: 'models', title: 'Spectral inventory', seconds: 3.2, draw: models },
  { name: 'tiers', title: 'Dune engine', seconds: 3.5, draw: tiers },
  { name: 'preset', title: 'Chamber', seconds: 3.2, draw: preset },
  { name: 'watch', title: 'Night telemetry', seconds: 4, draw: watch },
  { name: 'dragon', title: 'Cinderwing', seconds: 3.5, draw: dragon },
  { name: 'success', title: 'Seal struck', seconds: 2.6, draw: success },
  { name: 'failure', title: 'Fracture', seconds: 3, draw: failure },
];

const rgbCache = new Map();
function colorCode(c, background, mode) {
  if (mode === 'truecolor') return `${background ? 48 : 38};2;${c.join(';')}`;
  const key = c.join(',');
  let code = rgbCache.get(key);
  if (code === undefined) {
    const levels = [0, 95, 135, 175, 215, 255];
    const cube = c.map(v => levels.reduce((best, n, i) => Math.abs(n - v) < Math.abs(levels[best] - v) ? i : best, 0));
    const cubeRGB = cube.map(i => levels[i]);
    const gray = Math.round(clamp((c.reduce((a, b) => a + b, 0) / 3 - 8) / 230) * 23);
    const distance = rgb => c.reduce((n, v, i) => n + (v - rgb[i]) ** 2, 0);
    code = distance([8 + gray * 10, 8 + gray * 10, 8 + gray * 10]) < distance(cubeRGB)
      ? 232 + gray : 16 + cube[0] * 36 + cube[1] * 6 + cube[2];
    // Keep long-running --loop memory bounded while gradients continuously change.
    if (rgbCache.size > 12000) rgbCache.clear();
    rgbCache.set(key, code);
  }
  return `${background ? 48 : 38};5;${code}`;
}

export function render(frame, { mode = 'none', width = WIDTH, height = HEIGHT } = {}) {
  const lines = [];
  width = Math.max(1, Math.min(WIDTH, width));
  height = Math.max(1, Math.min(HEIGHT, height));
  for (let y = 0; y < height; y++) {
    let line = '', style = '';
    for (let x = 0; x < width; x++) {
      let cell = frame.cells.get(y * WIDTH + x);
      if (!cell) {
        const upper = frame.pixels[(y * 2) * WIDTH + x];
        const lower = frame.pixels[(y * 2 + 1) * WIDTH + x];
        if (!upper && !lower) cell = { ch: ' ', fg: BG, bg: BG };
        else if (mode === 'none') {
          const strength = c => c ? c[0] * .2126 + c[1] * .7152 + c[2] * .0722 : 0;
          const u = strength(upper), l = strength(lower);
          // Preserve hierarchy without color: shadows become stipple, cores stay solid.
          const ch = u < 35 && l < 35 ? ' ' : u < 60 && l < 60 ? (upper && lower ? '░' : '·') : u < 60 ? '▄' : l < 60 ? '▀' : Math.max(u, l) < 100 ? '▒' : '█';
          cell = { ch };
        }
        else if (!upper) cell = { ch: '▄', fg: lower, bg: BG };
        else if (!lower) cell = { ch: '▀', fg: upper, bg: BG };
        else cell = { ch: '▀', fg: upper, bg: lower };
      }
      if (mode === 'none') line += cell.ch;
      else {
        const next = `${cell.bold ? 1 : 22};${colorCode(cell.fg, false, mode)};${colorCode(cell.bg, true, mode)}`;
        if (next !== style) { line += `\x1b[${next}m`; style = next; }
        line += cell.ch;
      }
    }
    lines.push(mode === 'none' ? line.trimEnd() : line + '\x1b[0m');
  }
  return lines.join('\n');
}

function options(argv, env, stream) {
  const names = [], flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith('--')) { names.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (!['still', 'animate', 'loop', 'list', 'help', 'color', 'fps', 'duration'].includes(key)) throw new Error(`Unknown option: --${key}`);
    if (!['color', 'fps', 'duration'].includes(key) && rest.length) throw new Error(`--${key} takes no value`);
    flags.set(key, rest.length ? rest.join('=') : true);
  }
  const number = (key, fallback, min, max) => {
    const raw = flags.get(key);
    if (raw === true) throw new Error(`--${key} needs a value: --${key}=NUMBER`);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`--${key} must be between ${min} and ${max}`);
    return value;
  };
  const color = flags.get('color');
  if (color !== undefined && !['always', 'truecolor', '256', 'never'].includes(color)) throw new Error('--color must be always, truecolor, 256, or never');
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM || '') || 'WT_SESSION' in env || /vscode|iTerm|WezTerm|ghostty/i.test(env.TERM_PROGRAM || '');
  const wantsColor = color !== 'never' && !('NO_COLOR' in env) && (stream.isTTY || (env.FORCE_COLOR || '0') !== '0' || ['always', 'truecolor', '256'].includes(color));
  const mode = !wantsColor ? 'none' : color === '256' ? '256' : color === 'truecolor' || env.FORCE_COLOR === '3' || truecolor ? 'truecolor' : '256';
  const groups = {
    all: SCENES.map(s => s.name),
    loaders: ['thinking', 'orbit', 'working'],
    commands: ['doctor', 'roles', 'models', 'tiers', 'preset', 'watch'],
    outcomes: ['success', 'failure'],
  };
  const expanded = (names.length ? names : ['all']).flatMap(name => groups[name] || [name]);
  const scenes = [...new Set(expanded)].map(name => {
    const scene = SCENES.find(s => s.name === name);
    if (!scene) throw new Error(`Unknown scene: ${name}. Use --list.`);
    return scene;
  });
  return {
    scenes, mode, still: flags.has('still') || (!stream.isTTY && !flags.has('animate')),
    loop: flags.has('loop'), list: flags.has('list'), help: flags.has('help'),
    fps: number('fps', 40, 30, 60), duration: number('duration', 0, 0, 120),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env, stream = process.stdout) {
  const opt = options(argv, env, stream);
  if (opt.list) { stream.write(SCENES.map(s => `${s.name.padEnd(10)} ${s.title}`).join('\n') + '\n'); return; }
  if (opt.help) {
    stream.write('node prototypes/art-sol/showcase.mjs [scene|group] [options]\n\n');
    stream.write('Groups: all, loaders, commands, outcomes. Use --list for scenes.\n');
    stream.write('--still          final frames; automatic when output is piped\n');
    stream.write('--animate        animate even when output is redirected (capture/debug)\n');
    stream.write('--color=MODE     always | truecolor | 256 | never; NO_COLOR wins\n');
    stream.write('--fps=30..60     default 40\n--duration=SEC   override duration per scene\n');
    stream.write('--loop           repeat animation until Ctrl+C\n');
    return;
  }
  if (opt.still) {
    for (const scene of opt.scenes) stream.write(render(scene.draw(scene.seconds, 1, true), { mode: opt.mode }) + '\n\n');
    return;
  }

  // Reserve a region in normal scrollback; do not erase the user's terminal.
  // Resize is handled by clipping at complete cells; never emit a partial SGR.
  const height = () => Math.max(1, Math.min(HEIGHT, (stream.rows || HEIGHT + 2) - 1));
  const width = () => Math.max(1, Math.min(WIDTH, (stream.columns || WIDTH + 2) - 1));
  let rows = height(), stopped = false, timer, resolveWait, cleaned = false;
  const originalRaw = process.stdin.isRaw;
  const originalFlowing = process.stdin.readableFlowing;
  const rawInput = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
  const pause = ms => new Promise(resolve => { resolveWait = resolve; timer = setTimeout(() => { resolveWait = undefined; resolve(); }, ms); });
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    resolveWait?.();
    resolveWait = undefined;
  };
  const interrupt = () => { process.exitCode = 130; stop(); };
  const terminate = () => { process.exitCode = 143; stop(); };
  const onKey = data => { if (data.includes(3)) interrupt(); };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (opt.mode !== 'none') stream.write('\x1b[0m');
    stream.write(`${rows > 1 ? `\x1b[${rows - 1}B` : ''}\r\n\x1b[?25h`);
    if (rawInput) {
      process.stdin.off('data', onKey);
      process.stdin.setRawMode(Boolean(originalRaw));
      // A fresh stdin is usually null (never resumed), rather than paused=true.
      // Restore that idle state too, otherwise Windows keeps the process alive.
      if (originalFlowing !== true) process.stdin.pause();
    }
  };
  const flush = async text => {
    if (stream.write(text)) return;
    await new Promise((resolve, reject) => {
      const onDrain = () => { stream.off('error', onError); resolve(); };
      const onError = err => { stream.off('drain', onDrain); reject(err); };
      stream.once('drain', onDrain).once('error', onError);
    });
  };
  stream.write('\x1b[?25l' + '\n'.repeat(rows) + `\x1b[${rows}A\r`);
  process.on('SIGINT', interrupt).on('SIGTERM', terminate).on('exit', cleanup);
  if (rawInput) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onKey); }
  const draw = async (scene, t, p, still) => {
    // Clear only the previously reserved region if terminal height changes.
    const nextRows = height();
    if (nextRows !== rows) {
      stream.write(Array.from({ length: Math.min(rows, nextRows) }, () => '\x1b[2K').join('\r\n'));
      const up = Math.min(rows, nextRows) - 1;
      stream.write((up > 0 ? `\x1b[${up}A` : '') + '\r');
      rows = nextRows;
    }
    const output = render(scene.draw(t, p, still), { mode: opt.mode, width: width(), height: rows });
    await flush('\r' + output.split('\n').map(line => line + '\x1b[K').join('\r\n') + (rows > 1 ? `\x1b[${rows - 1}A` : '') + '\r');
  };
  try {
    do {
      for (const scene of opt.scenes) {
        const seconds = opt.duration || scene.seconds, start = performance.now();
        while (!stopped) {
          const t = (performance.now() - start) / 1000;
          if (t >= seconds) break;
          const before = performance.now();
          await draw(scene, t, clamp(t / seconds), false);
          await pause(Math.max(1, 1000 / opt.fps - (performance.now() - before)));
        }
        if (stopped) break;
        await draw(scene, seconds, 1, true);
        await pause(opt.duration ? 80 : 550);
      }
    } while (opt.loop && !stopped);
  } finally {
    cleanup();
    process.off('SIGINT', interrupt).off('SIGTERM', terminate).off('exit', cleanup);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // EPIPE is a consumer closing a pipe, not a broken artwork scene.
  process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); else throw err; });
  main().catch(err => { process.stderr.write(`art-sol: ${err.message}\n`); process.exitCode = 1; });
}
