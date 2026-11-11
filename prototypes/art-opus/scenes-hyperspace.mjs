// Five takes on the hyperspace launch: cockpit, starforge, event horizon, fleet jump, drop-out.
import {
  EMBER, FAMILY, EFFORT_RAMP, EFFORTS, STATUS, WHITE, DIM, FAINT, ACCENT, LOGO, ramp, mixc, scale, hash, noise, seg, ease, clamp, lerp,
} from './engine.mjs';
import { W, VERSION, chips, centre, emberLogo } from './common.mjs';

const LOGO_X = Math.floor((W - LOGO.w) / 2); // 12
const LG = new Uint8Array(LOGO.w * LOGO.h);
LOGO.pts.forEach(([x, y]) => { LG[y * LOGO.w + x] = 1; });
const logoAt = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < LOGO.w && y < LOGO.h && LG[y * LOGO.w + x] === 1; };
const logoColor = (x, y) => { let c = ramp(EMBER, x / (LOGO.w - 1)); if (y < 2) c = mixc(c, WHITE, 0.28); return y % 2 ? scale(c, 0.82) : c; };

// Integrates a speed curve so star positions stay a pure function of t.
const travel = (speedAt, t) => { let s = 0; for (let x = 0; x < t; x += 0.01) s += speedAt(x) * 0.01; return s; };

const type = (f, x, y, s, t, a, b, c) => {
  const n = Math.floor(seg(t, a, b) * [...s].length);
  f.say(x, y, [...s].slice(0, n).join(''), c);
  if (n > 0 && n < [...s].length && !f.mono) f.put(x + n, y, '▌', ACCENT);
};

// Radial warp field: stars at distance d stream outward; streak length follows speed v.
function warpField(f, s, v, { cx, cy, n = 160, R = 56, seed = 11, sx = 1.25, sy = 0.7, mask = null, k = 1, cool = [60, 80, 200], hot = [235, 240, 255] } = {}) {
  for (let i = 0; i < n; i++) {
    const ang = hash(i, seed) * Math.PI * 2;
    const d = ((hash(i, seed + 1) * R + s * 60) % R) + 1.5;
    const len = Math.min(34, v * 54 * (d / R));
    const warm = hash(i, seed + 2) < 0.18;
    const head = warm ? [255, 170, 120] : hot; const tail = warm ? [140, 40, 50] : cool;
    const kk = clamp(d / 14) * k * (v < 0.1 ? 0.55 + 0.45 * Math.sin(s * 40 + i) : 1);
    const steps = Math.max(1, Math.ceil(len));
    for (let j = 0; j <= steps; j++) {
      const dd = d - (len * j) / steps; if (dd < 1) break;
      const q = j / steps;
      const x = cx + Math.cos(ang) * dd * sx; const y = cy + Math.sin(ang) * dd * sy;
      if (mask && !mask(x, y)) continue;
      if (f.mono) { if (kk > 0.3 && (j === 0 || len > 3)) f.dot(x * 2, y * 2); } else f.padd(x, y, scale(mixc(head, tail, q), kk * (1 - q * 0.7)));
    }
  }
}

