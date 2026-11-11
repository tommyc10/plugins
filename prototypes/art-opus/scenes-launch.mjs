// Splash screens: forge ignition (default), hyperspace jump, desert breach, dragonfire.
import {
  EMBER, HEAT, LOGO, WHITE, DIM, FAINT, ACCENT, ramp, mixc, scale, hash, noise, noise2, seg, ease, clamp, lerp, drawBitmap,
} from './engine.mjs';
import { W, TAGLINE, VERSION, chips, centre, emberLogo, embers, versionTag } from './common.mjs';

const LOGO_X = Math.floor((W - LOGO.w) / 2); // 12

// Typewriter text that reveals over [a, b].
const type = (f, x, y, s, t, a, b, c) => {
  const n = Math.floor(seg(t, a, b) * s.length);
  f.say(x, y, s.slice(0, n), c);
  if (n > 0 && n < s.length && !f.mono) f.put(x + n, y, '▌', ACCENT);
};

// ─── 1. FORGE ─────────────────────────────────────────────────────────────
// A molten seam opens under the logo, sparks fly up and weld each letter pixel in place,
// a white-hot quench sweeps across, a CRT glitch shudders, then it cools into the ember logo.
export const forge = {
  name: 'launch', title: 'forge ignition', h: 15, dur: 4.8,
  draw(f, t) {
    const oy = 4; const ox = LOGO_X; const lineY = 19;
    const open = ease.out(seg(t, 0.05, 0.8));
    // forge glow
    if (!f.mono) f.glowDisk(W / 2, lineY + 2, 34 * (0.3 + open), [90, 22, 16], 0.9);
    // molten seam
    const half = (LOGO.w / 2 + 6) * open;
    for (let x = Math.floor(W / 2 - half); x <= W / 2 + half; x++) {
      const n = noise(x * 0.35 - t * 4, 1);
      const edge = 1 - Math.abs(x - W / 2) / Math.max(1, half);
      f.pset(x, lineY, ramp(HEAT, clamp(0.45 + 0.45 * n + 0.2 * edge)));
      if (!f.mono) f.glow(x, lineY + 1, ramp(HEAT, 0.4 + 0.3 * n), 0.6);
    }
    embers(f, t, { n: 40, x0: ox - 4, x1: ox + LOGO.w + 4, y: lineY - 1, rise: 20, k: 0.9 * open });

    // glitch: per-row slips and an RGB split between 3.0s and 3.4s
    const g = t > 3.0 && t < 3.4;
    const fr = Math.floor(t * 30);
    const shift = g ? (y) => (hash(fr, y >> 1) > 0.55 ? Math.round((hash(fr, y + 9) - 0.5) * 10) : 0) : null;
    if (g && !f.mono) {
      drawBitmap(f, LOGO, ox - 2, oy, () => [200, 20, 60], { shift });
      drawBitmap(f, LOGO, ox + 2, oy, () => [20, 160, 200], { shift });
    }
    const shadowIn = seg(t, 2.6, 3.0);
    if (shadowIn > 0 && !g) {
      drawBitmap(f, LOGO, ox, oy, () => null, { shadow: (u, d) => scale(d === 1 ? mixc([120, 26, 48], [130, 60, 26], u) : [52, 12, 26], shadowIn), depth: 2 });
    }
    const sweep = lerp(-12, LOGO.w + 12, ease.inOut(seg(t, 2.1, 2.8)));
    LOGO.pts.forEach(([x, y], k) => {
      const u = x / (LOGO.w - 1);
      const ta = 0.55 + hash(k, 1) * 0.9 + u * 0.45; // arrival
      const ts = ta - 0.5; // launch from the seam
      if (t < ts) return;
      const sx = (shift ? shift(y) : 0);
      const tx = ox + x + sx; const ty = oy + y;
      if (t < ta) {
        const p = ease.out(seg(t, ts, ta));
        const x0 = ox + x + (hash(k, 2) - 0.5) * 34; const y0 = lineY;
        const cx = (x0 + tx) / 2 + (hash(k, 3) - 0.5) * 16; const cy = ty - 10 - hash(k, 4) * 8;
        const bx = (q) => (1 - q) ** 2 * x0 + 2 * (1 - q) * q * cx + q * q * tx;
        const by = (q) => (1 - q) ** 2 * y0 + 2 * (1 - q) * q * cy + q * q * ty;
        f.padd(bx(p), by(p), [255, 236, 190]);
        f.padd(bx(Math.max(0, p - 0.12)), by(Math.max(0, p - 0.12)), [255, 122, 69], 0.5);
        return;
      }
      let c = ramp(EMBER, u);
      if (y < 2) c = mixc(c, WHITE, 0.28);
      if (y % 2 === 1) c = scale(c, 0.82);
      c = mixc([255, 244, 214], c, ease.out(seg(t, ta, ta + 0.7))); // cool from white-hot
      const s = Math.exp(-(((x - sweep) / 5) ** 2));
      c = mixc(c, [255, 252, 240], s * 0.85);
      f.pset(tx, ty, c);
    });
    // scanline flicker during the glitch
    if (g && !f.mono) for (let x = 0; x < W; x++) f.glow(x, (fr * 7) % (f.ph), [80, 30, 40], 0.8);

    // settle: tagline types, version, then chips
    type(f, centre(f, TAGLINE), 10, TAGLINE, t, 3.4, 4.0, [236, 200, 190]);
    if (t > 3.9) versionTag(f, LOGO_X + LOGO.w - 7, 1);
    if (t > 4.1) chips(f, 12, undefined, { lit: ease.out(seg(t, 4.1, 4.6)) });
  },
};

