#!/usr/bin/env node
// Bounds and behavior checks, including actual CLI subprocesses for every scene.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCENES, WIDTH, HEIGHT, render } from './showcase.mjs';

const cli = fileURLToPath(new URL('./showcase.mjs', import.meta.url));
const strip = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
const plainEnv = { ...process.env };
for (const key of ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'WT_SESSION', 'TERM_PROGRAM']) delete plainEnv[key];
const run = (args, env = plainEnv) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', env, timeout: 10000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || `exit ${result.status}`);
  assert.equal(result.stderr, '', 'no diagnostics during rendering');
  return result.stdout;
};
const bounds = (output, label) => {
  const lines = strip(output).replace(/\n+$/, '').split('\n');
  assert.equal(lines.length, HEIGHT, `${label}: 22 rows`);
  const width = Math.max(...lines.map(line => [...line].length));
  assert.ok(width <= WIDTH && width <= 92, `${label}: ${width} columns`);
  // All selected art characters have a single terminal cell; no combining marks,
  // surrogate pairs, emoji, CJK, tabs, or other width-ambiguous grapheme sequences.
  assert.ok(!/[\t\r\u0300-\u036f\ud800-\udfff\u2e80-\ua4cf]/u.test(strip(output)), `${label}: single-cell repertoire`);
  return width;
};

let samples = 0, maxWidth = 0;
for (const scene of SCENES) {
  const output = run([scene.name, '--still']);
  assert.ok(!output.includes('\x1b'), `${scene.name}: piped output is plain`);
  maxWidth = Math.max(maxWidth, bounds(output, scene.name));
  assert.match(output, /ILLUSTRATIVE DATA/);
  for (const mode of ['none', 'truecolor', '256']) {
    for (const p of [0, .08, .2, .4, .6, .8, .99, 1]) {
      const frame = scene.draw(scene.seconds * p, p, false);
      bounds(render(frame, { mode }), `${scene.name}/${mode}/${p}`);
      samples++;
    }
    bounds(render(scene.draw(scene.seconds, 1, true), { mode }), `${scene.name}/${mode}/settled`);
    samples++;
  }
  const noColor = run([scene.name, '--still', '--color=truecolor'], { ...plainEnv, NO_COLOR: '', FORCE_COLOR: '3' });
  assert.equal(noColor, output, `${scene.name}: NO_COLOR wins over forced color`);
  const tc = run([scene.name, '--still', '--color=truecolor']);
  assert.match(tc, /\x1b\[[0-9;]*38;2;/, `${scene.name}: truecolor SGR`);
  bounds(tc, `${scene.name}/truecolor CLI`);
  const c256 = run([scene.name, '--still', '--color=256'], { ...plainEnv, COLORTERM: 'truecolor', FORCE_COLOR: '3' });
  assert.match(c256, /\x1b\[[0-9;]*38;5;/, `${scene.name}: 256 SGR`);
  assert.ok(!c256.includes('38;2;') && !c256.includes('48;2;'), '256 fallback contains no RGB codes');

  const animation = run([scene.name, '--animate', '--duration=0.13', '--fps=40', '--color=256']);
  assert.ok(animation.startsWith('\x1b[?25l'), `${scene.name}: hide cursor`);
  assert.ok(animation.endsWith('\x1b[?25h'), `${scene.name}: restore cursor`);
  assert.ok(animation.includes('\x1b[21A'), `${scene.name}: redraw in place`);
  assert.ok((animation.match(/ILLUSTRATIVE DATA/g) || []).length >= 3, `${scene.name}: multiple frames`);
  console.log(`PASS ${scene.name.padEnd(10)} ${HEIGHT} rows / <=${WIDTH} cols / mono + RGB + 256 / animated`);
}

const all = run(['--still']);
assert.equal((all.match(/ART LAB/g) || []).length, SCENES.length);
assert.equal(run([]), all, 'no args when piped prints every final frame');
for (const [group, count] of [['loaders', 3], ['commands', 6], ['outcomes', 2]]) {
  assert.equal((run([group, '--still']).match(/ART LAB/g) || []).length, count);
}
assert.ok(!run(['launch', '--still'], { ...plainEnv, FORCE_COLOR: '3', NO_COLOR: '1' }).includes('\x1b'));
const forced = run(['launch', '--still'], { ...plainEnv, FORCE_COLOR: '3' });
assert.match(forced, /38;2;/);
const fallback = run(['launch', '--still'], { ...plainEnv, FORCE_COLOR: '1', TERM_PROGRAM: 'unknown' });
assert.match(fallback, /38;5;/);
assert.ok(!fallback.includes('38;2;'));
for (const args of [['bogus'], ['--fps=0'], ['--color=purple'], ['--duration'], ['--still=yes']]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: plainEnv });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^art-sol:/);
  assert.ok(!result.stdout.includes('\x1b[?25l'), 'invalid input never hides the cursor');
}
console.log(`\n${SCENES.length} scenes; ${samples} sampled frames; maximum visible width ${maxWidth}; all checks passed.`);
