// Per-command signature art: doctor (vital signs), roles (constellation under an aurora),
// models/tiers (circuit board), preset (slide-rack chamber), watch (dragon's eye over a live feed).
import {
  EMBER, FAMILY, EFFORT_RAMP, STATUS, HEAT, WHITE, DIM, FAINT, ACCENT, EFFORTS, ramp, mixc, scale, hash, noise, noise2, seg, ease, clamp, lerp,
  word, drawBitmap, effortMeter,
} from './engine.mjs';
import { W } from './common.mjs';

const TITLE = [240, 236, 240];
const SOFT = [220, 210, 215];
// Big 5×5 caps title in pixel space with an ember sweep and a dark extrude.
function title(f, str, px, py, t, { stops = EMBER, sx = 1, sy = 2, lit = 1 } = {}) {
  const bmp = word(str, sx, sy, 1);
  const sweep = (t * 0.6) % 1.6 - 0.3;
  drawBitmap(f, bmp, px, py, (x, y, u) => {
    let c = ramp(stops, u);
    c = mixc(c, WHITE, Math.exp(-(((u - sweep) / 0.08) ** 2)) * 0.6);
    return scale(c, lit);
  }, { shadow: scale(mixc(stops[0], [20, 10, 20], 0.65), lit), depth: 1 });
  return bmp;
}

// ─── DOCTOR: vital signs ──────────────────────────────────────────────────
// An oscilloscope sweeps a heartbeat across the banner; each beat lands a check result.
const ecg = (p) => { // one beat over p in 0..1 → -1..1
  const g = (c, w, a) => a * Math.exp(-(((p - c) / w) ** 2));
  return g(0.18, 0.035, 0.18) - g(0.36, 0.012, 0.25) + g(0.4, 0.014, 1) - g(0.44, 0.014, 0.4) + g(0.66, 0.06, 0.3);
};
const CHECKS = [
  ['PASS', 'Node', '24.12.0 · built-ins only'],
  ['PASS', 'Roles', '7 roles in ~/.tblock/roles.md'],
  ['PASS', 'Tiers', '9 models detected across 3 families'],
  ['WARN', 'Copilot efforts', '2 agents use the default effort'],
  ['PASS', 'Plugin', 'tblock 0.17.1 installed for Claude Code'],
  ['FAIL', 'Gemini key', 'GEMINI_API_KEY is not set (gemini roles fall back)'],
];
export const doctor = {
  name: 'doctor', title: 'vital signs', h: 20, dur: 5.4,
  draw(f, t) {
    const beat = 0.75; // seconds per beat
    const ph = (t % beat) / beat;
    const thump = Math.exp(-(((ph - 0.4) / 0.06) ** 2));
    title(f, 'DOCTOR', 2, 1, t, { stops: [STATUS.PASS, [94, 234, 212], [96, 165, 250]], sx: 1, sy: 2, lit: 0.85 + 0.15 * thump });
    // heart glyph that beats
    f.text(2, 6, thump > 0.4 ? '♥' : '♡', mixc([255, 77, 109], WHITE, thump * 0.4), { bold: true });
    f.text(4, 6, '80 bpm · setup check · 6 vitals', DIM);
    // oscilloscope: braille trace, phosphor fade behind the sweep head
    const sx0 = 2 * 40; const sx1 = 2 * (W - 1); const mid = 4 * 3; const amp = 10;
    const head = sx0 + ((t * 70) % (sx1 - sx0));
    for (let x = sx0; x <= sx1; x++) {
      const behind = (head - x + (sx1 - sx0)) % (sx1 - sx0);
      if (behind > (sx1 - sx0) - 8) continue; // gap ahead of the head
      const p = ((x - sx0) / 54) % 1;
      const y = mid - ecg(p) * amp;
      const prev = mid - ecg(((x - 1 - sx0) / 54) % 1) * amp;
      const fade = clamp(1 - behind / (sx1 - sx0));
      const c = mixc(scale(STATUS.PASS, 0.5), mixc(STATUS.PASS, WHITE, 0.55), fade ** 1.5);
      f.dline(x, prev, x, y, c);
    }
    for (let x = sx0; x <= sx1; x += 6) f.dot(x, mid + amp + 2, FAINT); // graticule
    const hy = mid - ecg(((head - sx0) / 54) % 1) * amp;
    f.put(head / 2, hy / 4, '●', mixc(STATUS.PASS, WHITE, 0.6), { bold: true });
    if (!f.mono) f.glowDisk(head / 2, hy / 2, 4, STATUS.PASS, 0.6);
    // checks land one per beat
    f.text(2, 8, 'CHECK', FAINT); f.text(25, 8, 'RESULT', FAINT);
    const shown = Math.min(CHECKS.length, Math.floor(seg(t, 0.4, 0.4 + beat * CHECKS.length) * CHECKS.length + 0.001));
    CHECKS.forEach(([lvl, label, detail], i) => {
      const row = 9 + i;
      if (i >= shown) { f.text(2, row, '·'.repeat(3), FAINT); return; }
      const landed = 0.4 + beat * (i + 1);
      const flash = 1 - seg(t, landed - beat + 0.3, landed - beat + 0.8);
      const icon = { PASS: '✔', WARN: '▲', FAIL: '✖' }[lvl];
      const c = STATUS[lvl];
      if (f.mono) f.text(2, row, lvl, null); else f.put(2, row, icon, c, { bold: true });
      f.text(f.mono ? 8 : 5, row, label, mixc(TITLE, WHITE, flash), { bold: true });
      f.text(25, row, detail, lvl === 'PASS' ? DIM : mixc(c, SOFT, 0.35));
      if (flash > 0 && !f.mono) for (let x = 1; x < W - 1; x++) f.glow(x, row * 2 + 1, c, 0.25 * flash);
    });
    // vitals summary
    if (shown === CHECKS.length) {
      const k = ease.out(seg(t, 0.4 + beat * CHECKS.length, 0.9 + beat * CHECKS.length));
      for (let x = 2; x < 50; x++) f.put(x, 15, '─', FAINT);
      f.text(2, 16, '✔ 4 passed', scale(STATUS.PASS, k), { bold: true }); f.text(15, 16, '▲ 1 warning', scale(STATUS.WARN, k)); f.text(29, 16, '✖ 1 failed', scale(STATUS.FAIL, k));
      f.text(2, 18, '→', ACCENT); f.text(4, 18, 'export GEMINI_API_KEY=… then run tblock doctor again', [255, 214, 190], { bold: true });
      const badge = ' CONDITION · STABLE ';
      f.text(W - badge.length - 2, 16, badge, f.mono ? null : [20, 20, 20], { solid: true, bg: f.mono ? null : scale(STATUS.WARN, k), bold: true });
    }
  },
};