// ─── 2. HYPERSPACE ────────────────────────────────────────────────────────
// Stars stretch into streaks, a tunnel of rings rushes past, a white flash, and the logo
// drops out of the jump at full size while the streaks relax to a slow drift.
const speedAt = (t) => (t < 0.8 ? 0.04 : t < 2.3 ? 0.04 + 5 * ease.in(seg(t, 0.8, 2.3)) : t < 2.7 ? lerp(5, 0.06, ease.out(seg(t, 2.3, 2.7))) : 0.06);
const travel = (t) => { let s = 0; for (let x = 0; x < t; x += 0.01) s += speedAt(x) * 0.01; return s; };
export const hyperspace = {
  name: 'hyperspace', title: 'hyperspace jump', h: 19, dur: 4.6,
  draw(f, t) {
    const cx = W / 2; const cy = 17; const R = 56;
    const s = travel(t); const v = speedAt(t);
    for (let i = 0; i < 160; i++) {
      const ang = hash(i, 11) * Math.PI * 2;
      const d = ((hash(i, 12) * R + s * 60) % R) + 1.5;
      const len = Math.min(34, v * 9 * (d / R) * 6);
      const warm = hash(i, 13) < 0.18;
      const head = warm ? [255, 170, 120] : [235, 240, 255];
      const tail = warm ? [140, 40, 50] : [60, 80, 200];
      const tw = v < 0.1 ? 0.5 + 0.5 * Math.sin(t * 6 + i) : 1;
      const k = clamp(d / 14) * tw;
      const steps = Math.max(1, Math.ceil(len));
      for (let j = 0; j <= steps; j++) {
        const dd = d - (len * j) / steps;
        if (dd < 1) break;
        const q = j / steps;
        const sx = cx + Math.cos(ang) * dd * 1.25; const sy = cy + Math.sin(ang) * dd * 0.7;
        if (f.mono) { if (k > 0.3) f.dot(sx * 2, sy * 2); } else f.padd(sx, sy, scale(mixc(head, tail, q), k * (1 - q * 0.7)));
      }
    }
    // tunnel rings during the jump
    const tun = seg(t, 1.3, 1.6) * (1 - seg(t, 2.2, 2.4));
    if (tun > 0) {
      for (let j = 0; j < 5; j++) {
        const r = ((t * 70 + j * 11) % 55);
        const c = scale(ramp([[96, 165, 250], [167, 139, 250], [255, 77, 109]], r / 55), tun * clamp(r / 10));
        for (let a = 0; a < 140; a++) {
          const th = (a / 140) * Math.PI * 2;
          f.dot(cx * 2 + Math.cos(th) * r * 2.5, cy * 2 + Math.sin(th) * r * 1.4, c);
        }
      }
    }
    // flash
    const flash = seg(t, 2.25, 2.35) * (1 - seg(t, 2.35, 2.9));
    if (flash > 0 && !f.mono) for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) f.glow(x, y, [255, 250, 240], flash * (1 - Math.hypot((x - cx) / 60, (y - cy) / 30) * 0.6));
    // logo drops out of the jump
    const oy = 10;
    if (t > 2.3) {
      const p = ease.out(seg(t, 2.3, 3.1));
      const z = lerp(3.2, 1, p);
      const lcx = LOGO_X + LOGO.w / 2; const lcy = oy + LOGO.h / 2;
      const hot = 1 - seg(t, 2.6, 3.4);
      if (z > 1.02) {
        for (const [x, y] of LOGO.pts) {
          const c = mixc(ramp(EMBER, x / LOGO.w), WHITE, hot);
          f.disk(lcx + (LOGO_X + x - lcx) * z, lcy + (oy + y - lcy) * z, z * 0.55, c);
        }
      } else {
        emberLogo(f, LOGO_X, oy, { tint: (c) => mixc(c, WHITE, hot * 0.8) });
      }
    }
    // pre-jump HUD
    if (t < 2.2) {
      const charge = seg(t, 0.2, 2.1);
      const label = 'spooling jump drive';
      f.text(centre(f, label) - 4, 17, label, DIM);
      for (let i = 0; i < 8; i++) f.put(centre(f, label) + label.length - 2 + i, 17, i < charge * 8 ? '▰' : '▱', i < charge * 8 ? ramp([[96, 165, 250], [167, 139, 250], [255, 77, 109]], i / 7) : FAINT);
    } else {
      const msg = 'jump complete · 7 roles online · 3 model families in range';
      type(f, centre(f, msg), 16, msg, t, 3.1, 3.8, [200, 210, 240]);
      if (t > 3.6) chips(f, 18, undefined, { lit: ease.out(seg(t, 3.6, 4.2)) });
      if (t > 3.3) versionTag(f, LOGO_X + LOGO.w - 7, 8);
    }
  },
};

