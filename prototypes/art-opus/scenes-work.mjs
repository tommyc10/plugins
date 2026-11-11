// "Agent is working" loaders: an orbit of role glyphs round a model-colour core, a molten
// heat-shimmer bar, an energy-blade progress bar, and a web-sling lane view for parallel delegates.
import {
  FAMILY, HEAT, EFFORT_RAMP, STATUS, WHITE, DIM, FAINT, ACCENT, ramp, mixc, scale, hash, noise, seg, ease, clamp, lerp, section, effortMeter,
} from './engine.mjs';
import { W } from './common.mjs';

const FAMS = ['claude', 'gpt', 'gemini'];
const famCycle = (t) => { const p = (t * 0.55) % 3; const i = Math.floor(p); return mixc(FAMILY[FAMS[i]], FAMILY[FAMS[(i + 1) % 3]], ease.inOut(p - i)); };
const SCRAMBLE = '▚▞░▒01<>/\\{}#%$*+=?';

// A line of text that decodes from noise, left to right, starting at t0.
function decode(f, x, y, s, t, t0, c) {
  [...s].forEach((ch, i) => {
    const at = t0 + i * 0.018;
    if (ch === ' ') return;
    if (t >= at + 0.12) f.put(x + i, y, ch, c);
    else if (t >= at - 0.25) f.put(x + i, y, SCRAMBLE[Math.floor(hash(i, Math.floor(t * 24)) * SCRAMBLE.length)], f.mono ? null : mixc(ACCENT, [90, 200, 160], hash(i, 7)));
  });
}