// ─── 1. COCKPIT ───────────────────────────────────────────────────────────
// First person: canopy struts and a dashboard. The throttle is pulled notch by notch through the
// effort ramp, the stars stretch past the glass, the canopy flares, and the logo locks onto the HUD.
const topY = (x) => 3 + 2.2 * ((x - 44) / 44) ** 2;
const xL = (y) => ((y - 6) * 16) / 22; const xR = (y) => 87 - ((y - 6) * 16) / 22;
const DASH = 28;
const region = (x, y) => {
  if (y >= DASH) return 'dash';
  if (y < topY(x)) return 'top';
  if (x < xL(y) || x > xR(y)) return 'hull';
  if (x < xL(y) + 3 || x > xR(y) - 3 || y < topY(x) + 1.2) return 'strut';
  return 'win';
};
const throttleAt = (t) => { const n = ease.inOut(seg(t, 0.4, 2.2)) * 6; const fl = Math.min(5, Math.floor(n)); return (fl + ease.inOut(clamp(n - fl))) / 6; };
const cockpitSpeed = (t) => (t < 2.2 ? 0.04 + 4.6 * throttleAt(t) ** 3 : t < 2.55 ? 6 : t < 3.1 ? lerp(6, 0.1, ease.out(seg(t, 2.55, 3.1))) : 0.1);
export const cockpit = {
  name: 'hyperspace-cockpit', title: 'throttle up from the cockpit', h: 20, dur: 5.6,
  draw(f, t) {
    const p = throttleAt(t); const v = cockpitSpeed(t); const pc = ramp(EFFORT_RAMP, p);
    const flash = seg(t, 2.2, 2.32) * (1 - seg(t, 2.32, 3.0));
    warpField(f, travel(cockpitSpeed, t), v, { cx: 44, cy: 15, n: 170, mask: (x, y) => region(x, y) === 'win', cool: mixc([60, 80, 200], pc, 0.4) });
    // HUD logo: scanned in after the jump
    if (t > 2.6) {
      const rev = seg(t, 2.6, 3.4) * 12;
      const fl = t < 3.5 && hash(Math.floor(t * 30), 1) > 0.8 ? 0.5 : 1;
      for (const [x, y] of LOGO.pts) {
        if (y > rev) continue;
        const edge = Math.abs(y - rev) < 1.2 && rev < 12;
        f.pset(LOGO_X + x, 6 + y, scale(mixc(logoColor(x, y), WHITE, edge ? 0.8 : 0), fl));
      }
    }
    // canopy glass: standing glare + the flare
    if (!f.mono) {
      for (let y = 4; y < DASH; y++) for (let x = 6; x < 82; x++) {
        if (region(x, y) !== 'win') continue;
        const glare = Math.exp(-(((x - 0.9 * y - 52) / 2.2) ** 2)) * 0.08 + Math.exp(-(((x - 0.9 * y - 58) / 1) ** 2)) * 0.05;
        if (glare > 0.01) f.glow(x, y, [180, 200, 255], glare);
        if (flash > 0) f.glow(x, y, mixc([255, 250, 240], pc, 0.2), flash * (0.9 - Math.abs(y - 15) / 30));
        const streak = Math.exp(-(((y - 15) / 0.9) ** 2)) * seg(t, 2.2, 2.4) * (1 - seg(t, 2.6, 4.2)) * 0.6;
        if (streak > 0.01) f.glow(x, y, [200, 220, 255], streak);
      }
      const ghosts = [[0.35, 3, [94, 234, 212]], [0.7, 5, [167, 139, 250]], [1.25, 2.5, [255, 77, 109]], [1.55, 6, [96, 165, 250]]];
      const gk = seg(t, 2.25, 2.5) * (0.6 - 0.4 * seg(t, 2.6, 3.6));
      ghosts.forEach(([q, r, c]) => f.glowDisk(lerp(66, 44, q), lerp(7, 15, q), r, c, gk));
    }
    // the canopy frame, hull and dashboard (pixels over the stars)
    for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) {
      const r = region(x, y);
      if (r === 'win') continue;
      if (r === 'hull') f.pset(x, y, (x * 3 + y * 7) % 23 === 0 ? [62, 60, 72] : [24, 22, 30]);
      else if (r === 'top') f.pset(x, y, y > topY(x) - 1 ? [96, 98, 112] : [32, 30, 40]);
      else if (r === 'strut') {
        const inner = x < 44 ? x - xL(y) : xR(y) - x;
        const base = inner > 2 ? [170, 172, 186] : inner > 1 ? [110, 112, 126] : [70, 70, 84];
        f.pset(x, y, mixc(base, mixc(WHITE, pc, 0.5), flash * 0.7));
      } else f.pset(x, y, y === DASH ? [96, 98, 112] : y === DASH + 1 ? [44, 42, 54] : [28, 26, 34]);
    }
    // HUD
    const hud = scale(ACCENT, 0.75);
    [[16, 3, '┌'], [71, 3, '┐'], [18, 12, '└'], [69, 12, '┘']].forEach(([x, y, c]) => f.put(x, y, c, hud));
    f.text(41, 11, '╶─┼─╴', t > 3.4 ? STATUS.PASS : hud);
    f.say(20, 12, t < 2.2 ? `VEL ${(p * 0.99).toFixed(2)}c` : t < 3.1 ? 'VEL  ∞  ' : 'VEL 0.12c', hud);
    f.say(56, 12, t > 3.4 ? 'TARGET LOCK' : 'HDG 044', t > 3.4 ? STATUS.PASS : hud);
    // dashboard: throttle
    const word = EFFORTS[Math.round(p * 6)];
    f.text(3, 15, 'THROTTLE', FAINT); f.text(12, 15, `effort ${word}`, pc, { bold: true });
    f.put(3, 16, '▕', DIM); f.put(35, 16, '▏', DIM);
    const knob = 4 + Math.round(p * 30);
    for (let x = 4; x <= 34; x++) f.put(x, 16, x < knob ? '━' : '─', x < knob ? ramp(EFFORT_RAMP, (x - 4) / 30) : FAINT);
    f.put(knob, 16, '█', mixc(pc, WHITE, 0.3), { bold: true });
    f.pset(knob, 31, mixc(pc, WHITE, 0.5));
    ['none', 'min', 'low', 'med', 'high', 'xhi', 'max'].forEach((s, i) => f.text(4 + i * 5 - (i === 6 ? 1 : 0), 17, s, i === Math.round(p * 6) ? mixc(ramp(EFFORT_RAMP, i / 6), WHITE, 0.3) : scale(ramp(EFFORT_RAMP, i / 6), 0.45)));
    f.text(3, 19, t < 2.2 ? '◉ JUMP ARMED' : t < 3.1 ? '◉ JUMPING' : '◉ ARRIVED', t < 2.2 ? STATUS.WARN : t < 3.1 ? mixc(WHITE, pc, 0.3) : STATUS.PASS, { bold: true });
    // dashboard: warp lamp
    f.disk(44, 34, 2.6, mixc(scale(pc, 0.3 + 0.7 * p), WHITE, flash));
    if (!f.mono) f.glowDisk(44, 34, 7, pc, 0.25 + 0.5 * p);
    f.text(42, 19, 'WARP', FAINT);
    // dashboard: gauges + radar
    [['FLUX', p], ['CORE', 0.4 + 0.6 * p], ['HULL', 1]].forEach(([g, lv], i) => {
      f.text(51, 15 + i, g, FAINT);
      for (let k = 0; k < 6; k++) f.put(56 + k, 15 + i, k < Math.round(lv * 6) ? '▰' : '▱', k < Math.round(lv * 6) ? ramp(EFFORT_RAMP, k / 5) : FAINT);
    });
    f.text(51, 19, `roles 7 · v${VERSION}`, FAINT);
    const rx = 78 * 2; const ry = 17 * 4 + 2;
    for (let a = 0; a < 48; a++) { const th = (a / 48) * Math.PI * 2; f.dot(rx + Math.cos(th) * 10, ry + Math.sin(th) * 8, scale(STATUS.PASS, 0.45)); }
    const sw = t * 3;
    for (let r = 0; r < 10; r++) f.dot(rx + Math.cos(sw) * r, ry + Math.sin(sw) * r * 0.8, STATUS.PASS);
    [[3, 2], [-5, -3], [6, -4]].forEach(([bx, by], i) => f.dot(rx + bx, ry + by, [FAMILY.claude, FAMILY.gpt, FAMILY.gemini][i]));
  },
};

