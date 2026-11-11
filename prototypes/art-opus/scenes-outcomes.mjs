// Outcomes: a charged shockwave + ember burst behind a stamped check, and a glitching,
// cracking, shattering failure with hazard tape.
import {
  EMBER, STATUS, HEAT, WHITE, DIM, FAINT, ACCENT, LOGO, ramp, mixc, scale, hash, noise, seg, ease, clamp, lerp, word, drawBitmap,
} from './engine.mjs';
import { W, emberLogo } from './common.mjs';

const GOLD = [255, 196, 87];

// ─── SUCCESS ──────────────────────────────────────────────────────────────
// Particles converge (charge), a ring shockwave fires, a thick check stamps in with a
// little overshoot, ember sparks arc out under gravity, and a confetti of role glyphs settles.
const CHECK = (() => { // a thick checkmark polyline in pixel space, centred on (0,0)
  const pts = [];
  const a = [-9, 0]; const b = [-3, 6]; const c = [10, -8];
  for (let q = 0; q <= 1; q += 0.02) pts.push([lerp(a[0], b[0], q), lerp(a[1], b[1], q), q * 0.32]);
  for (let q = 0; q <= 1; q += 0.01) pts.push([lerp(b[0], c[0], q), lerp(b[1], c[1], q), 0.32 + q * 0.68]);
  return pts;
})();
export const success = {
  name: 'success', title: 'all clear', h: 18, dur: 4.4,
  draw(f, t) {
    const cx = 20; const cy = 17;
    // charge: sparks spiral in
    if (t < 0.8) {
      for (let i = 0; i < 70; i++) {
        const q = ease.in(seg(t, hash(i, 1) * 0.3, 0.8));
        const a = hash(i, 2) * Math.PI * 2 + q * 2.5; const r = (1 - q) * (18 + hash(i, 3) * 20);
        f.padd(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 0.8, ramp(EMBER, hash(i, 4)), q);
      }
    }
    // shockwave rings
    for (let k = 0; k < 3; k++) {
      const q = seg(t, 0.8 + k * 0.12, 1.9 + k * 0.12);
      if (q <= 0 || q >= 1) continue;
      const r = ease.out(q) * (60 - k * 12);
      const c = scale(mixc(WHITE, STATUS.PASS, q), 1 - q);
      for (let a = 0; a < 260; a++) { const th = (a / 260) * Math.PI * 2; f.dot((cx + Math.cos(th) * r * 1.2) * 2, (cy / 2 + Math.sin(th) * r * 0.32) * 4, c); }
    }
    // burst: ember sparks under gravity, with short trails
    for (let i = 0; i < 160; i++) {
      const a0 = t - 0.85; if (a0 < 0) break;
      const life = 1.2 + hash(i, 5) * 1.4; if (a0 > life) continue;
      const th = hash(i, 6) * Math.PI * 2; const v = 18 + hash(i, 7) * 34;
      const pos = (a) => [cx + Math.cos(th) * v * a * 1.3, cy + Math.sin(th) * v * a * 0.8 + 16 * a * a];
      const q = a0 / life;
      const col = ramp([[255, 252, 230], GOLD, [255, 122, 69], [255, 77, 109], [60, 14, 24]], q);
      const [x, y] = pos(a0); const [px, py] = pos(Math.max(0, a0 - 0.05));
      f.padd(x, y, col); f.padd(px, py, col, 0.45);
    }
    // the check
    const stamp = seg(t, 0.8, 1.2);
    if (stamp > 0) {
      const z = 1 + (1 - ease.back(stamp)) * 0.8;
      const drawn = seg(t, 0.8, 1.15);
      CHECK.forEach(([x, y, q]) => {
        if (q > drawn) return;
        f.disk(cx + x * z * 1.15, cy + y * z, 2.1 * z, (px, py, d) => mixc(mixc([180, 255, 200], STATUS.PASS, q), [20, 120, 60], d * 0.7));
      });
      if (!f.mono) f.glowDisk(cx, cy, 20, STATUS.PASS, 0.45 * (0.6 + 0.4 * (1 - seg(t, 1.2, 2.5))));
    }
    // headline
    if (t > 1.3) {
      const bmp = word('ALL CLEAR', 1, 2, 1);
      const sweep = lerp(-0.2, 1.3, seg(t, 1.4, 2.4));
      const reveal = seg(t, 1.3, 1.8);
      drawBitmap(f, bmp, 34, 6, (x, y, u) => (u > reveal ? null : mixc(ramp([STATUS.PASS, [94, 234, 212], GOLD], u), WHITE, Math.exp(-(((u - sweep) / 0.07) ** 2)) * 0.8)), { shadow: [20, 70, 40] });
    }
    if (t > 2.0) {
      const k = ease.out(seg(t, 2.0, 2.5));
      f.text(37, 10, '✔ 14 passed', scale(STATUS.PASS, k), { bold: true });
      f.text(50, 10, '▲ 0', scale(FAINT, k)); f.text(55, 10, '✖ 0', scale(FAINT, k));
      f.text(61, 10, '· 2.4s', scale(DIM, k));
      f.text(37, 12, 'roles synced · copilot agents match', scale([220, 210, 215], k));
      f.text(37, 13, '3 reviewers approved · 0 nits', scale(DIM, k));
      f.text(37, 15, '→', ACCENT); f.text(39, 15, 'ready: start a task with tblock-mode', scale([255, 214, 190], k), { bold: true });
    }
    // confetti of role glyphs settling
    const G = '✦◆▲●■◈★✧';
    for (let i = 0; i < 26; i++) {
      const a = t - 1.0 - hash(i, 8) * 0.6; if (a < 0) continue;
      const x = 4 + hash(i, 9) * (W - 8) + Math.sin(a * 3 + i) * 2;
      const y = Math.min(17, -1 + a * (5 + hash(i, 10) * 4));
      if (x > 34 && x < 88 && y > 2 && y < 16) continue;
      const c = ramp([STATUS.PASS, GOLD, [255, 77, 109], [96, 165, 250]], hash(i, 11));
      f.put(x, y, G[i % G.length], scale(c, y >= 17 ? 0.5 : 1));
    }
  },
};