// ─── THINKING: three loaders stacked ──────────────────────────────────────
const ORBITERS = [['✦', 'claude'], ['◆', 'claude'], ['▲', 'gpt'], ['●', 'gpt'], ['■', 'gemini'], ['◈', 'gemini'], ['★', 'claude']];
const THOUGHTS = ['reading the roles file and both presets', 'mapping the call graph before cutting code', 'drafting a 4-step plan · 2 delegates · 1 panel'];
export const thinking = {
  name: 'thinking', title: 'orbit · heat shimmer · energy blade', h: 21, dur: 5.6,
  draw(f, t) {
    section(f, 0, 0, 'agents at work', W);
    // ── A. orbit ────────────────────────────────────────────────
    const cx = 13; const cy = 5.5; // cell space
    const core = famCycle(t);
    const pcx = cx; const pcy = cy * 2 + 1; // pixel space
    if (!f.mono) f.glowDisk(pcx, pcy, 11, core, 0.55);
    for (let a = 0; a < 120; a++) { // orbit ring (back half dim)
      const th = (a / 120) * Math.PI * 2;
      const front = Math.sin(th) > 0;
      f.dot((cx + Math.cos(th) * 11) * 2 + 1, (cy + Math.sin(th) * 3.1) * 4 + 2, scale(core, front ? 0.45 : 0.2));
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    f.disk(pcx, pcy, 4.6 + pulse * 0.6, (x, y, d) => {
      const hl = Math.hypot(x - (pcx - 1.6), y - (pcy - 1.8)) / 6;
      return mixc(scale(core, 0.35 + 0.65 * clamp(1 - hl)), WHITE, clamp(0.55 - hl) * 0.9);
    });
    ORBITERS.forEach(([g, fam], i) => {
      const th = t * 1.6 + (i / ORBITERS.length) * Math.PI * 2;
      const x = cx + Math.cos(th) * 11; const y = cy + Math.sin(th) * 3.1;
      const front = Math.sin(th) > -0.15;
      if (!front && Math.abs(x - cx) < 3.5) return; // hidden behind the core
      for (let k = 1; k <= 3; k++) { // trail
        const tk = th - k * 0.13;
        f.dot((cx + Math.cos(tk) * 11) * 2 + 1, (cy + Math.sin(tk) * 3.1) * 4 + 2, scale(FAMILY[fam], (front ? 0.8 : 0.4) * (1 - k / 4)));
      }
      f.put(x, y, g, scale(FAMILY[fam], front ? 1 : 0.45), { bold: front });
    });
    // planner readout
    f.text(28, 2, '◆ planner', [240, 236, 240], { bold: true });
    f.text(40, 2, '● ', FAMILY.claude); f.text(42, 2, 'claude-opus-5.5', [220, 210, 215]);
    effortMeter(f, 60, 2, 'max');
    const idx = Math.min(2, Math.floor(t / 1.8));
    decode(f, 28, 4, THOUGHTS[idx], t, idx * 1.8 + 0.1, [255, 214, 190]);
    if (!f.mono && Math.floor(t * 2) % 2) f.put(28 + THOUGHTS[idx].length + 1, 4, '▌', ACCENT);
    const secs = (4.2 + t * 2.1).toFixed(1);
    f.text(28, 6, `thought for ${secs}s · ${Math.floor(t * 1.4)} tool calls · ${Math.floor(9 + t * 3.3)}k tokens`, DIM);
    f.text(28, 7, 'core colour cycles the model families: claude → gpt → gemini', FAINT);

    // ── B. heat-shimmer bar ─────────────────────────────────────
    const p = 0.12 + 0.8 * ease.inOut(seg(t, 0.2, 5.6));
    const x0 = 2; const x1 = W - 8; const fill = Math.round(x0 + (x1 - x0) * p);
    f.text(2, 10, '▲ delegate·2', [240, 236, 240], { bold: true });
    f.text(16, 10, '● ', FAMILY.gpt); f.text(18, 10, 'gpt-5.5-terra', [220, 210, 215]);
    effortMeter(f, 33, 10, 'medium');
    f.text(48, 10, 'forging bin/ui.mjs', DIM);
    const by = 26; // bar pixel row (cell row 13)
    for (let x = x0; x <= x1; x++) {
      if (x > fill) { f.pset(x, by + 1, [50, 36, 44]); continue; }
      const n = noise(x * 0.16 - t * 2.4, 3) * 0.55 + noise(x * 0.5 + t * 1.2, 4) * 0.3;
      const edge = Math.exp(-(((fill - x) / 2.5) ** 2));
      const c = mixc(ramp(HEAT, 0.42 + n * 0.5), [255, 250, 235], edge);
      f.pset(x, by, c); f.pset(x, by + 1, scale(c, 0.78));
      if (!f.mono) { f.glow(x, by + 2, c, 0.35); f.glow(x, by - 1, c, 0.25); }
    }
    for (let x = x0; x <= fill; x++) { // heat haze in braille rising off the metal
      for (let dy = 0; dy < 8; dy++) {
        const wob = Math.sin(x * 0.55 + dy * 1.3 - t * 7) + Math.sin(x * 0.21 - dy * 0.7 + t * 3);
        if (wob > 1.25 + dy * 0.07) f.dot(x * 2 + ((dy + Math.floor(t * 8)) & 1), (11 * 4) + 7 - dy, scale([255, 140, 80], 0.75 - dy * 0.08));
      }
    }
    for (let i = 0; i < 14; i++) { // sparks off the leading edge
      const a = (t * 2.2 + hash(i, 5)) % 1;
      f.padd(fill - a * (6 + hash(i, 6) * 10), by - a * (3 + hash(i, 7) * 6) + a * a * 6, [255, 220, 150], 1 - a);
    }
    f.text(x1 + 2, 13, `${Math.round(p * 100)}%`.padStart(4), [255, 214, 190], { bold: true });

    // ── C. energy blade ─────────────────────────────────────────
    const bp = 0.08 + 0.63 * ease.inOut(seg(t, 0.8, 5.6));
    const ign = seg(t, 0.35, 0.6);
    const bx0 = 15; const bx1 = W - 9;
    const len = Math.min((bx1 - bx0) * bp, (bx1 - bx0) * bp * ease.out(ign));
    const tip = bx0 + len;
    f.text(2, 15, '◎ reviewer·1', [240, 236, 240], { bold: true });
    f.text(16, 15, '● ', FAMILY.gemini); f.text(18, 15, 'gemini-3-pro', [220, 210, 215]);
    effortMeter(f, 33, 15, 'xhigh');
    f.text(48, 15, 'reviewing 14 files', DIM);
    const blade = FAMILY.gemini;
    const fl = 0.9 + 0.1 * noise(t * 34, 9);
    // hilt (pixels, rows py 34..37)
    for (let x = 2; x <= 14; x++) {
      const ridge = x > 4 && x < 11 && x % 2 === 0;
      const metal = x >= 12 ? [196, 198, 210] : ridge ? [70, 72, 82] : [150, 152, 164];
      f.pset(x, 35, mixc(metal, WHITE, 0.25)); f.pset(x, 36, metal); f.pset(x, 37, scale(metal, 0.75));
      if (x >= 12) { f.pset(x, 34, [120, 122, 134]); f.pset(x, 38, [90, 92, 104]); }
    }
    f.pset(7, 34, ign > 0 ? [255, 77, 109] : [120, 30, 40]);
    if (len > 0.5) {
      for (let x = bx0; x <= tip; x++) {
        const tipFade = clamp((tip - x) / 2.2);
        const core = mixc(WHITE, blade, 0.12);
        f.pset(x, 36, scale(core, fl)); f.pset(x, 37, scale(core, fl * (0.6 + 0.4 * tipFade)));
        f.pset(x, 35, scale(blade, fl * (0.55 + 0.45 * tipFade))); f.pset(x, 38, scale(blade, fl * 0.55 * tipFade));
        if (!f.mono) { f.glow(x, 34, blade, 0.45 * fl); f.glow(x, 39, blade, 0.3 * fl); f.glow(x, 33, blade, 0.15); }
      }
      for (let i = 0; i < 4; i++) f.padd(tip + 1 + hash(i, Math.floor(t * 30)) * 2, 35 + hash(i + 9, Math.floor(t * 30)) * 3, WHITE, 0.7);
      if (!f.mono) f.glowDisk(tip, 36.5, 5, blade, 0.5);
    }
    f.text(bx1 + 2, 18, `${Math.round(bp * 100)}%`.padStart(4), scale(mixc(blade, WHITE, 0.4), 1), { bold: true });
    f.text(2, 20, 'orbit = planner thinking   heat bar = delegate writing   blade = reviewer progress', FAINT);
  },
};

// ─── LANES: web-sling multi-agent view ────────────────────────────────────
const LANES = [
  { name: 'swarm·1', model: 'gpt luna', fam: 'gpt', effort: 'low', start: 0.3, done: 2.9, acts: ['grep call sites', 'list 31 hits', 'grouped by file'] },
  { name: 'delegate·1', model: 'gpt terra', fam: 'gpt', effort: 'medium', start: 0.5, done: 3.8, acts: ['read roles.md', 'parse tiers', 'write tests'] },
  { name: 'delegate·2', model: 'sonnet 5.5', fam: 'claude', effort: 'high', start: 0.7, done: 5.0, acts: ['open watch.mjs', 'rewrite render', 'run checks'] },
  { name: 'reviewer·1', model: 'gemini pro', fam: 'gemini', effort: 'xhigh', start: 0.9, done: 4.5, acts: ['read the diff', 'trace edge cases', 'approve'] },
  { name: 'reviewer·2', model: 'opus 5.5', fam: 'claude', effort: 'xhigh', start: 1.1, done: 5.7, acts: ['read the diff', 'question naming', 'approve'] },
];
const ROWS = [2, 6, 10, 14, 18];
const HUB = [26, 42]; // dot space
const SPOKES = [
  ...ROWS.map((r, i) => ({ end: [72, r * 4 + 2], lane: i })),
  { end: [1, 2] }, { end: [1, 82] }, { end: [0, 42] }, { end: [44, 0] }, { end: [44, 83] },
].map((s, i) => ({ ...s, ang: Math.atan2(s.end[1] - HUB[1], s.end[0] - HUB[0]), len: Math.hypot(s.end[0] - HUB[0], s.end[1] - HUB[1]), shot: 0.1 + (s.lane ?? (i - 1)) * 0.2 }))
  .sort((a, b) => a.ang - b.ang);
const strand = (s, q) => {
  const x = lerp(HUB[0], s.end[0], q); const y = lerp(HUB[1], s.end[1], q) + Math.sin(Math.PI * q) * s.len * 0.05;
  return [x, y];
};
export const lanes = {
  name: 'lanes', title: 'web-sling delegates', h: 21, dur: 6.6,
  draw(f, t) {
    const silk = [200, 196, 214];
    // spokes slung out from the hub
    SPOKES.forEach((s) => {
      const reach = ease.out(seg(t, s.shot, s.shot + 0.4));
      if (reach <= 0) return;
      const fam = s.lane != null ? FAMILY[LANES[s.lane].fam] : silk;
      const n = Math.ceil(s.len * 1.2);
      for (let i = 0; i <= n * reach; i++) { const [x, y] = strand(s, i / n); f.dot(x, y, scale(mixc(silk, fam, 0.35), 0.75)); }
      if (reach < 1) { const [x, y] = strand(s, reach); f.put(x / 2, y / 4, '✶', [255, 255, 255], { bold: true }); }
    });
    // capture spiral: rings between neighbouring spokes, revealed one by one
    for (let k = 0; k < 7; k++) {
      const d = 9 + k * 6;
      const t0 = 1.5 + k * 0.16;
      const show = seg(t, t0, t0 + 0.5);
      if (show <= 0) continue;
      const count = Math.floor(SPOKES.length * show);
      for (let j = 0; j < count; j++) {
        const a = SPOKES[j]; const b = SPOKES[(j + 1) % SPOKES.length];
        if (d > a.len - 2 || d > b.len - 2) continue;
        const [ax, ay] = strand(a, d / a.len); const [bx, by] = strand(b, d / b.len);
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let i = 0; i <= steps; i++) {
          const q = i / steps; const sag = Math.sin(Math.PI * q) * 0.12;
          f.dot(lerp(ax, bx, q) + (HUB[0] - lerp(ax, bx, q)) * sag, lerp(ay, by, q) + (HUB[1] - lerp(ay, by, q)) * sag, scale(silk, 0.5 - k * 0.04));
        }
      }
    }
    // beads: work dispatched out along each lane strand, results riding back
    SPOKES.filter((s) => s.lane != null).forEach((s) => {
      const L = LANES[s.lane];
      if (t < s.shot + 0.4) return;
      const running = t < L.done;
      for (let b = 0; b < 2; b++) {
        const q = ((t - s.shot) * 0.8 + b * 0.5) % 1;
        const back = !running;
        if (back && t > L.done + 0.9) continue;
        const qq = back ? 1 - seg(t, L.done, L.done + 0.9) : q;
        if (back && b) continue;
        const [x, y] = strand(s, qq);
        f.put(x / 2, y / 4, '•', back ? STATUS.PASS : mixc(FAMILY[L.fam], WHITE, 0.3), { bold: true });
      }
    });
    // hub
    f.blank(5, 9, 17); f.blank(5, 10, 17); f.blank(5, 11, 17);
    f.box(5, 9, 17, 3, ACCENT, 'round');
    const spin = '◐◓◑◒'[Math.floor(t * 8) % 4];
    const allDone = t > Math.max(...LANES.map((l) => l.done)) + 0.3;
    f.put(7, 10, allDone ? '✔' : spin, allDone ? STATUS.PASS : ACCENT, { bold: true });
    f.text(9, 10, 'tblock-mode', [255, 214, 190], { bold: true });
    if (!f.mono) f.glowDisk(13, 21, 10, ACCENT, 0.35);
    // lane panel
    LANES.forEach((L, i) => {
      const r = ROWS[i]; const x = 37;
      const s = SPOKES.find((sp) => sp.lane === i);
      const linked = t > s.shot + 0.4;
      f.blank(x - 1, r, W - x + 1); f.blank(x - 1, r + 1, W - x + 1);
      const fam = FAMILY[L.fam];
      const p = seg(t, Math.max(L.start, s.shot + 0.4), L.done);
      const done = t >= L.done;
      f.put(x, r, done ? '✔' : linked ? '▸' : '·', done ? STATUS.PASS : linked ? ACCENT : FAINT, { bold: true });
      f.text(x + 2, r, L.name, linked ? [240, 236, 240] : DIM, { bold: linked });
      f.text(x + 14, r, '● ', fam); f.text(x + 16, r, L.model, linked ? [220, 210, 215] : DIM);
      effortMeter(f, x + 28, r, L.effort, { word: false, lit: linked ? 1 : 0.4 });
      if (!linked) { f.text(x + 2, r + 1, 'waiting for a thread…', FAINT); return; }
      const bw = 20; const filled = Math.round(bw * p);
      for (let k = 0; k < bw; k++) {
        const on = k < filled;
        f.put(x + 2 + k, r + 1, on ? (k === filled - 1 && !done ? '╸' : '━') : '─', on ? (done ? STATUS.PASS : mixc(scale(fam, 0.6), fam, k / bw)) : FAINT);
      }
      f.text(x + 23, r + 1, done ? `${(L.done - s.shot).toFixed(1)}s` : `${Math.round(p * 100)}%`.padStart(3), done ? STATUS.PASS : [255, 214, 190]);
      f.text(x + 29, r + 1, done ? L.acts[2] : L.acts[Math.min(2, Math.floor(p * 3))], done ? DIM : [220, 210, 215]);
      const burst = seg(t, L.done, L.done + 0.5);
      if (burst > 0 && burst < 1) '✦·✧·'.split('').forEach((c, k) => f.put(x - 1 + [0, 2, 1, 1][k], r + [0, 0, -1, 1][k] * 1, c, scale(STATUS.PASS, 1 - burst)));
    });
    section(f, 0, 0, 'multi-agent run · 5 lanes', W);
    const merged = LANES.filter((l) => t >= l.done).length;
    const line = merged === 5 ? `5/5 merged · 0 failed · ${Math.max(...LANES.map((l) => l.done)).toFixed(1)}s wall · 11.6s of agent time`
      : `${merged}/5 merged · ${5 - merged} running`;
    f.blank(0, 20, W);
    f.say(2, 20, line, merged === 5 ? STATUS.PASS : DIM, { bold: merged === 5 });
  },
};