// ─── ROLES: constellation under an aurora ─────────────────────────────────
const ROLES = [
  { role: 'hardest', fam: 'claude', model: 'opus 5.5', tier: 'top', effort: 'max', at: [4, 7] },
  { role: 'judgment', fam: 'claude', model: 'opus 5.5', tier: 'top', effort: 'max', at: [30, 5] },
  { role: 'code', fam: 'gpt', model: 'gpt-5.5 sol', tier: 'top', effort: 'high', at: [56, 7] },
  { role: 'swarm workers', fam: 'gpt', model: 'gpt-5.5 terra', tier: 'strong', effort: 'medium', at: [64, 13] },
  { role: 'reviewers ×3', fam: 'gemini', model: 'panel · top', tier: 'top', effort: 'xhigh', at: [38, 11] },
  { role: 'shootout runners', fam: 'gpt', model: 'panel · top', tier: 'top', effort: 'xhigh', at: [8, 14] },
  { role: 'shootout judges', fam: 'claude', model: 'panel · top', tier: 'top', effort: 'xhigh', at: [36, 17] },
];
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [4, 6], [6, 5], [5, 0]];
export const roles = {
  name: 'roles', title: 'constellation under an aurora', h: 20, dur: 5.2,
  draw(f, t) {
    // aurora: curtains whose hue walks the effort ramp
    for (let x = 0; x < W; x++) {
      const base = 5 + 3 * Math.sin(x * 0.07 + t * 0.8) + 2 * Math.sin(x * 0.19 - t * 1.3);
      const hue = ramp(EFFORT_RAMP, clamp(0.5 + 0.5 * Math.sin(x * 0.03 + t * 0.4)));
      const bright = 0.5 + 0.5 * noise(x * 0.25 + t * 1.5, 2);
      for (let y = 0; y < 34; y++) {
        const d = y - base;
        const k = d < 0 ? Math.exp(-((d / 1.6) ** 2)) : Math.exp(-d / 6);
        if (!f.mono) f.glow(x, y, hue, k * 0.55 * bright * seg(t, 0, 1));
      }
      if (bright > 0.62 && (x + Math.floor(t * 6)) % 3 === 0) for (let d = 0; d < 6; d++) f.dot(x * 2, base * 2 + d * 2 + 2, scale(hue, 0.7 - d * 0.1));
    }
    // background stars
    for (let i = 0; i < 60; i++) {
      const tw = 0.35 + 0.35 * Math.sin(t * (1 + hash(i, 2) * 3) + i);
      f.put(Math.floor(hash(i, 3) * W), 3 + Math.floor(hash(i, 4) * 17), hash(i, 5) > 0.8 ? '+' : '·', scale([200, 200, 230], tw));
    }
    // links between stars, drawn as they appear
    const starAt = (i) => 0.5 + i * 0.35;
    LINKS.forEach(([a, b], k) => {
      const t0 = Math.max(starAt(a), starAt(b)) + 0.1;
      const q = ease.inOut(seg(t, t0, t0 + 0.45));
      if (q <= 0) return;
      const [ax, ay] = ROLES[a].at; const [bx, by] = ROLES[b].at;
      const n = Math.ceil(Math.hypot((bx - ax) * 2, (by - ay) * 4));
      for (let i = 0; i <= n * q; i++) {
        if (i % 2) continue;
        const u = i / n;
        f.dot(lerp(ax, bx, u) * 2 + 1, lerp(ay, by, u) * 4 + 2, mixc(FAMILY[ROLES[a].fam], FAMILY[ROLES[b].fam], u).map((v) => v * 0.55));
      }
    });
    // stars + labels
    ROLES.forEach((r, i) => {
      const t0 = starAt(i);
      if (t < t0) return;
      const [x, y] = r.at;
      const pop = 1 - seg(t, t0, t0 + 0.4);
      const c = FAMILY[r.fam];
      const tw = 0.85 + 0.15 * Math.sin(t * 4 + i * 2);
      f.put(x, y, '✦', mixc(c, WHITE, 0.3 + pop * 0.7), { bold: true });
      if (pop > 0.2) { f.put(x - 1, y, '─', scale(c, pop)); f.put(x + 1, y, '─', scale(c, pop)); f.put(x, y - 1, '│', scale(c, pop)); f.put(x, y + 1, '│', scale(c, pop)); }
      if (!f.mono) f.glowDisk(x, y * 2 + 1, 4 + pop * 4, c, 0.5 * tw);
      const lt = seg(t, t0 + 0.15, t0 + 0.6);
      const name = r.role.slice(0, Math.ceil(r.role.length * lt));
      f.say(x + 2, y, name, TITLE, { bold: true });
      if (lt >= 1) {
        f.say(x + 2, y + 1, '● ', c); f.say(x + 4, y + 1, r.model, SOFT);
        f.blank(x + 2, y + 2, 13); effortMeter(f, x + 2, y + 2, r.effort, { word: true });
      }
    });
    title(f, 'ROLES', W - 31, 0, t, { stops: [EFFORT_RAMP[0], EFFORT_RAMP[2], EFFORT_RAMP[4]], sx: 1, sy: 1 });
    f.say(W - 31, 3, 'preset extreme · 7 roles', DIM);
  },
};