// ─── 3. DESERT BREACH ─────────────────────────────────────────────────────
// Dunes at dusk. The sand trembles, then a vast ringed sandworm erupts, arcs straight through
// the logo (pixels blast loose as it passes), dives back under, and the letters drift home.
const wormPath = (u) => [10 + 70 * u, 38 - 34 * Math.sin(Math.PI * u)];
const wormHead = (t) => (t - 1.5) * 0.62;
const WORM_L = 0.55;
const SKY = [[14, 8, 34], [52, 18, 66], [150, 48, 74], [236, 110, 72], [255, 170, 96]];
const ridge = (layer, x, t) => {
  if (layer === 0) return 27 + 1.6 * Math.sin(x * 0.09 + 1) + 1.2 * Math.sin(x * 0.23);
  if (layer === 1) return 30.5 + 2.2 * Math.sin(x * 0.07 + 3) + 0.8 * Math.sin(x * 0.31 + 1);
  const rumble = seg(t, 0.5, 1.5) * (1 - seg(t, 4.2, 5));
  const bumpX = lerp(-6, 12, seg(t, 0.4, 1.5));
  const bump = 3 * Math.exp(-(((x - bumpX) / 4) ** 2)) * (1 - seg(t, 1.5, 1.8));
  return 34.5 + 2 * Math.sin(x * 0.06) + 1.2 * Math.sin(x * 0.17 + 2) - bump + rumble * 0.5 * Math.sin(x * 1.7 + t * 50);
};
// Precompute which logo pixels the worm hits and when.
const DUNE_OY = 6;
const HITS = LOGO.pts.map(([x, y], k) => {
  const px = LOGO_X + x; const py = DUNE_OY + y;
  let best = 1e9; let bu = 0;
  for (let u = 0; u <= 1; u += 0.004) { const [wx, wy] = wormPath(u); const d = Math.hypot(px - wx, py - wy); if (d < best) { best = d; bu = u; } }
  if (best > 6.8) return null;
  const [wx, wy] = wormPath(bu);
  const dx = (px - wx) / (best || 1); const dy = (py - wy) / (best || 1);
  return { th: 1.5 + bu / 0.62, dx, dy, sp: 12 + hash(k, 21) * 18, rs: 4.5 + hash(k, 22) * 0.5 };
});
const DUNE_HITPOS = (k, a, h) => {
  const [x, y] = LOGO.pts[k];
  return [LOGO_X + x + h.dx * h.sp * a + (hash(k, 23) - 0.5) * 8 * a, DUNE_OY + y + h.dy * h.sp * a - 10 * a + 16 * a * a];
};
export const dune = {
  name: 'dune', title: 'desert breach', h: 20, dur: 6.4,
  draw(f, t) {
    // sky + sun
    for (let y = 0; y < 34; y++) {
      const c = ramp(SKY, y / 30);
      for (let x = 0; x < W; x++) f.glow(x, y, c, 0.85);
    }
    for (let i = 0; i < 18; i++) f.put(Math.floor(hash(i, 31) * W), Math.floor(hash(i, 32) * 5), hash(i, 33) > 0.5 ? '·' : '˙', scale([255, 220, 230], 0.4 + 0.3 * Math.sin(t * 3 + i)));
    f.disk(68, 24, 9, (x, y) => (y > 22 && y % 3 === 0 ? null : mixc([255, 214, 140], [255, 110, 84], clamp((y - 15) / 16))));
    if (!f.mono) f.glowDisk(68, 24, 22, [255, 140, 80], 0.35);
    // far and mid dunes
    [[0, [96, 42, 70], [70, 30, 58]], [1, [178, 92, 70], [120, 56, 60]]].forEach(([layer, lit, shade]) => {
      for (let x = 0; x < W; x++) {
        const top = ridge(layer, x, t); const slope = ridge(layer, x + 1, t) - top;
        for (let y = Math.ceil(top); y < f.ph; y++) f.pset(x, y, mixc(slope < 0 ? lit : shade, [20, 8, 20], clamp((y - top) / 18) * 0.5));
      }
    });
    // logo with blasted pixels
    drawBitmap(f, LOGO, LOGO_X, DUNE_OY, () => null, { shadow: (u, d) => (d === 1 ? [90, 24, 60] : [40, 12, 34]), depth: 2 });
    LOGO.pts.forEach(([x, y], k) => {
      const h = HITS[k];
      let c = ramp(EMBER, x / (LOGO.w - 1));
      if (y < 2) c = mixc(c, WHITE, 0.28);
      if (y % 2) c = scale(c, 0.84);
      if (!h || t < h.th) { f.pset(LOGO_X + x, DUNE_OY + y, c); return; }
      const end = 4.4 + hash(k, 24) * 0.3;
      const flight = Math.min(t, end) - h.th;
      const [fx, fy] = DUNE_HITPOS(k, flight, h);
      const back = ease.inOut(seg(t, end, end + 0.9));
      const hot = 1 - seg(t, h.th, h.th + 0.8);
      f.pset(lerp(fx, LOGO_X + x, back), lerp(fy, DUNE_OY + y, back), mixc(c, [255, 240, 200], hot * 0.7));
    });
    // the worm
    const uh = wormHead(t);
    if (uh > -0.05 && uh - WORM_L < 1.05) {
      const u0 = Math.max(-0.1, uh - WORM_L);
      for (let u = u0; u <= uh; u += 0.0035) {
        const [cx, cy] = wormPath(u);
        const [nx2, ny2] = wormPath(u + 0.002);
        let tx = nx2 - cx; let ty = ny2 - cy; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = ty; const ny = -tx; // normal pointing "up" along the arc
        const along = (u - u0) / WORM_L;
        const r = 2.6 + 3 * clamp(along / 0.5);
        const groove = ((u * 120) % 3.2) < 0.7;
        f.disk(cx, cy, r, (x, y) => {
          const side = ((x - cx) * nx + (y - cy) * ny) / r; // -1..1, + is lit
          const base = mixc([196, 150, 104], [120, 70, 50], clamp(0.5 - side * 0.5));
          return scale(base, groove ? 0.58 : 1);
        });
      }
      // maw
      const [hx, hy] = wormPath(uh);
      const [ax, ay] = wormPath(uh + 0.002);
      let dx = ax - hx; let dy = ay - hy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const mx = hx + dx * 3.2; const my = hy + dy * 3.2;
      for (let y = Math.floor(my - 7); y <= my + 7; y++) {
        for (let x = Math.floor(mx - 7); x <= mx + 7; x++) {
          const a = (x - mx) * dx + (y - my) * dy; const b = (x - mx) * -dy + (y - my) * dx;
          const q = Math.hypot(a / 2.6, b / 5.8);
          if (q > 1) continue;
          const ang = Math.atan2(b, a);
          if (q > 0.72) f.pset(x, y, Math.floor((ang + 4) * 4) % 2 ? [250, 240, 214] : [90, 40, 30]);
          else f.pset(x, y, mixc([255, 150, 70], [40, 6, 6], q / 0.72));
        }
      }
    }
    // near dune (hides the buried body)
    for (let x = 0; x < W; x++) {
      const top = ridge(2, x, t); const slope = ridge(2, x + 1, t) - top;
      for (let y = Math.ceil(top); y < f.ph; y++) {
        const rip = Math.sin(x * 0.9 + y * 2.4) > 0.86 ? 0.86 : 1;
        f.pset(x, y, scale(mixc(slope < 0 ? [240, 172, 100] : [186, 112, 72], [120, 60, 40], clamp((y - top) / 10)), rip));
      }
    }
    // sand spray at breach and dive
    [[13, 1.45, 1.1], [77, 2.95, 1.3]].forEach(([sx, start, span], site) => {
      for (let i = 0; i < 140; i++) {
        const te = start + hash(i, 40 + site) * span; const a = t - te;
        if (a < 0 || a > 1.1) continue;
        const vx = (hash(i, 50 + site) - 0.5) * 36; const vy = -(10 + hash(i, 60 + site) * 30);
        f.pset(sx + vx * a, 34 + vy * a + 34 * a * a, scale([248, 200, 130], 1 - a * 0.6));
      }
    });
    // engraved tagline in the sand
    if (t > 5.0) {
      const m = `${TAGLINE}  ·  v${VERSION}`;
      type(f, centre(f, m), 18, m, t, 5.0, 5.8, f.mono ? null : [70, 26, 16]);
    }
  },
};

