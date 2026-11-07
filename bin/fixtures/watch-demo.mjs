// Previews `tblock watch` without a real Copilot run: replays the fixture session into a throwaway
// Copilot home in real time while tblock watch follows it. Run: node bin/fixtures/watch-demo.mjs
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchSessionEvents, writeWatchSession } from './watch-session.mjs';

const home = mkdtempSync(join(tmpdir(), 'tblock-watch-demo-'));
const start = Date.now() + 1500;
const lines = watchSessionEvents({ start });
const { dir } = writeWatchSession(home, { lines: [] });

// Each event lands when its timestamp comes due.
const timers = lines.map((line) => setTimeout(() => appendFileSync(join(dir, 'events.jsonl'), `${line}\n`), Date.parse(JSON.parse(line).timestamp) - Date.now()));

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'tblock.mjs');
const child = spawn(process.execPath, [cli, 'watch'], { stdio: 'inherit', env: { ...process.env, COPILOT_HOME: home } });
child.on('exit', (code) => {
  timers.forEach(clearTimeout);
  rmSync(home, { recursive: true, force: true });
  process.exit(code ?? 0);
});