// ─── 2. STARFORGE ─────────────────────────────────────────────────────────
// Streaks rush outward, the field freezes, then hundreds of stars rush back in, braking hard
// into the exact pixels of the logo, which stays made of stars: dust, bright points, twinkle,
// and faint constellation lines charted around it.
const SF_OX = LOGO_X; const SF_OY = 10;
const SF_C = [SF_OX + LOGO.w / 2, SF_OY + LOGO.h / 2];
const SF_SPEED = (t) => (t < 0.2 ? 0.05 : t < 1.4 ? 0.05 + 4.5 * ease.in(seg(t, 0.2, 1.4)) : t < 1.75 ? lerp(4.5, 0, ease.out(seg(t, 1.4, 1.75))) : 0);
const SF_ANCHORS = [[-14, -5], [2, 1], [11, 0], [23, 0], [33, 4], [45, 4], [54, 0], [70, -6], [76, 4], [61, 11], [70, 16], [25, 11], [32, 17], [4, 11], [-10, 15]];
const SF_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [11, 12], [13, 14], [0, 14]];
export const starforge = {
  name: 'hyperspace-starforge', title: 'stars brake into the logo', h: 19, dur: 5.8,
  draw(f, t) {
    warpField(f, travel(SF_SPEED, t), SF_SPEED(t), { cx: 44, cy: 16, n: 150, seed: 31, k: 0.8 });
    // constellation chart (under the logo stars)
    const cl = seg(t, 3.4, 4.6);
    if (cl > 0) {
      SF_LINKS.forEach(([a, b], i) => {
        const q = seg(cl * SF_LINKS.length, i, i + 1); if (q <= 0) return;
        const [ax, ay] = SF_ANCHORS[a]; const [bx, by] = SF_ANCHORS[b];
        const n = Math.ceil(Math.hypot(bx - ax, (by - ay)) * 2.2);
        for (let j = 0; j <= n * q; j++) {
          if (j % 2) continue;
          const lx = lerp(ax, bx, j / n); const ly = lerp(ay, by, j / n);
          if (logoAt(lx, ly) || logoAt(lx + 0.5, ly) || logoAt(lx, ly + 0.5)) continue;
          f.dot((SF_OX + lx) * 2, (SF_OY + ly) * 2, [120, 130, 220]);
        }
      });
      SF_ANCHORS.forEach(([x, y], i) => { if (!logoAt(x, y) && (x < 0 || x > 62 || y < 0 || y > 11)) f.put(SF_OX + x, (SF_OY + y) / 2, '✦', scale([200, 210, 255], 0.5 + 0.5 * Math.sin(t * 3 + i))); });
    }
    let locked = 0;
    LOGO.pts.forEach(([x, y], k) => {
      const tx = SF_OX + x; const ty = SF_OY + y;
      let dx = tx - SF_C[0]; let dy = (ty - SF_C[1]) * 2.4; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const far = 60 + hash(k, 1) * 40;
      const sx = tx + dx * far; const sy = ty + dy * far * 0.45;
      const ta = 1.9 + hash(k, 2) * 0.7 + (d / 40) * 0.6; const ts = ta - 0.85;
      if (t < ts) return;
      if (t < ta) {
        const e = ease.expo(seg(t, ts, ta));
        const px = lerp(sx, tx, e); const py = lerp(sy, ty, e);
        const tl = Math.min(1, (1 - e) * 0.3 + 0.015);
        const ex = lerp(px, sx, tl); const ey = lerp(py, sy, tl);
        const n = Math.max(1, Math.ceil(Math.hypot(ex - px, ey - py)));
        for (let j = 0; j <= n; j++) {
          const q = j / n; const x2 = lerp(px, ex, q); const y2 = lerp(py, ey, q);
          if (f.mono) { if (j === 0) f.pset(x2, y2, WHITE); else if (j % 2 === 0) f.dot(x2 * 2, y2 * 2); } else f.padd(x2, y2, mixc([255, 250, 235], [70, 90, 220], q), 1 - q * 0.8);
        }
        return;
      }
      locked++;
      const age = t - ta; const fl = 1 - seg(age, 0, 0.5);
      const bright = hash(k, 3) < 0.3;
      const tw = 0.65 + 0.35 * Math.sin(t * (2 + hash(k, 4) * 6) + k);
      const base = ramp(EMBER, x / (LOGO.w - 1));
      let c = bright ? scale(mixc(base, WHITE, 0.55), 0.75 + 0.25 * tw) : scale(base, 0.5 * (0.85 + 0.15 * tw));
      c = mixc(c, WHITE, fl * 0.85);
      f.pset(tx, ty, c);
      if (bright && !f.mono && tw > 0.8) f.glowDisk(tx, ty, 2, mixc(base, WHITE, 0.5), 0.3);
    });
    f.say(2, 0, `${locked} stars locked`.padEnd(18), DIM);
    if (t > 4.4) {
      const msg = `forged from ${LOGO.pts.length} stars · 7 roles in fixed orbit`;
      type(f, centre(f, msg), 17, msg, t, 4.4, 5.0, [210, 214, 250]);
      chips(f, 18, undefined, { lit: ease.out(seg(t, 4.9, 5.5)) });
    }
  },
};

