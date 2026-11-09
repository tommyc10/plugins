import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SCENES, WIDTH, HEIGHT, frameFor } from './scenes.mjs';
import { main, options } from './showcase.mjs';

const runner = fileURLToPath(new URL('./showcase.mjs', import.meta.url));
const environment = { ...process.env };
delete environment.NO_COLOR;
delete environment.FORCE_COLOR;
const width = text => [...stripVTControlCharacters(text)].length;
let checked = 0;
const timings = [];

for (const scene of SCENES) {
  const start = performance.now();
  for (const mode of ['true', '256', 'mono']) {
    const fingerprints = new Set();
    for (let index = 0; index <= 54; index++) {
      const lines = frameFor(scene, scene.seconds * index / 54, { mode });
      assert.equal(lines.length, HEIGHT);
      assert.ok(lines.every(row => width(row) <= WIDTH));
      if (mode === 'mono') assert.ok(lines.every(row => !row.includes('\x1b')));
      fingerprints.add(stripVTControlCharacters(lines.join('\n')));
      checked++;
    }
    assert.ok(fingerprints.size > 20, scene.name + ' must visibly animate in ' + mode);
    assert.deepEqual(frameFor(scene, 2, { mode }), frameFor(scene, 2, { mode }));
  }
  timings.push([scene.name, (performance.now() - start) / 165]);
  for (const color of ['truecolor', '256', 'never']) {
    const result = spawnSync(process.execPath, [runner, scene.name, '--still', '--color=' + color], {
      env: color === 'never' ? { ...environment, NO_COLOR: '', FORCE_COLOR: '3' } : environment,
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.trimEnd().split('\n');
    assert.equal(rows.length, HEIGHT);
    assert.ok(rows.every(row => width(row) <= WIDTH));
    assert.equal(result.stdout.includes('\x1b['), color !== 'never');
  }
  const automatic = spawnSync(process.execPath, [runner, scene.name], { env: environment, encoding: 'utf8', timeout: 5000 });
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.equal(automatic.stdout.trimEnd().split('\n').length, HEIGHT);
  assert.ok(!automatic.stdout.includes('\x1b'));
  const animated = spawnSync(process.execPath, [runner, scene.name, '--animate', '--duration=0.32', '--color=truecolor'], {
    env: environment, encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(animated.status, 0, animated.stderr || animated.error?.message);
  assert.ok(animated.stdout.startsWith('\x1b[?25l'));
  assert.ok(animated.stdout.endsWith('\x1b[?25h'));
  assert.ok(animated.stdout.split('\x1b[21A').length >= 5);
  console.log('PASS ' + scene.name + ': still truecolor/256/NO_COLOR; pipe; animation timeout');
}

assert.equal(options([], { NO_COLOR: '', FORCE_COLOR: '3' }, { isTTY: true }).mode, 'mono');
assert.equal(options([], { COLORTERM: 'truecolor' }, { isTTY: true }).mode, 'true');
assert.equal(options([], {}, { isTTY: true }).mode, '256');
assert.equal(options([], { FORCE_COLOR: '0' }, { isTTY: false }).mode, 'mono');
assert.equal(options(['--still', '--animate'], {}, { isTTY: true }).still, true);
for (const invalid of ['--fps=0', '--fps=NaN', '--speed=Infinity', '--duration=-1', '--color=bad', '--wat', '--still=yes', '--duration']) {
  assert.throws(() => options([invalid], {}, { isTTY: false }));
}
assert.throws(() => options(['absent'], {}, { isTTY: false }));

for (const signal of ['SIGINT', 'SIGTERM']) {
  let output = '';
  const sink = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); setTimeout(done, 1); } });
  sink.isTTY = true; sink.columns = 68; sink.rows = 20;
  const previousCode = process.exitCode;
  const originalListeners = process.listenerCount(signal);
  const resize = setTimeout(() => { sink.columns = 51; sink.rows = 16; }, 45);
  const interrupt = setTimeout(() => process.emit(signal), 160);
  await main(['hyperspace-vortex', '--duration=3'], {}, sink);
  await new Promise(resolve => sink.write('', resolve));
  clearTimeout(resize); clearTimeout(interrupt);
  assert.equal(process.exitCode, signal === 'SIGINT' ? 130 : 143);
  process.exitCode = previousCode;
  assert.ok(output.includes('\x1b[?25l'));
  assert.ok(output.endsWith('\x1b[?25h'));
  assert.equal(process.listenerCount(signal), originalListeners);
  assert.ok(output.includes('\x1b[14A'));
}

let sequence = '';
await main(['--still'], {}, { write(text) { sequence += text; return true; } });
assert.equal(sequence.trimEnd().split('\n').length, HEIGHT * SCENES.length);
for (const scene of SCENES) {
  const clipped = frameFor(scene, 2, { mode: 'mono', width: 37, height: 9 });
  assert.equal(clipped.length, 9);
  assert.ok(clipped.every(row => width(row) <= 37));
}
console.log('PASS ' + checked + ' sampled frames: <=88 columns, 22 rows, deterministic, animated in monochrome');
console.log('PASS SIGINT/SIGTERM cursor restoration, listener cleanup, resize, backpressure, sequence, invalid flags');
for (const [name, milliseconds] of timings) console.log(name + ': ' + milliseconds.toFixed(2) + ' ms/frame (three modes, render only)');