// ─── MODELS / TIERS: circuit board ────────────────────────────────────────
const CHIPS = [
  { fam: 'claude', label: 'CLAUDE', models: ['claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5'] },
  { fam: 'gpt', label: 'GPT', models: ['gpt-5.5-sol', 'gpt-5.5-terra', 'gpt-5.5-luna'] },
  { fam: 'gemini', label: 'GEMINI', models: ['gemini-3-pro', 'gemini-3-flash', 'gemini-3-flash-lite'] },
];
const TIERS = ['TOP', 'STRONG', 'FAST'];
const CHIP_ROWS = [4, 10, 16];
const TRACES = (() => {
  const list = [];
  CHIPS.forEach((c, fi) => TIERS.forEach((_, ti) => {
    const y0 = CHIP_ROWS[fi] + 1 + ti; const y1 = CHIP_ROWS[ti] + 1 + fi;
    const cx = 24 + (fi * 3 + ti) * 3 + (ti === fi ? 0 : 1);
    const cells = [];
    for (let x = 15; x <= cx; x++) cells.push([x, y0]);
    const dir = Math.sign(y1 - y0);
    for (let y = y0 + dir; dir && y !== y1; y += dir) cells.push([cx, y]);
    if (dir) cells.push([cx, y1]);
    for (let x = cx + 1; x <= 56; x++) cells.push([x, y1]);
    list.push({ fi, ti, cx, y0, y1, cells });
  }));
  return list;
})();
export const models = {
  name: 'models', title: 'circuit board (models · tiers)', h: 21, dur: 5.0,
  draw(f, t) {
    title(f, 'MODELS', 1, 0, t, { stops: [FAMILY.claude, FAMILY.gpt, FAMILY.gemini], sx: 1, sy: 1 });
    f.text(38, 1, '×', DIM);
    title(f, 'TIERS', 42, 0, t + 0.5, { stops: [[255, 196, 87], [255, 122, 69], [255, 77, 109]], sx: 1, sy: 1 });
    f.say(73, 1, '9/9 found', DIM);
    f.say(73, 2, 'tiers detect', FAINT);
    // PCB silk-screen dots in the background
    for (let y = 3; y < 21; y++) for (let x = 17; x < 58; x += 4) if ((x + y) % 8 === 0) f.put(x, y, '·', [44, 54, 50]);
    // traces
    const reveal = (k) => ease.out(seg(t, 0.2 + k * 0.08, 0.9 + k * 0.08));
    TRACES.forEach((tr, k) => {
      const fam = FAMILY[CHIPS[tr.fi].fam];
      const n = Math.floor(tr.cells.length * reveal(k));
      for (let i = 0; i < n; i++) {
        const [x, y] = tr.cells[i];
        const prev = tr.cells[i - 1]; const next = tr.cells[i + 1];
        const h = (p) => p && p[1] === y; const v = (p) => p && p[0] === x;
        let ch = '─';
        if (prev && next) {
          if (h(prev) && h(next)) ch = '─'; else if (v(prev) && v(next)) ch = '│';
          else { const up = (p) => p[1] < y; const left = (p) => p[0] < x; const a = v(prev) ? prev : next; const b = h(prev) ? prev : next; ch = up(a) ? (left(b) ? '╯' : '╰') : (left(b) ? '╮' : '╭'); }
        }
        const existing = f.ch[y * f.w + x];
        if ((existing === '│' && ch === '─') || (existing === '─' && ch === '│')) ch = '┼';
        f.put(x, y, ch, scale(fam, 0.42));
      }
      if (n >= tr.cells.length) {
        // packets
        for (let pk = 0; pk < 2; pk++) {
          const pos = ((t * 14 + k * 5 + pk * tr.cells.length / 2) % tr.cells.length) | 0;
          for (let tail = 0; tail < 4; tail++) {
            const cell = tr.cells[pos - tail]; if (!cell) continue;
            const ch = f.ch[cell[1] * f.w + cell[0]];
            f.put(cell[0], cell[1], tail === 0 ? '■' : ch, mixc(fam, WHITE, tail === 0 ? 0.6 : 0.2).map((v) => v * (1 - tail * 0.2)), { bold: tail === 0 });
          }
        }
        f.put(tr.cx, tr.y0, '●', scale(fam, 0.8)); f.put(tr.cx, tr.y1, '●', scale(fam, 0.8));
      }
    });
    // family chips (left)
    CHIPS.forEach((c, i) => {
      const y = CHIP_ROWS[i]; const col = FAMILY[c.fam];
      const boot = seg(t, 0.05 + i * 0.1, 0.4 + i * 0.1);
      f.blank(1, y, 14); for (let r = 0; r < 5; r++) f.blank(1, y + r, 14);
      f.box(1, y, 14, 5, scale(col, 0.4 + 0.6 * boot), 'heavy');
      f.text(3, y + 2, c.label, mixc(col, WHITE, 0.25), { bold: true });
      f.text(3, y + 1, '◢', scale(col, 0.6)); // pin-1 notch
      for (let p = 0; p < 3; p++) f.put(14, y + 1 + p, '┫', col);
      const led = Math.sin(t * 6 + i * 2) > 0;
      f.put(12, y + 3, led ? '●' : '○', led ? STATUS.PASS : FAINT);
      f.text(3, y + 3, `${c.models.length} found`, DIM);
    });
    // tier chips (right)
    TIERS.forEach((tier, i) => {
      const y = CHIP_ROWS[i];
      const col = ramp([[255, 196, 87], [255, 122, 69], [255, 77, 109]], i / 2);
      for (let r = 0; r < 5; r++) f.blank(57, y + r, 31);
      f.box(57, y, 31, 5, scale(col, 0.75), 'double');
      f.text(59, y, ` ${tier} `, mixc(col, WHITE, 0.2), { bold: true });
      CHIPS.forEach((c, fi) => {
        f.put(57, y + 1 + fi, '╢', FAMILY[c.fam]);
        const lit = seg(t, 1.0 + (fi * 3 + i) * 0.08, 1.4 + (fi * 3 + i) * 0.08);
        f.put(59, y + 1 + fi, '●', scale(FAMILY[c.fam], 0.3 + 0.7 * lit));
        f.text(61, y + 1 + fi, c.models[i].slice(0, 25), scale(SOFT, 0.35 + 0.65 * lit));
      });
    });
  },
};