// ─── 3. EVENT HORIZON ─────────────────────────────────────────────────────
// A black hole with a spinning, Doppler-bright accretion disk lenses the starfield. The logo
// slides in behind it and is smeared into an Einstein ring; then the hole collapses with polar
// jets and a shockwave, and the logo is flung out the other side, whole.
const EH = { cx: 44, cy: 19 };
export const horizon = {
  name: 'hyperspace-horizon', title: 'event horizon', h: 20, dur: 6.4,
  draw(f, t) {
    const mv = ease.inOut(seg(t, 3.7, 4.7));
    const cx = lerp(EH.cx, 74, mv); const cy = lerp(EH.cy, 8, mv);
    const live = lerp(1, 0.36, mv);
    const rE = 9.5 * live; const rs = 5 * live;
    const spin = seg(t, 0, 1.2);
    // lensed, frame-dragged starfield
    for (let i = 0; i < 260; i++) {
      const r0 = 2 + hash(i, 1) * 62; const a = hash(i, 2) * Math.PI * 2 + t * 0.5 * (10 / (r0 + 6)) * live;
      const dx = Math.cos(a) * r0 * 1.3; const dy = Math.sin(a) * r0 * 0.7; const r = Math.hypot(dx, dy) || 0.01;
      const root = Math.sqrt(1 + (4 * rE * rE) / (r * r));
      const tw = 0.45 + 0.35 * Math.sin(t * 4 + i * 1.7);
      const c = hash(i, 3) < 0.2 ? [255, 180, 140] : [220, 228, 255];
      [[(1 + root) / 2, 1], [(1 - root) / 2, Math.min(1, (rE * rE) / (r * r)) * 0.6]].forEach(([m, b], j) => {
        if (j === 1 && rE < 0.5) return;
        const x = cx + dx * m; const y = cy + dy * m;
        if (Math.hypot(x - cx, y - cy) < rs + 0.5) return;
        if (f.mono) { if (tw * b > 0.35) f.dot(x * 2, y * 2); } else f.padd(x, y, c, tw * b);
      });
    }
    // the logo: inverse-mapped through the lens (or clean once flung out)
    const slide = 70 * (1 - ease.inOut(seg(t, 0.5, 3.3)));
    const popQ = seg(t, 3.9, 4.6); const pop = 1 + 0.35 * Math.sin(Math.PI * popQ) * (1 - popQ * 0.3);
    const hot = 1 - seg(t, 3.9, 5.0);
    // drawn between the disk's far side and the shadow, so the lensed arcs read over the glow
    const drawLogo = () => {
      if (t >= 4.6) { emberLogo(f, LOGO_X, 13, { tint: (c) => mixc(c, WHITE, hot * 0.6) }); return; }
      for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) {
        const dx = x - cx; const dy = y - cy; const r2 = dx * dx + dy * dy;
        if (r2 < rs * rs) continue;
        const m = rE > 0 ? 1 - (rE * rE) / Math.max(r2, 0.01) : 1;
        const sx = cx + (dx * m) / pop; const sy = cy + (dy * m) / pop;
        const lx = sx - LOGO_X - slide; const ly = sy - 13;
        if (!logoAt(lx, ly)) continue;
        const mag = rE > 0 ? clamp(1 / Math.abs(1 - (rE ** 4) / (r2 * r2)), 0, 3) : 1;
        f.pset(x, y, mixc(scale(logoColor(Math.round(lx), Math.round(ly)), Math.min(1.25, 0.75 + 0.25 * mag)), WHITE, hot * (t > 3.9 ? 0.6 : 0)));
      }
    };
    // accretion disk: back half, lensed arches, shadow + photon ring, then front half
    {
      const grow = live;
      const fade = spin;
      const pts = [];
      for (let rho = 7.5; rho <= 23; rho += 0.45) {
        const n = Math.ceil(rho * 8);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const tex = noise(a * 5 + (t * 40) / rho, Math.round(rho * 3));
          const temp = 1 - (rho - 7.5) / 15.5;
          const dop = 1 - 0.5 * Math.cos(a);
          const c = scale(ramp([[60, 8, 18], [255, 77, 109], [255, 122, 69], [255, 196, 87], [255, 248, 225]], clamp(temp * 0.85 + tex * 0.25)), fade * dop * (0.45 + 0.7 * tex));
          const R = rho * grow;
          pts.push([cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 0.24, c, Math.sin(a) < 0, R]);
        }
      }
      const dk = 0.3 * live * live; // points overlap more as the disk shrinks
      for (const [x, y, c, back, R] of pts) {
        if (!back) continue;
        f.padd(x, y, c, dk);
        const w = (R * 0.92) ** 2 - ((x - cx) / 1.55) ** 2;
        if (w > 0) {
          f.padd(x, cy - Math.sqrt(w) * 0.72, c, dk * 0.8);
          if (R < 13 * live) f.padd(x, cy + Math.sqrt(w) * 0.42, c, dk * 0.35);
        }
      }
      drawLogo();
      if (rs > 0.3) {
        f.disk(cx, cy, rs, [1, 1, 2]);
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; f.pset(cx + Math.cos(a) * (rs + 0.7), cy + Math.sin(a) * (rs + 0.7), scale([255, 226, 160], spin)); }
      }
      for (const [x, y, c, back] of pts) if (!back) f.padd(x, y, c, dk);
      if (!f.mono) f.glowDisk(cx, cy, 30 * grow, [255, 110, 60], 0.18 * fade);
    }
    // polar jets, flash, shockwave
    const jet = seg(t, 3.2, 3.6) * (1 - seg(t, 4.3, 4.8));
    if (jet > 0) for (let d = 0; d < 22 * jet; d++) for (const s of [-1, 1]) { f.padd(cx, cy + s * (rs + d), mixc(WHITE, [167, 139, 250], d / 22), 1 - d / 26); if (!f.mono) f.glowDisk(cx, cy + s * (rs + d), 2.5, [167, 139, 250], 0.15); }
    const flash = seg(t, 3.95, 4.05) * (1 - seg(t, 4.05, 4.6));
    if (flash > 0 && !f.mono) for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) f.glow(x, y, [255, 246, 236], flash * 0.55);
    const sw = seg(t, 4.0, 5.2);
    if (sw > 0 && sw < 1) for (let i = 0; i < 220; i++) { const a = (i / 220) * Math.PI * 2; const r = ease.out(sw) * 60; f.dot((EH.cx + Math.cos(a) * r * 1.3) * 2, (EH.cy + Math.sin(a) * r * 0.55) * 2, scale(mixc(WHITE, [255, 122, 69], sw), 1 - sw)); }
    if (t < 3.7) f.say(2, 0, `singularity · lensing ${(seg(t, 0, 1.2) * 100).toFixed(0)}%`, DIM);
    if (t > 4.6) {
      const msg = 'flung out the far side · every role intact';
      type(f, centre(f, msg), 16, msg, t, 4.6, 5.3, [236, 206, 196]);
      chips(f, 18, undefined, { lit: ease.out(seg(t, 5.1, 5.8)) });
    }
  },
};

