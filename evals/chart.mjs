#!/usr/bin/env node
// Draws each ablation as a point on cost against quality and on time against quality, as two SVG files.
// Quality is the blind judges' preference for the variant over the baseline; the shaded band is the noise
// the baseline shows against itself, so a point inside it is a tie.
// Usage: node evals/chart.mjs [evals/ablations.json] [--out docs/perf]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const outAt = argv.indexOf('--out');
const out = outAt >= 0 ? argv.splice(outAt, 2)[1] : 'docs/perf';
const data = JSON.parse(readFileSync(argv[0] || 'evals/ablations.json', 'utf8'));

// Categorical slots in fixed order, validated for colour vision deficiency on the light surface.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const SHAPES = ['circle', 'square', 'diamond'];
const INK = { primary: '#0b0b0b', secondary: '#55554f', muted: '#8a8a82', grid: '#e6e5e0', band: '#efeeea', surface: '#fcfcfb' };
const W = 640;
const H = 400;
const M = { top: 56, right: 150, bottom: 64, left: 64 };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ticks = (lo, hi, n) => { const step = (hi - lo) / n; return Array.from({ length: n + 1 }, (_, i) => lo + i * step); };

function marker(shape, x, y, color) {
  const ring = `stroke="${INK.surface}" stroke-width="2"`;
  if (shape === 'square') return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="${color}" ${ring}/>`;
  if (shape === 'diamond') return `<path d="M${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} L${x - 8} ${y} Z" fill="${color}" ${ring}/>`;
  return `<circle cx="${x}" cy="${y}" r="7" fill="${color}" ${ring}/>`;
}

function chart({ key, label, unit, format, file, title, better }) {
  const vs = data.variants;
  const xs = vs.map((v) => v[key]);
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.25 || 1;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const sx = (v) => M.left + ((v - x0) / (x1 - x0)) * (W - M.left - M.right);
  const sy = (p) => M.top + (1 - p) * (H - M.top - M.bottom);
  const base = vs[0];
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${INK.surface}"/>`);
  parts.push(`<text x="${M.left}" y="24" font-size="15" font-weight="600" fill="${INK.primary}">${esc(title)}</text>`);
  parts.push(`<text x="${M.left}" y="42" font-size="12" fill="${INK.secondary}">Higher is better quality, further left is ${esc(better)}. Five tune cases, Sonnet 5.5, 5 runs each.</text>`);
  parts.push(`<rect x="${M.left}" y="${sy(base.preferHigh)}" width="${W - M.left - M.right}" height="${sy(base.preferLow) - sy(base.preferHigh)}" fill="${INK.band}"/>`);
  parts.push(`<text x="${M.left + 6}" y="${sy(base.preferLow) - 6}" font-size="11" fill="${INK.muted}">noise band: baseline judged against itself</text>`);
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${sy(p)}" y2="${sy(p)}" stroke="${INK.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${M.left - 8}" y="${sy(p) + 4}" font-size="11" text-anchor="end" fill="${INK.muted}">${Math.round(p * 100)}%</text>`);
  }
  for (const t of ticks(x0, x1, 4)) parts.push(`<text x="${sx(t)}" y="${H - M.bottom + 18}" font-size="11" text-anchor="middle" fill="${INK.muted}">${format(t)}</text>`);
  parts.push(`<text x="${(M.left + W - M.right) / 2}" y="${H - 18}" font-size="12" text-anchor="middle" fill="${INK.secondary}">${esc(label)} (${unit})</text>`);
  parts.push(`<text transform="translate(16 ${(M.top + H - M.bottom) / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${INK.secondary}">Judges prefer it over the baseline</text>`);
  vs.forEach((v, i) => {
    const x = sx(v[key]);
    const color = SERIES[i];
    parts.push(`<line x1="${x}" x2="${x}" y1="${sy(v.preferHigh)}" y2="${sy(v.preferLow)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`);
    if (v.worstCase) {
      const y = sy(v.worstCase.prefer);
      parts.push(`<line x1="${x}" x2="${x}" y1="${sy(v.worstCase.preferHigh)}" y2="${sy(v.worstCase.preferLow)}" stroke="${color}" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round" transform="translate(14 0)"/>`);
      parts.push(`<g transform="translate(14 0)">${marker(SHAPES[i], x, y, '#ffffff').replace('fill="#ffffff"', `fill="${INK.surface}" stroke="${color}"`).replace(`stroke="${INK.surface}" `, '')}</g>`);
      parts.push(`<text x="${x + 26}" y="${y + 4}" font-size="11" fill="${INK.secondary}">${esc(v.worstCase.case)}: ${Math.round(v.worstCase.prefer * 100)}%</text>`);
    }
    parts.push(marker(SHAPES[i], x, sy(v.prefer), color));
    // A variant with a worst case labels above its bar, clear of both bars. Any other labels on the side with more room.
    const others = vs.filter((o) => o !== v).map((o) => sx(o[key]));
    const roomRight = Math.min(W - M.right + 120, ...others.filter((o) => o > x)) - x;
    const roomLeft = x - Math.max(M.left, ...others.filter((o) => o < x));
    const above = Boolean(v.worstCase);
    const left = !above && roomLeft > roomRight;
    const anchor = above ? 'middle' : left ? 'end' : 'start';
    const lx = above ? x : left ? x - 14 : x + 14;
    const ly = above ? sy(v.preferHigh) - 26 : sy(v.prefer);
    parts.push(`<text x="${lx}" y="${ly}" font-size="12" font-weight="600" text-anchor="${anchor}" fill="${INK.primary}">${esc(v.name)}${v.kept ? '' : ' (rejected)'}</text>`);
    parts.push(`<text x="${lx}" y="${ly + 15}" font-size="11" text-anchor="${anchor}" fill="${INK.secondary}">${format(v[key])}, ${Math.round(v.prefer * 100)}%</text>`);
  });
  const table = vs.map((v) => `${v.name}: ${format(v[key])}, preferred ${Math.round(v.prefer * 100)}% [${Math.round(v.preferLow * 100)} to ${Math.round(v.preferHigh * 100)}]`).join('; ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" role="img" aria-label="${esc(title)}. ${esc(table)}">\n<title>${esc(title)}</title>\n<desc>${esc(table)}</desc>\n${parts.join('\n')}\n</svg>\n`;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, file), svg);
  console.log(`wrote ${join(out, file)}`);
}

chart({ key: 'costUsd', label: 'Cost per run, mean of case medians', unit: 'USD', format: (n) => `$${n.toFixed(3)}`, file: 'cost-vs-quality.svg', title: 'Cost against quality', better: 'cheaper' });
chart({ key: 'seconds', label: 'Time per run, mean of case medians', unit: 'seconds', format: (n) => `${n.toFixed(0)}s`, file: 'time-vs-quality.svg', title: 'Time against quality', better: 'faster' });