// ─── PRESET: slide-rack chamber ───────────────────────────────────────────
// A stylised pistol in gunmetal: the slide racks back, the chosen preset is fed from the
// magazine into the chamber as a brass round, the slide snaps home, the sights glow.
const PRESETS = [
  { name: 'extreme', effort: 'max', note: 'top tiers · panels of 3' },
  { name: 'high', effort: 'high', note: 'strong tiers · panels of 2' },
  { name: 'efficient', effort: 'medium', note: 'session model where it can' },
];
const GUN_X = 4; const GUN_Y = 7;
function pistol(f, t, slideBack, sights) {
  const X = GUN_X; const Y = GUN_Y;
  const gm = [78, 82, 92]; const hi = [150, 156, 168]; const dark = [44, 46, 54]; const grip = [38, 38, 44];
  // grip (raked back), with stipple
  f.poly([[X + 6, Y + 10], [X + 19, Y + 10], [X + 17, Y + 14], [X + 15, Y + 31], [X + 2, Y + 31], [X + 4, Y + 18]], (x, y) => ((x * 7 + y * 3) % 5 === 0 ? [64, 64, 72] : grip));
  f.poly([[X + 1, Y + 30], [X + 16, Y + 30], [X + 16, Y + 32], [X + 1, Y + 32]], dark); // mag base plate
  f.poly([[X + 3, Y + 8], [X + 8, Y + 8], [X + 6, Y + 12], [X + 2, Y + 11]], gm); // beavertail
  // frame + rail
  f.poly([[X + 6, Y + 8], [X + 46, Y + 8], [X + 46, Y + 12], [X + 30, Y + 12], [X + 28, Y + 13], [X + 18, Y + 13], [X + 6, Y + 12]], dark);
  for (let x = X + 32; x < X + 46; x += 3) f.pset(x, Y + 12, [70, 72, 82]);
  // trigger guard + trigger
  for (let a = 0; a <= Math.PI; a += 0.05) {
    const gx = X + 24 + Math.cos(a) * 7; const gy = Y + 13 + Math.sin(a) * 6;
    f.pset(gx, gy, dark); f.pset(gx, gy - 0.6, dark);
  }
  f.pline(X + 23, Y + 13, X + 22, Y + 17, gm);
  // barrel (visible when the slide is back)
  for (let x = X + 16; x <= X + 46; x++) for (let y = Y + 2; y <= Y + 5; y++) f.pset(x, y, y === Y + 2 ? [210, 170, 110] : [150, 116, 70]);
  // slide
  const sx = -slideBack;
  for (let x = X + sx; x <= X + 46 + sx; x++) {
    for (let y = Y; y <= Y + 7; y++) {
      const ser = x < X + sx + 10 && x > X + sx + 1 && (x - X - sx) % 2 === 0 && y > Y && y < Y + 7;
      let c = y === Y ? hi : y === Y + 7 ? dark : gm;
      if (ser) c = dark;
      const port = slideBack > 2 && x > X + 20 + sx && x < X + 30 + sx && y > Y && y < Y + 5;
      if (!port) f.pset(x, y, c);
    }
  }
  f.pset(X + 46 + sx, Y + 3, [20, 20, 24]); f.pset(X + 46 + sx, Y + 4, [20, 20, 24]); // muzzle
  // sights (glow when chambered)
  const sc = mixc([60, 60, 70], [255, 196, 87], sights);
  f.pset(X + 3 + sx, Y - 1, dark); f.pset(X + 5 + sx, Y - 1, dark); f.pset(X + 4 + sx, Y - 1, mixc([60, 60, 70], [52, 211, 153], sights));
  f.pset(X + 43 + sx, Y - 1, sc);
  if (!f.mono && sights > 0) { f.glowDisk(X + 43 + sx, Y - 1, 3, [255, 196, 87], sights * 0.8); f.glowDisk(X + 4 + sx, Y - 1, 3, [52, 211, 153], sights * 0.7); }
  // slide-lock lever + takedown pin in ember
  f.pset(X + 30, Y + 9, ACCENT);
  f.pset(X + 14, Y + 9, [120, 40, 50]);
}
export const preset = {
  name: 'preset', title: 'slide-rack chamber', h: 20, dur: 4.6,
  draw(f, t) {
    title(f, 'PRESET', 2, 0, t, { sx: 1, sy: 1 });
    f.text(34, 1, 'tblock preset extreme', DIM);
    // timeline
    const back = ease.out(seg(t, 0.5, 0.8)) * (1 - ease.in(seg(t, 1.9, 2.02)));
    const slideBack = back * 10;
    const sights = ease.out(seg(t, 2.1, 2.6));
    pistol(f, t, slideBack, sights);
    // the round: brass cartridge travels from the magazine list into the chamber
    const feed = ease.inOut(seg(t, 0.9, 1.8));
    if (feed > 0 && t < 2.02) {
      const sx = lerp(60, GUN_X + 20, feed); const sy = lerp(20, GUN_Y + 3, feed) - Math.sin(feed * Math.PI) * 6;
      for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 3; dy++) f.pset(sx + dx, sy + dy, dx >= 5 ? [196, 110, 70] : dy === 0 ? [255, 222, 140] : [214, 168, 80]);
      if (!f.mono) f.glowDisk(sx + 3, sy + 1, 5, [255, 196, 87], 0.4);
    }
    // snap: shock lines + CLACK
    const snap = seg(t, 2.0, 2.05) * (1 - seg(t, 2.05, 2.5));
    if (snap > 0) {
      ['╲', '─', '╱'].forEach((c, i) => f.put(GUN_X - 3, 3 + i + Math.floor(GUN_Y / 2), c, scale([255, 240, 220], snap), { bold: true }));
      f.text(GUN_X + 14, 2, 'CLACK', scale([255, 240, 220], snap), { bold: true });
      if (!f.mono) for (let y = GUN_Y; y < GUN_Y + 8; y++) for (let x = GUN_X; x < GUN_X + 47; x++) f.glow(x, y, [255, 200, 140], snap * 0.4);
    }
    // magazine (right)
    const mx = 56;
    f.text(mx, 3, 'MAGAZINE', FAINT); f.text(mx + 9, 3, '· 3 presets', FAINT);
    PRESETS.forEach((p, i) => {
      const y = 4 + i * 2;
      const chosen = i === 0;
      const gone = chosen && t > 0.9;
      const c = gone ? FAINT : chosen ? [255, 214, 140] : SOFT;
      f.text(mx, y, gone ? '◌' : '▸', gone ? FAINT : chosen ? [255, 196, 87] : DIM);
      if (!gone) f.text(mx + 1, y, '▕██▶', f.mono ? null : mixc([214, 168, 80], [120, 90, 50], chosen ? 0 : 0.6));
      f.text(mx + 6, y, p.name, c, { bold: chosen && !gone });
      effortMeter(f, mx + 16, y, p.effort, { word: false, lit: gone ? 0.3 : 1 });
      f.text(mx + 6, y + 1, p.note, gone ? FAINT : DIM);
    });
    // chamber readout
    if (t > 2.15) {
      const k = ease.out(seg(t, 2.15, 2.7));
      f.text(mx, 11, 'CHAMBERED', scale([255, 196, 87], k), { bold: true });
      f.text(mx + 10, 11, '▸ extreme', scale([255, 236, 214], k), { bold: true });
      const rows = [['hardest', 'claude', 'max'], ['judgment', 'claude', 'max'], ['code', 'gpt', 'high'], ['reviewers ×3', 'gemini', 'xhigh'], ['swarm workers', 'gpt', 'medium']];
      const show = Math.floor(seg(t, 2.4, 3.6) * rows.length + 0.001);
      rows.slice(0, show).forEach(([r, fam, eff], i) => {
        const y = 12 + i;
        f.text(mx, y, r, SOFT); f.text(mx + 14, y, '● ', FAMILY[fam]); f.text(mx + 16, y, fam, DIM); effortMeter(f, mx + 24, y, eff, { word: false });
      });
      f.text(mx, 18, '1 chambered · 2 in the magazine', scale(FAINT, k));
    }
  },
};

