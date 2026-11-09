#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SCENES, WIDTH, HEIGHT, frameFor } from './scenes.mjs';

export function options(argv, env, stream) {
  const names = [], flags = new Map();
  const booleans = ['still', 'animate', 'mono', '256', 'loop', 'help', 'list'];
  for (const argument of argv) {
    if (!argument.startsWith('--')) { names.push(argument); continue; }
    const [key, ...value] = argument.slice(2).split('=');
    if (![...booleans, 'color', 'fps', 'speed', 'duration'].includes(key)) throw new Error('Unknown option: --' + key);
    if (booleans.includes(key) && value.length) throw new Error('--' + key + ' takes no value');
    if (!booleans.includes(key) && !value.length) throw new Error('--' + key + ' needs a value');
    flags.set(key, value.length ? value.join('=') : true);
  }
  const numeric = (key, fallback, minimum, maximum) => {
    if (!flags.has(key)) return fallback;
    const value = Number(flags.get(key));
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error('--' + key + ' must be between ' + minimum + ' and ' + maximum);
    return value;
  };
  const color = flags.get('color');
  if (color && !['always', 'truecolor', '256', 'never'].includes(color)) throw new Error('Use --color=always|truecolor|256|never');
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM || '') || 'WT_SESSION' in env
    || /vscode|iTerm|WezTerm|ghostty/i.test(env.TERM_PROGRAM || '');
  const forced = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0';
  let mode = flags.has('256') || color === '256' || env.FORCE_COLOR === '2' ? '256'
    : color === 'truecolor' || env.FORCE_COLOR === '3' || truecolor ? 'true' : '256';
  if ('NO_COLOR' in env || flags.has('mono') || color === 'never'
    || (!stream.isTTY && !forced && !color && !flags.has('256'))) mode = 'mono';
  const scenes = names.length ? names.flatMap(name => {
    if (name === 'all') return SCENES;
    const scene = SCENES.find(candidate => candidate.name === name);
    if (!scene) throw new Error('Unknown scene: ' + name + '. Use --list.');
    return [scene];
  }) : SCENES;
  return {
    scenes, mode, still: flags.has('still') || (!stream.isTTY && !flags.has('animate')),
    fps: numeric('fps', 40, 30, 60), speed: numeric('speed', 1, 0.1, 30),
    duration: numeric('duration', undefined, 0.05, 120),
    loop: flags.has('loop'), help: flags.has('help'), list: flags.has('list'),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env, stream = process.stdout) {
  const config = options(argv, env, stream);
  if (config.help) {
    stream.write('node prototypes/art-sol/hyperspace/showcase.mjs [scene ...] [options]\n');
    stream.write('No scene plays all five. --list lists exact scene names.\n');
    stream.write('--still             final frames; automatic outside a TTY\n');
    stream.write('--animate           animate redirected output for capture/testing\n');
    stream.write('--color=MODE        always | truecolor | 256 | never; NO_COLOR wins\n');
    stream.write('--mono / --256      monochrome / 256-color shortcuts\n');
    stream.write('--fps=30..60        default 40\n--speed=0.1..30     playback multiplier\n');
    stream.write('--duration=SECONDS  wall-clock duration per scene\n--loop              repeat until Ctrl+C\n');
    return;
  }
  if (config.list) {
    stream.write(SCENES.map(scene => scene.name.padEnd(27) + ' ' + scene.title).join('\n') + '\n');
    return;
  }
  if (config.still) {
    for (const scene of config.scenes) stream.write(frameFor(scene, scene.seconds, { mode: config.mode }).join('\n') + '\n');
    return;
  }
  let rows = Math.max(1, Math.min(HEIGHT, (stream.rows || HEIGHT + 1) - 1));
  let stopped = false, timer, wake, cleaned = false;
  const originalRaw = process.stdin.isRaw, originalFlowing = process.stdin.readableFlowing;
  const rawInput = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
  const pause = milliseconds => new Promise(resolve => {
    wake = resolve;
    timer = setTimeout(() => { wake = undefined; resolve(); }, milliseconds);
  });
  const stop = code => {
    process.exitCode = code; stopped = true; clearTimeout(timer); wake?.(); wake = undefined;
  };
  const interrupt = () => stop(130), terminate = () => stop(143);
  const onKey = data => { if (data.includes(3)) interrupt(); };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    stream.write((config.mode === 'mono' ? '' : '\x1b[0m') + (rows > 1 ? '\x1b[' + (rows - 1) + 'B' : '') + '\r\n\x1b[?25h');
    if (rawInput) {
      process.stdin.off('data', onKey); process.stdin.setRawMode(Boolean(originalRaw));
      if (originalFlowing !== true) process.stdin.pause();
    }
  };
  const flush = async output => {
    if (stream.write(output)) return;
    await new Promise((resolve, reject) => {
      const onDrain = () => { stream.off('error', onError); resolve(); };
      const onError = error => { stream.off('drain', onDrain); reject(error); };
      stream.once('drain', onDrain).once('error', onError);
    });
  };
  stream.write('\x1b[?25l' + '\n'.repeat(rows) + '\x1b[' + rows + 'A\r');
  process.on('SIGINT', interrupt).on('SIGTERM', terminate).on('exit', cleanup);
  if (rawInput) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onKey); }
  try {
    do {
      for (const scene of config.scenes) {
        const duration = config.duration ?? scene.seconds / config.speed, start = performance.now();
        while (!stopped) {
          const before = performance.now(), progress = Math.min(1, (before - start) / (duration * 1000));
          const nextRows = Math.max(1, Math.min(HEIGHT, (stream.rows || HEIGHT + 1) - 1));
          if (nextRows !== rows) {
            const clearRows = Math.min(rows, nextRows);
            stream.write(Array.from({ length: clearRows }, () => '\x1b[2K').join('\r\n')
              + (clearRows > 1 ? '\x1b[' + (clearRows - 1) + 'A' : '') + '\r');
            rows = nextRows;
          }
          const width = Math.max(1, Math.min(WIDTH, (stream.columns || WIDTH + 1) - 1));
          const output = frameFor(scene, progress * scene.seconds, { mode: config.mode, width, height: rows });
          await flush('\r' + output.map(row => row + '\x1b[K').join('\r\n')
            + (rows > 1 ? '\x1b[' + (rows - 1) + 'A' : '') + '\r');
          if (progress === 1) break;
          await pause(Math.max(1, 1000 / config.fps - (performance.now() - before)));
        }
        if (stopped) break;
        await pause(config.duration ? 30 : 500);
      }
    } while (config.loop && !stopped);
  } finally {
    cleanup(); process.off('SIGINT', interrupt).off('SIGTERM', terminate).off('exit', cleanup);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on('error', error => { if (error.code === 'EPIPE') process.exit(0); else throw error; });
  main().catch(error => { process.stderr.write('hyperspace: ' + error.message + '\n'); process.exitCode = 1; });
}