// ─── 4. FLEET JUMP ────────────────────────────────────────────────────────
// Three small original craft (planner/claude, delegate/gpt, reviewer/gemini) charge in formation
// and jump one after another; each light trail writes one band of the logo as it tears past.
const SHIPS = [
  { role: 'planner', fam: 'claude', x0: 2, y0: 6, art: ['##........', 'e####.....', '.#######..', 'e###oo####', '.#######..', 'e####.....', '##........'] },
  { role: 'delegate', fam: 'gpt', x0: 14, y0: 19, art: ['e#######..', '...##.....', '..#####...', 'e##oo#####', '..#####...', '...##.....', 'e#######..'] },
  { role: 'reviewer', fam: 'gemini', x0: 2, y0: 32, art: ['...###....', '..#...#...', 'e##...##..', 'e#####oo##', 'e##...##..', '..#...#...', '...###....'] },
];
const FL_OY = 14; const BAND = 4;
const launchAt = (i) => 1.7 + i * 0.6;
const shipX = (i, t) => SHIPS[i].x0 + 170 * ease.in(seg(t, launchAt(i), launchAt(i) + 0.5));
function drawShip(f, s, x, y, glow, mono) {
  const fam = FAMILY[s.fam];
  s.art.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === '.') return;
    const c = ch === '#' ? scale(mixc(fam, WHITE, ry < 3 ? 0.25 : 0), ry > 4 ? 0.7 : 1) : ch === 'o' ? [230, 245, 255] : mixc([255, 200, 140], WHITE, glow);
    f.pset(x + rx, y + ry - 3, c);
  }));
  if (!mono) f.glowDisk(x - 1, y, 3 + glow * 4, mixc(fam, WHITE, 0.4), 0.3 + glow * 0.6);
}
export const fleet = {
  name: 'hyperspace-fleet', title: 'fleet jump writes the logo', h: 20, dur: 5.8,
  draw(f, t) {
    // parallax stars, kicked by each jump
    const kick = (x) => SHIPS.reduce((s, _, i) => s + 40 * ease.out(seg(x, launchAt(i), launchAt(i) + 0.4)), 0);
    for (let i = 0; i < 90; i++) {
      const depth = 0.3 + hash(i, 2) * 0.7;
      const x = ((hash(i, 1) * W - (t * 4 + kick(t)) * depth) % W + W) % W; const y = hash(i, 3) * f.ph;
      const smear = Math.round(SHIPS.reduce((s, _, j) => s + 6 * (seg(t, launchAt(j), launchAt(j) + 0.1) * (1 - seg(t, launchAt(j) + 0.1, launchAt(j) + 0.5))), 0) * depth);
      for (let k = 0; k <= smear; k++) { if (f.mono) { if (depth > 0.6) f.dot((x + k) * 2, y * 2); } else f.padd(x + k, y, [200, 210, 255], depth * 0.7 * (1 - k / (smear + 1))); }
    }
    // the logo, written band by band
    SHIPS.forEach((s, i) => {
      const tl = launchAt(i); const { x0 } = s;
      for (const [x, y] of LOGO.pts) {
        if (Math.floor(y / BAND) !== i) continue;
        const ax = LOGO_X + x;
        const tr = tl + 0.5 * Math.cbrt(clamp((ax - x0) / 170));
        if (t < tr) continue;
        const hot = 1 - seg(t, tr, tr + 0.25);
        const c = mixc(mixc(FAMILY[s.fam], logoColor(x, y), ease.inOut(seg(t, tr + 0.4, tr + 1.8))), WHITE, hot);
        f.pset(ax, FL_OY + y, c);
      }
    });
    if (t > 4.2) for (const [x, y] of LOGO.pts) for (let d = 2; d >= 1; d--) { const sx = LOGO_X + x + d; const sy = FL_OY + y + d; if (!f.pget(sx, sy)) f.pset(sx, sy, scale(d === 1 ? [120, 26, 48] : [52, 12, 26], seg(t, 4.2, 4.8))); }
    // ships: charge, align to lanes, jump; trails stay as fading lane lines
    SHIPS.forEach((s, i) => {
      const tl = launchAt(i);
      const lane = FL_OY + i * BAND + 1.5;
      const yy = lerp(s.y0, lane, ease.inOut(seg(t, tl - 0.7, tl - 0.15))) + (t < tl - 0.7 ? Math.sin(t * 3 + i) * 0.6 : 0);
      const x = shipX(i, t);
      const charge = seg(t, 0.3 + i * 0.2, tl);
      const fam = FAMILY[s.fam];
      if (t > tl) {
        const decay = 1 - seg(t, tl + 0.5, tl + 2.2) * 0.55;
        for (let tx = s.x0; tx < Math.min(W, x); tx++) {
          const near = clamp(1 - (x - tx) / 50);
          const c = mixc(fam, WHITE, near * 0.7);
          if (!f.pget(tx, lane)) f.padd(tx, lane, c, (0.25 + 0.75 * near) * decay);
          if (!f.mono) f.glow(tx, lane + 1, fam, 0.3 * decay * near);
        }
      }
      if (x < W + 12) {
        if (t > tl) for (let g = 1; g <= 4; g++) drawShip(f, s, x - g * 4 * seg(t, tl, tl + 0.2), yy, 1, true); // motion ghosts
        drawShip(f, s, x, yy, charge, f.mono);
        if (t < tl) for (let p = 0; p < 10; p++) { const a = (t * 1.5 + hash(p, i)) % 1; const ang = hash(p, i + 9) * Math.PI * 2; f.padd(x - 1 + Math.cos(ang) * (1 - a) * 8, yy + Math.sin(ang) * (1 - a) * 5, fam, a * charge); }
      }
      if (t < tl - 0.2) {
        const lx = s.x0 + 12; const ly = Math.round(yy / 2);
        f.say(lx, ly, s.role, [240, 236, 240], { bold: true });
        f.say(lx + 9, ly, `● ${s.fam}`, fam);
        const bars = Math.round(charge * 6);
        for (let k = 0; k < 6; k++) f.put(lx + 18 + k, ly, k < bars ? '▰' : '▱', k < bars ? ramp(EFFORT_RAMP, k / 5) : FAINT);
      }
    });
    if (t > 4.4) {
      const msg = 'planner · delegate · reviewer jumped · the logo is their wake';
      type(f, centre(f, msg), 1, msg, t, 4.4, 5.0, [220, 214, 230]);
      chips(f, 18, undefined, { lit: ease.out(seg(t, 4.9, 5.5)) });
    }
  },
};