// ─── FAILURE ──────────────────────────────────────────────────────────────
// Running… then a hard glitch, a crack races across the glass, the logo shatters and falls into
// rubble, and FAILED slams down between scrolling hazard tape with the error and a way out.
const CRACK = (() => { // branching crack in braille dot space from an impact point
  const lines = [];
  const grow = (x, y, ang, len, depth, t0) => {
    let px = x; let py = y;
    for (let i = 0; i < len; i++) {
      ang += (hash(lines.length, depth * 31 + i) - 0.5) * 0.9;
      const nx = px + Math.cos(ang) * 4; const ny = py + Math.sin(ang) * 2.2;
      lines.push([px, py, nx, ny, t0 + i * 0.012]);
      if (depth < 2 && hash(i, depth * 7 + lines.length) > 0.9) grow(nx, ny, ang + (hash(i, 3) > 0.5 ? 0.9 : -0.9), Math.floor(len / 2), depth + 1, t0 + i * 0.012);
      px = nx; py = ny;
    }
  };
  for (let k = 0; k < 7; k++) grow(104, 30, (k / 7) * Math.PI * 2 + 0.3, 16, 0, 0);
  return lines;
})();
export const failure = {
  name: 'failure', title: 'hard fail', h: 18, dur: 4.6,
  draw(f, t) {
    const ox = 12; const oy = 8;
    const glitch = t > 0.7 && t < 1.15;
    const fr = Math.floor(t * 30);
    const shake = t > 1.9 && t < 2.3 ? Math.round(Math.sin(t * 90) * 2 * (1 - seg(t, 1.9, 2.3))) : 0;
    // 1. running state
    if (t < 1.15) {
      const shift = glitch ? (y) => (hash(fr, y >> 1) > 0.5 ? Math.round((hash(fr, y + 5) - 0.5) * 16) : 0) : null;
      if (glitch && !f.mono) {
        drawBitmap(f, LOGO, ox - 3, oy, () => [255, 0, 60], { shift });
        drawBitmap(f, LOGO, ox + 3, oy, () => [0, 220, 255], { shift });
      }
      emberLogo(f, ox, oy, { shift, tint: glitch ? (c) => mixc(c, [255, 40, 60], 0.5) : null });
      f.text(ox, 2, 'reviewers', [240, 236, 240], { bold: true });
      f.text(ox + 10, 2, '◐ 3 running · panel of 3 · xhigh', DIM);
      if (glitch) {
        for (let i = 0; i < 40; i++) f.put(hash(i, fr) * W, hash(i + 50, fr) * 18, '▓▒░█▚▞'[i % 6], hash(i, fr + 1) > 0.5 ? [255, 40, 70] : [40, 220, 255]);
      }
    } else {
      // 2. shatter: logo pixels fall with gravity, bounce once, settle as rubble
      LOGO.pts.forEach(([x, y], k) => {
        const t0 = 1.15 + Math.hypot(x - 46, y - 7) * 0.006 + hash(k, 1) * 0.08;
        const a = Math.max(0, t - t0);
        const vx = (x - 46) * 0.9 + (hash(k, 2) - 0.5) * 28; const vy = -6 - hash(k, 3) * 14;
        const floor = 34 - Math.floor(hash(k, 4) * 3 + Math.abs(Math.sin(x * 0.3)) * 2);
        let px = ox + x + vx * a * 0.6; let py = oy + y + vy * a + 40 * a * a;
        if (py > floor) py = floor;
        px = clamp(px, 0, W - 1);
        const cool = seg(t, t0, t0 + 1.6);
        f.pset(px + shake, py, mixc(ramp(EMBER, x / LOGO.w), [70, 34, 40], cool * 0.75));
      });
    }
    // 3. crack across the glass
    if (t > 1.0) {
      const lt = t - 1.0;
      CRACK.forEach(([x0, y0, x1, y1, ts]) => { if (lt > ts) f.dline(x0 + shake * 2, y0, x1 + shake * 2, y1, mixc([255, 255, 255], [200, 210, 230], seg(lt, ts, ts + 0.3))); });
      const flash = 1 - seg(t, 1.0, 1.4);
      if (flash > 0 && !f.mono) for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) f.glow(x, y, [255, 40, 60], flash * 0.5);
    }
    // 4. hazard tape
    if (t > 1.6) {
      const k = ease.out(seg(t, 1.6, 1.9));
      [0, 17].forEach((row, j) => {
        for (let x = 0; x < W; x++) {
          const on = Math.floor((x + (j ? -1 : 1) * t * 12 + row) / 3) % 2 === 0;
          f.put(x, row, f.mono ? (on ? '▚' : ' ') : '▚', on ? scale(STATUS.FAIL, k) : scale([40, 10, 14], k), { solid: true, bg: on ? scale([90, 14, 22], k) : scale([16, 6, 8], k) });
        }
      });
    }
    // 5. FAILED slams in
    if (t > 1.9) {
      const q = seg(t, 1.9, 2.1);
      const z = lerp(1.8, 1, ease.out(q));
      const bmp = word('FAILED', 2, 2, 1);
      const bx = 86 - bmp.w; const by = 7;
      for (const [x, y] of bmp.pts) {
        const sx = bx + (x - bmp.w / 2) * z + bmp.w / 2 + shake; const sy = by + (y - bmp.h / 2) * z + bmp.h / 2;
        const c = mixc([255, 200, 200], STATUS.FAIL, seg(t, 2.0, 2.6));
        f.pfront(sx + 1, sy + 1, [70, 10, 20]);
        f.pfront(sx, sy, mixc(c, [180, 30, 50], y / bmp.h * 0.5));
      }
      if (!f.mono) f.glowDisk(bx + bmp.w / 2, by + 5, 26, [255, 40, 60], 0.35 * (1 - seg(t, 2.1, 3.2)) + 0.1);
    }
    // 6. the error and the way out
    if (t > 2.5) {
      const k = ease.out(seg(t, 2.5, 3.0));
      const x = 16;
      f.say(x, 11, '✖', scale(STATUS.FAIL, k), { bold: true });
      f.say(x + 1, 11, ' reviewer panel ', scale([255, 220, 220], k), { bold: true });
      f.say(x + 17, 11, '2 of 3 reviewers rejected the change ', scale([240, 180, 180], k));
      f.say(x + 2, 12, 'reviewer·2  opus 5.5  "roles sync drops the effort for custom roles"', scale(DIM, k));
      f.say(x, 14, '→', ACCENT); f.say(x + 1, 14, ' tblock watch --last   to replay the run ', scale([255, 214, 190], k), { bold: true });
    }
  },
};