// ─── 4. DRAGONFIRE ────────────────────────────────────────────────────────
// A wyrm in silhouette raises a wing, inhales (its throat glows), and breathes a cone of
// ember fire across a cold charcoal logo, which ignites letter by letter and cools to ember.
const MOUTH = [29, 17];
const DR_OY = 20; const DR_OX = 24;
const dragonShapes = (t) => {
  const flap = 0.86 + 0.14 * Math.sin(t * 2.6);
  const S = [6, 24];
  const wp = (x, y) => [S[0] + (x - S[0]) * (0.97 + 0.03 * flap), S[1] + (y - S[1]) * flap];
  const wing = [[6, 24], [30, 3], [46, 0], [44, 5], [58, 6], [50, 10], [53, 15], [42, 13], [36, 17], [24, 19]].map(([x, y]) => wp(x, y));
  const bones = [[[6, 24], [30, 3]], [[30, 3], [46, 0]], [[30, 3], [58, 6]], [[30, 3], [53, 15]], [[30, 3], [36, 17]]].map(([a, b]) => [wp(...a), wp(...b)]);
  return { wing, bones };
};
export const dragon = {
  name: 'dragon', title: 'dragonfire', h: 20, dur: 5.6,
  draw(f, t) {
    // night sky
    for (let y = 0; y < f.ph; y++) for (let x = 0; x < W; x++) f.glow(x, y, mixc([10, 6, 20], [34, 10, 16], y / f.ph), 1);
    for (let i = 0; i < 26; i++) f.put(Math.floor(hash(i, 70) * W), Math.floor(hash(i, 71) * 9), '·', scale([220, 210, 255], 0.3 + 0.3 * Math.sin(t * 2 + i * 3)));
    const breath = seg(t, 1.6, 1.75);
    const inhale = seg(t, 0.9, 1.6) * (1 - seg(t, 1.6, 2.0));
    const rimHot = Math.max(breath, inhale * 0.5);
    // ── dragon body into an empty pixel layer, then rim-light it
    const { wing, bones } = dragonShapes(t);
    f.poly(wing, (x, y) => mixc([92, 22, 36], [60, 14, 30], noise2(x * 0.3, y * 0.3, 5)));
    bones.forEach(([a, b], i) => f.pline(a[0], a[1], b[0], b[1], [150, 62, 58], i === 0 ? 0.8 : 0));
    for (let q = 0; q <= 1; q += 0.02) { // neck: bezier with taper and a glowing throat on inhale
      const x = (1 - q) ** 2 * -3 + 2 * (1 - q) * q * 2 + q * q * 9;
      const y = (1 - q) ** 2 * 42 + 2 * (1 - q) * q * 27 + q * q * 17;
      f.disk(x, y, lerp(7.5, 4, q), (px, py) => mixc(mixc([58, 18, 28], [40, 12, 22], noise2(px * 0.5, py * 0.5, 6)), [255, 130, 60], inhale * q * 0.8));
    }
    f.disk(-2, 41, 11, [44, 12, 22]);
    f.poly([[4, 13], [9, 10], [15, 9], [21, 10], [28, 12], [31, 14], [28, 15.5], [19, 15.5], [12, 17], [6, 17]], (x, y) => mixc([66, 20, 30], [44, 14, 24], noise2(x * 0.6, y * 0.6, 7)));
    f.poly([[8, 18], [14, 17], [28, 19], [30, 21], [15, 22], [8, 21]], [52, 16, 26]);
    f.poly([[9, 11], [0, 5], [2, 4], [13, 9.5]], [120, 90, 84]);
    f.poly([[13, 10], [7, 1], [9.5, 1], [17, 9]], [140, 104, 96]);
    for (let i = 0; i < 6; i++) f.poly([[1 + i * 1.4, 27 - i * 2.2], [-2 + i * 1.4, 24 - i * 2.2], [3 + i * 1.4, 25 - i * 2.2]], [110, 40, 46]);
    // rim light: lit edges facing the fire
    const rim = [];
    for (let y = 0; y < f.ph; y++) for (let x = 0; x < 62; x++) if (f.pget(x, y) && (!f.pget(x + 1, y) || !f.pget(x, y - 1))) rim.push([x, y]);
    rim.forEach(([x, y]) => f.pset(x, y, mixc([150, 52, 46], [255, 150, 80], rimHot * 0.55)));
    // jaws glow, teeth, eye, nostril
    f.poly([[14, 16], [29, 15.6], [29, 19], [14, 18]], mixc([30, 6, 8], [255, 200, 110], Math.max(breath, inhale)));
    [18, 21, 24, 27].forEach((x) => { f.pset(x, 16, [240, 230, 210]); f.pset(x - 1, 18, [240, 230, 210]); });
    const blink = t > 0.5 && t < 0.62;
    if (!blink) { f.pset(15, 12, [255, 210, 90]); f.pset(16, 12, [40, 10, 0]); f.pset(17, 12, [255, 180, 60]); }
    if (!f.mono && !blink) f.glowDisk(16, 12, 4, [255, 170, 60], 0.7);
    f.pset(28, 13, [20, 4, 8]);
    // smoke from the nostril, and from the jaws after the breath
    for (let i = 0; i < 24; i++) {
      const a = ((t * 0.7 + hash(i, 80)) % 1);
      const fromMouth = false;
      const sx = fromMouth ? MOUTH[0] : 28; const sy = fromMouth ? MOUTH[1] : 12;
      f.padd(sx + a * 10 + Math.sin(a * 6 + i) * 2, sy - a * 14, [90, 80, 90], 0.6 * (1 - a));
    }
    // ── the logo: charcoal until the fire front reaches each pixel
    drawBitmap(f, LOGO, DR_OX, DR_OY, () => null, { shadow: (u, d) => (d === 1 ? [70, 18, 30] : [34, 10, 18]), depth: 2 });
    LOGO.pts.forEach(([x, y], k) => {
      const X = DR_OX + x;
      const ti = 1.65 + (X - MOUTH[0]) / 85 + hash(k, 90) * 0.1;
      let final = ramp(EMBER, x / (LOGO.w - 1));
      if (y < 2) final = mixc(final, WHITE, 0.28);
      if (y % 2) final = scale(final, 0.82);
      const shimmer = t > 3.6 ? 1 + 0.12 * (noise2(x * 0.25, t * 3, 9) - 0.5) : 1;
      let c;
      if (t < ti) c = [62, 54, 60];
      else c = mixc(mixc([62, 54, 60], [255, 246, 220], seg(t, ti, ti + 0.15)), final, ease.out(seg(t, ti + 0.2, ti + 1.6)));
      f.pset(DR_OX + x, DR_OY + y, scale(c, shimmer));
    });
    // ── fire cone
    const N = 1300;
    for (let i = 0; i < N; i++) {
      const te = 1.6 + (i / N) * 4.2; const life = 0.7 + hash(i, 91) * 0.4; const a = t - te;
      if (a < 0 || a > life) continue;
      const q = a / life;
      const th = -0.08 + (hash(i, 92) - 0.5) * 0.36 + Math.sin(te * 11) * 0.05;
      const v0 = 78 + hash(i, 93) * 28;
      const dist = v0 * (a - 0.32 * a * a / life);
      const x = MOUTH[0] + Math.cos(th) * dist;
      const y = MOUTH[1] + Math.sin(th) * dist * 0.62 + (noise(te * 20 + a * 4, 94) - 0.5) * 8 * q - 7 * a * a;
      const c = ramp([[255, 250, 230], [255, 214, 110], [255, 140, 60], [255, 77, 109], [110, 20, 34], [44, 34, 40]], q);
      f.disk(x, y, 0.7 + 2.4 * q, c, true);
      if (!f.mono && q < 0.7) f.glowDisk(x, y, 5 + 4 * q, [255, 110, 50], 0.12);
    }
    embers(f, t, { n: 30, x0: DR_OX, x1: DR_OX + LOGO.w, y: DR_OY + 13, rise: 18, k: seg(t, 2.4, 3.2), seed: 97 });
    // text
    if (t > 4.1) {
      f.text(DR_OX + 1, 17, TAGLINE, [236, 200, 190]);
      versionTag(f, DR_OX + LOGO.w - 7, 17);
      chips(f, 19, undefined, { x: DR_OX - 2, lit: ease.out(seg(t, 4.1, 4.8)) });
    }
  },
};
