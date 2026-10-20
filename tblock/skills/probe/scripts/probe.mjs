#!/usr/bin/env node
// Reads an application's logs through the commands a project lists in .tblock/probe.json,
// keeps a narrow slice, masks secrets, and summarizes what went wrong.
// Node built-ins only, so it runs wherever tblock's CLI runs.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const USAGE = `probe [--source <name>] [--since 15m] [--level error] [--grep <text>] [--tail 200] [--raw] [--json] [--yes]

Reads .tblock/probe.json from the current folder or a parent. Each source has a "command"
that prints logs, where {since} is replaced by --since. A source marked "confirm": true
(for example a shared or production environment) only runs with --yes.`;

function parseArgs(argv) {
  const opts = { since: '15m', level: null, grep: null, tail: 200, raw: false, json: false, yes: false, source: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--source') opts.source = next();
    else if (a === '--since') opts.since = next();
    else if (a === '--level') opts.level = next().toLowerCase();
    else if (a === '--grep') opts.grep = next();
    else if (a === '--tail') opts.tail = Number(next());
    else if (a === '--raw') opts.raw = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`unknown option ${a}\n\n${USAGE}`);
  }
  if (opts.level && !LEVELS.includes(opts.level)) throw new Error(`--level must be one of ${LEVELS.join(', ')}`);
  if (!Number.isInteger(opts.tail) || opts.tail < 1) throw new Error('--tail must be a whole number above 0');
  if (!/^\d+[smhd]$/.test(opts.since)) throw new Error('--since must look like 30s, 15m, 2h or 1d');
  return opts;
}

function findConfig(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const path = join(dir, '.tblock', 'probe.json');
    if (existsSync(path)) return path;
    if (dirname(dir) === dir) return null;
  }
}

function loadSource(opts) {
  const path = findConfig(process.cwd());
  if (!path) throw new Error('no .tblock/probe.json here or in a parent folder. The probe skill explains how to write one.');
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
  const sources = config.sources || {};
  const name = opts.source || config.default || Object.keys(sources)[0];
  const source = sources[name];
  if (!source) throw new Error(`no source "${name}" in ${path}. Sources: ${Object.keys(sources).join(', ') || 'none'}`);
  if (typeof source.command !== 'string' || !source.command.trim()) throw new Error(`source "${name}" needs a "command"`);
  return { name, source, cwd: dirname(dirname(path)) };
}

// A line's level, from JSON logs ("level": "error"), key=value logs (level=error), or words like ERROR.
export function levelOf(line) {
  const json = line.match(/"(?:level|severity|lvl)"\s*:\s*"?([a-zA-Z]+)/);
  const kv = line.match(/\b(?:level|severity|lvl)=([a-zA-Z]+)/);
  const word = line.match(/\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|ERR|FATAL|CRITICAL|PANIC)\b/);
  const found = (json?.[1] || kv?.[1] || word?.[1] || '').toLowerCase();
  if (!found) return null;
  if (found.startsWith('warn')) return 'warn';
  if (found === 'err') return 'error';
  if (found === 'critical' || found === 'panic') return 'fatal';
  return LEVELS.includes(found) ? found : null;
}

const MASKS = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [masked]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[masked-jwt]'],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization)(["']?\s*[:=]\s*["']?)(?!Bearer\b|Basic\b|\[masked)[^\s"',}]+/gi, '$1$2[masked]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[masked-key]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[masked-email]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[masked-hex]'],
];

// A 13 to 19 digit run that passes the Luhn check is treated as a card number.
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

export function mask(line) {
  let count = 0;
  let out = line.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => {
    if (!luhn(m.replace(/\D/g, ''))) return m;
    count++;
    return '[masked-number]';
  });
  for (const [pattern, replacement] of MASKS) {
    out = out.replace(pattern, (...m) => {
      count++;
      return typeof replacement === 'string' ? replacement.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '') : replacement;
    });
  }
  return { line: out, count };
}

// The message with its ids, numbers, and timestamps blanked, so repeats group together.
export function shapeOf(line) {
  return line
    .replace(/^\S*\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?\S*\s*/, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\d+/g, '<n>')
    .slice(0, 160);
}

// Code locations from common stack trace formats: JS, Python, Java, and path:line.
export function framesOf(lines) {
  const found = new Map();
  const patterns = [
    /\bat .*?\(?((?:\/|\.{1,2}\/|[A-Za-z]:\\)?[\w./\\-]+\.[a-z]{1,5}):(\d+)(?::\d+)?\)?/,
    /File "([^"]+)", line (\d+)/,
    /\bat [\w.$]+\(([\w-]+\.(?:java|kt|scala)):(\d+)\)/,
    /((?:\.{0,2}\/)?(?:[\w-]+\/)+[\w.-]+\.[a-z]{1,5}):(\d+)/,
  ];
  for (const line of lines) {
    for (const p of patterns) {
      const m = line.match(p);
      if (m && !/node_modules|site-packages|internal\//.test(m[1])) {
        const key = `${m[1]}:${m[2]}`;
        found.set(key, (found.get(key) || 0) + 1);
        break;
      }
    }
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([at, count]) => ({ at, count }));
}

export function analyse(text, opts) {
  let masked = 0;
  const all = text.split('\n').filter((l) => l.trim()).map((l) => {
    const m = mask(l);
    masked += m.count;
    return m.line;
  });
  const min = opts.level ? LEVELS.indexOf(opts.level) : -1;
  // Continuation lines of a stack trace carry no level, so they follow the line before them.
  let keep = false;
  const matched = all.filter((line) => {
    const level = levelOf(line);
    if (level !== null) keep = LEVELS.indexOf(level) >= min;
    else if (min < 0) keep = true;
    return keep && (!opts.grep || line.includes(opts.grep));
  });
  const shown = matched.slice(-opts.tail);
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const line of all) {
    const level = levelOf(line);
    if (level) counts[level]++;
  }
  const errors = matched.filter((l) => ['error', 'fatal'].includes(levelOf(l)));
  const repeats = new Map();
  for (const line of errors) repeats.set(shapeOf(line), (repeats.get(shapeOf(line)) || 0) + 1);
  return {
    lines: { total: all.length, matched: matched.length, shown: shown.length },
    levels: counts,
    firstError: errors[0] || null,
    topErrors: [...repeats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([shape, count]) => ({ shape, count })),
    codePointers: framesOf(matched),
    masked,
    output: shown,
  };
}

function report(name, opts, result) {
  if (opts.json) return console.log(JSON.stringify({ source: name, since: opts.since, ...result }, null, 2));
  if (opts.raw) return console.log(result.output.join('\n'));
  const filters = [`since ${opts.since}`, opts.level && `level ${opts.level}+`, opts.grep && `matching "${opts.grep}"`].filter(Boolean).join(', ');
  console.log(`probe · ${name} · ${filters}`);
  console.log(`lines: ${result.lines.total} read, ${result.lines.matched} matched, ${result.lines.shown} shown · masked: ${result.masked}`);
  console.log(`levels: ${LEVELS.filter((l) => result.levels[l]).map((l) => `${l} ${result.levels[l]}`).join(', ') || 'none detected'}`);
  console.log(`first error: ${result.firstError || 'none'}`);
  if (result.topErrors.length) {
    console.log('repeated errors:');
    result.topErrors.forEach((e) => console.log(`  ${String(e.count).padStart(4)}×  ${e.shape}`));
  }
  if (result.codePointers.length) {
    console.log('code pointers:');
    result.codePointers.forEach((f) => console.log(`  ${String(f.count).padStart(4)}×  ${f.at}`));
  }
  console.log('--- lines ---');
  console.log(result.output.join('\n'));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(USAGE);
  const { name, source, cwd } = loadSource(opts);
  if (source.confirm && !opts.yes) {
    throw new Error(`source "${name}" is marked confirm: true. Ask the user, then rerun with --yes.`);
  }
  const command = source.command.replaceAll('{since}', opts.since);
  let text;
  try {
    text = execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
  } catch (error) {
    if (error.stdout) text = `${error.stdout}${error.stderr || ''}`;
    else throw new Error(`source "${name}" command failed: ${(error.stderr || error.message).toString().trim().split('\n')[0]}`);
  }
  report(name, opts, analyse(text, opts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`probe: ${error.message}`);
    process.exitCode = 2;
  }
}
