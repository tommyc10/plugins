// Shared bits for the scenes: version, command chips, the settled ember logo, and an ember field.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EMBER, HEAT, LOGO, DIM, FAINT, ramp, mixc, scale, hash, drawBitmap, clamp } from './engine.mjs';

export const W = 88;

export const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
})();

export const TAGLINE = 'go deep first, then go fast';
export const COMMANDS = ['help', 'doctor', 'roles', 'models', 'tiers', 'preset', 'watch'];

// Command chips: tinted pills in colour, "a · b · c" in monochrome. Centred when x is null.
export function chips(f, y, items = COMMANDS, { x = null, lit = 1 } = {}) {
  if (f.mono) {
    const s = items.join(' · ');
    f.text(x ?? Math.floor((f.w - s.length) / 2), y, s);
    return;
  }
  const total = items.reduce((n, s) => n + s.length + 2, 0) + (items.length - 1);
  let cx = x ?? Math.floor((f.w - total) / 2);
  items.forEach((s, i) => {
    const tone = ramp(EMBER, i / Math.max(1, items.length - 1));
    f.text(cx, y, ` ${s} `, scale(mixc(tone, [255, 255, 255], 0.35), lit), { solid: true, bg: scale(tone, 0.2 * lit), bold: i === 0 });
    cx += s.length + 3;
  });
}

export const centre = (f, s) => Math.floor((f.w - [...s].length) / 2);

// The settled hero logo: ember gradient, bright top lip, CRT scanlines, two-step extruded shadow.
export function emberLogo(f, ox, oy, { lit = 1, scan = true, shadow = true, shift = null, tint = null } = {}) {
  drawBitmap(f, LOGO, ox, oy, (x, y, u) => {
    let c = ramp(EMBER, u);
    if (y < 2) c = mixc(c, [255, 255, 255], 0.28);
    if (scan && y % 2 === 1) c = scale(c, 0.82);
    if (tint) c = tint(c, x, y, u);
    return scale(c, lit);
  }, shadow ? { shadow: (u, d) => scale(d === 1 ? mixc([120, 26, 48], [130, 60, 26], u) : [52, 12, 26], lit), depth: 2, shift } : { shift });
}

export function versionTag(f, x, y) {
  f.text(x, y, `v${VERSION}`, DIM);
}

// Rising embers from a line: a pure function of t, so the still frame freezes them mid-flight.
export function embers(f, t, { n = 36, x0 = 0, x1 = 88, y = 30, rise = 24, seed = 3, k = 1 } = {}) {
  for (let e = 0; e < n; e++) {
    const period = 1.4 + hash(e, seed) * 1.6;
    const age = ((t / period + hash(e, seed + 1)) % 1);
    const px = x0 + hash(e, seed + 2) * (x1 - x0) + Math.sin(age * 7 + e) * 2;
    const py = y - age * rise;
    const c = ramp(HEAT, clamp(1 - age * 0.9));
    f.padd(px, py, c, k * (1 - age * 0.6));
  }
}

export { FAINT };