// ─── 5. DROP-OUT ──────────────────────────────────────────────────────────
// The reverse jump: streaks snap back to points behind a shockwave, revealing a star system.
// A banded gas giant sits under a ringed orbit, and the logo is printed on the ring itself,
// rotating round from the far side (mirrored, eclipsed) to face you.
const DO = { cx: 44, cy: 13, R: 33, rr: 6.4, span: 1.9, pr: 9.5 };
const DO_SPEED = (t) => (t < 1.0 ? 5 : t < 1.3 ? lerp(5, 0, ease.out(seg(t, 1.0, 1.3))) : 0);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const dropout = {
  name: 'hyperspace-dropout', title: 'drop out at a ringed world', h: 20, dur: 6.6,
  draw(f, t) {
    const { cx, cy, R, rr, span, pr } = DO;
    warpField(f, travel(DO_SPEED, t), DO_SPEED(t), { cx, cy, n: 170, seed: 51, k: t < 1.3 ? 1 : 0.7 });
    const reveal = ease.out(seg(t, 1.15, 2.0));
    // sun + flare
    if (reveal > 0) {
      f.disk(82, 3, 1.6, scale([255, 246, 220], reveal));
      if (!f.mono) { f.glowDisk(82, 3, 18, [255, 196, 120], 0.45 * reveal); for (let x = 50; x < W; x++) f.glow(x, 3, [255, 220, 170], 0.25 * reveal * clamp(1 - Math.abs(x - 82) / 30)); }
    }
    const phi = -Math.PI * 0.97 * (1 - ease.out(seg(t, 1.8, 5.4)));
    // ring dust + logo, inverse-mapped per column for both arcs of the ellipse
    const ring = (front) => {
      for (let x = cx - R - 4; x <= cx + R + 4; x++) {
        for (let rho = R - 6; rho <= R + 4; rho += 0.5) {
          if (Math.abs(rho - R + 1.5) < 0.5) continue; // gap in the rings
          const s = (x - cx) / rho; if (Math.abs(s) > 1) continue;
          const af = Math.asin(s); const a = front ? af : Math.PI - af;
          const y = cy + (rho / R) * rr * Math.cos(a);
          if (!front && Math.hypot((x - cx), (y - cy) * 1) < pr + 0.5) continue;
          const dust = 0.35 + 0.4 * noise(rho * 3.1, 7);
          if (f.mono) { if (dust > 0.55 && (x + Math.round(rho)) % 3 === 0) f.dot(x * 2, y * 2); continue; }
          f.pset(x, y, scale([170, 140, 110], dust * reveal * (front ? 1 : 0.6)));
        }
        const s = (x - cx) / R; if (Math.abs(s) > 1) continue;
        const af = Math.asin(s); const a = front ? af : Math.PI - af;
        const u = wrapA(a - phi) / span + 0.5; if (u < 0 || u > 1) continue;
        const lx = Math.round(u * (LOGO.w - 1));
        const yc = cy + rr * Math.cos(a);
        for (let ly = 0; ly < LOGO.h; ly++) {
          if (!logoAt(lx, ly)) continue;
          const y = yc + ly - 6;
          if (!front && Math.hypot(x - cx, y - cy) < pr + 0.5) continue;
          const facing = 0.45 + 0.55 * Math.max(0, Math.cos(a));
          f.pset(x + 1, y + 1, scale([60, 14, 30], reveal));
          f.pset(x, y, scale(logoColor(lx, ly), facing * reveal * (front ? 1 : 0.55)));
        }
      }
    };
    ring(false);
    // the planet: banded, lit from the upper right, ember terminator
    if (reveal > 0) {
      f.disk(cx, cy, pr, (x, y) => {
        const nx = (x - cx) / pr; const ny = (y - cy) / pr; const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lit = clamp(nx * 0.55 - ny * 0.45 + nz * 0.5);
        const band = 0.5 + 0.5 * Math.sin(ny * 9 + noise(nx * 3 + t * 0.4, 5) * 2);
        const day = mixc([96, 120, 230], [167, 139, 250], band);
        let c = mixc([10, 8, 26], day, lit);
        if (lit > 0.02 && lit < 0.16) c = mixc(c, [255, 122, 69], 0.5);
        return scale(c, reveal);
      });
      if (!f.mono) f.glowDisk(cx, cy, pr + 6, [120, 110, 255], 0.2 * reveal);
    }
    ring(true);
    // a small station-moon on its own orbit
    const ma = t * 0.9;
    if (reveal > 0 && Math.sin(ma) > -0.2) { const mx = cx + Math.cos(ma) * 18; const my = cy - 9 + Math.sin(ma) * 2; f.pset(mx, my, [230, 230, 240]); if (Math.floor(t * 3) % 2) f.pset(mx + 1, my, [255, 77, 109]); }
    // shockwave + flash at drop-out
    const flash = seg(t, 1.0, 1.08) * (1 - seg(t, 1.08, 1.6));
    if (flash > 0 && !f.mono) for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) f.glow(x, y, [235, 240, 255], flash * 0.85);
    const sw = seg(t, 1.0, 2.3);
    if (sw > 0 && sw < 1) {
      for (let i = 0; i < 260; i++) { const a = (i / 260) * Math.PI * 2; const r = ease.out(sw) * 70; f.dot((cx + Math.cos(a) * r * 1.25) * 2, (cy + Math.sin(a) * r * 0.5) * 2, scale(mixc(WHITE, [96, 165, 250], sw), 1 - sw)); }
      if (!f.mono) for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; const r = ease.out(sw) * 70; f.glow(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.5, [140, 170, 255], 0.6 * (1 - sw)); }
    }
    if (t < 1.1) f.say(2, 0, 'dropping out of warp…', DIM);
    if (t > 5.0) {
      const msg = `arrived · the tblock system · v${VERSION}`;
      type(f, centre(f, msg), 18, msg, t, 5.0, 5.6, [214, 210, 250]);
      chips(f, 19, undefined, { lit: ease.out(seg(t, 5.5, 6.2)) });
    }
  },
};