// ─── WATCH: the dragon's eye ──────────────────────────────────────────────
// A great reptilian eye opens beside a live event feed; its slit pupil tracks each new event.
const EVENTS = [
  ['◆', 'planner', 'claude', 'read README, tblock.mjs'],
  ['◆', 'planner', 'claude', 'plan: 4 steps · 2 delegates'],
  ['▲', 'delegate·1', 'gpt', 'edit bin/ui.mjs  +42 −9'],
  ['▲', 'delegate·2', 'gpt', 'edit watch.mjs  +18 −3'],
  ['●', 'swarm·3', 'gpt', 'grep "createUI" · 6 hits'],
  ['▲', 'delegate·1', 'gpt', 'node --test · 31 pass'],
  ['◎', 'reviewer·1', 'gemini', 'comment: width cap at 92'],
  ['◎', 'reviewer·2', 'claude', 'approve with 1 nit'],
  ['▲', 'delegate·2', 'gpt', 'fix nit · tests green'],
  ['◆', 'planner', 'claude', 'merge · 2 files · done ✔'],
  ['◎', 'reviewer·1', 'gemini', 'approve'],
  ['●', 'swarm·3', 'gpt', 'idle'],
];
export const watch = {
  name: 'watch', title: "dragon's eye", h: 20, dur: 6.2,
  draw(f, t) {
    const CX = 18; const CY = 21; const RX = 17; const RY = 11; const IR = 9.5;
    const shown = Math.min(EVENTS.length, Math.max(0, Math.floor((t - 1.0) / 0.42) + 1));
    const open = ease.out(seg(t, 0.2, 1.0)) * (t > 3.2 && t < 3.42 ? 0.15 : 1);
    const newestRow = 4 + Math.min(shown, 14) - 1;
    const look = shown ? clamp((newestRow * 2 + 1 - CY) / 12, -1, 1) : 0;
    const dil = 1.2 + 1.3 * (0.5 + 0.5 * Math.sin(t * 1.3));
    const ix = CX + 3.5 + Math.sin(t * 0.9) * 0.6; const iy = CY + look * 3.2;
    for (let y = 0; y < f.ph; y++) {
      for (let x = 0; x < 38; x++) {
        const dx = (x - CX) / RX; const lid = RY * Math.max(0, 1 - dx * dx) ** 0.75 * open;
        const dy = y - CY;
        const rr = Math.hypot((x - CX) / 20, (y - CY) / 18);
        if (Math.abs(dy) < lid && Math.abs(dx) < 1) {
          const di = Math.hypot(x - ix, y - iy);
          if (Math.abs(Math.abs(dy) - lid) < 0.9) { f.pset(x, y, [255, 122, 69]); continue; } // lid rim
          if (di < IR) {
            const pupil = ((x - ix) / dil) ** 2 + ((y - iy) / (IR * 0.92)) ** 2 < 1;
            if (pupil) { f.pset(x, y, [8, 2, 4]); continue; }
            const ang = Math.atan2(y - iy, x - ix);
            const fib = 0.75 + 0.35 * noise(ang * 9 + 3, 4);
            const r = di / IR;
            let c = ramp([[255, 236, 150], [255, 196, 87], [255, 122, 69], [170, 30, 30], [60, 8, 10]], r * 0.9 + 0.05);
            c = scale(c, fib);
            if (Math.hypot(x - (ix - 3), y - (iy - 4)) < 1.3) c = [255, 255, 245];
            f.pset(x, y, c);
          } else {
            f.pset(x, y, mixc([70, 28, 14], [30, 8, 6], clamp(Math.abs(dy) / Math.max(1, lid))));
          }
          continue;
        }
        if (rr > 1) continue;
        // scales: offset rows of arcs, darker away from the eye
        const sy = Math.floor(y / 3); const sxo = (sy % 2) * 2;
        const lx = ((x + sxo) % 4) - 1.5; const ly = (y % 3) - 1;
        const edge = Math.hypot(lx / 2, ly / 1.5) > 0.8;
        const base = mixc([58, 20, 30], [24, 10, 18], rr);
        f.pset(x, y, edge ? mixc(base, [150, 60, 50], 0.5 * (1 - rr)) : base);
      }
    }
    if (!f.mono) f.glowDisk(ix, iy, 13, [255, 120, 40], 0.35 * open);
    // feed
    const fx = 40;
    const rec = Math.floor(t * 2) % 2 === 0;
    f.text(fx, 0, 'WATCH', [240, 236, 240], { bold: true });
    f.put(fx + 7, 0, '●', rec ? STATUS.FAIL : scale(STATUS.FAIL, 0.35));
    f.text(fx + 9, 0, 'live', STATUS.FAIL);
    f.text(fx + 15, 0, `session 7f3c · 00:${String(Math.floor(12 + t * 4)).padStart(2, '0')}`, DIM);
    for (let x = fx; x < W; x++) f.put(x, 1, '─', FAINT);
    f.text(fx, 2, 'TIME  ROLE        EVENT', FAINT);
    const start = Math.max(0, shown - 14);
    for (let i = start; i < shown; i++) {
      const [g, who, fam, what] = EVENTS[i];
      const row = 4 + (i - start) - 1;
      const age = shown - 1 - i;
      const fresh = age === 0;
      const k = fresh ? 1 : Math.max(0.35, 1 - age * 0.12);
      const ts = `04:${String(10 + i * 3).padStart(2, '0')}`;
      const tt = fresh ? seg(t, 1.0 + i * 0.42, 1.25 + i * 0.42) : 1;
      f.text(fx, row, ts, scale(DIM, k));
      f.put(fx + 6, row, g, scale(FAMILY[fam], k), { bold: fresh });
      f.text(fx + 8, row, who, scale(TITLE, k), { bold: fresh });
      f.text(fx + 20, row, what.slice(0, Math.ceil(what.length * tt)), scale(fresh ? [255, 214, 190] : SOFT, k));
      if (fresh && !f.mono) for (let x = fx; x < W; x++) f.glow(x, row * 2 + 1, ACCENT, 0.18);
    }
    f.text(fx, 18, `${shown} events · 5 agents · 2 families active`, FAINT);
    f.text(fx, 19, 'q quit · p pause · f follow', FAINT);
  },
};
