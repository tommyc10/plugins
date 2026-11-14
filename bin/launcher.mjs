// The `tblock` command: a launcher in ~/.tblock/bin that runs the CLI from the newest install.
// An install's folder carries its version (…/tblock/0.19.0), so a hand-made alias breaks on every
// update. Each session start rewrites the launcher instead, and `tblock command on` puts its folder
// on the user's PATH. Node built-ins only.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const binDir = (home) => join(home, '.tblock', 'bin');
const launchers = (home) => ({ sh: join(binDir(home), 'tblock'), cmd: join(binDir(home), 'tblock.cmd') });
const MARK = '# tblock: puts the tblock command on your PATH. `tblock command off` removes it.';

const versionAt = (root) => {
  try { return JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).version.split('.').map(Number); } catch { return null; }
};
const older = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

// The plugin folder the launcher runs now, or null when there is none or its install is gone.
export function launcherTarget(home) {
  const { sh } = launchers(home);
  if (!existsSync(sh)) return null;
  const cli = readFileSync(sh, 'utf8').match(/"([^"]+)[\\/]bin[\\/]tblock\.mjs"/)?.[1];
  return cli && existsSync(join(cli, 'bin', 'tblock.mjs')) ? cli : null;
}

// Points the launcher at `root` unless it already runs a newer install, which a session of the
// other harness may have left. Returns whether it wrote anything.
export function refreshLauncher(home, root) {
  const mine = versionAt(root);
  if (!mine) return false;
  const current = launcherTarget(home);
  const theirs = current && versionAt(current);
  if (current && current !== root && theirs && older(mine, theirs)) return false;
  const { sh, cmd } = launchers(home);
  const cli = join(root, 'bin', 'tblock.mjs');
  const want = {
    [sh]: `#!/bin/sh\n# Written by tblock at each session start, so it follows updates. Do not edit.\nexec node "${cli}" "$@"\n`,
    [cmd]: `@echo off\r\nrem Written by tblock at each session start, so it follows updates. Do not edit.\r\nnode "${cli}" %*\r\n`,
  };
  let wrote = false;
  mkdirSync(binDir(home), { recursive: true });
  for (const [path, text] of Object.entries(want)) {
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    writeFileSync(path, text, { mode: 0o755 });
    wrote = true;
  }
  return wrote;
}

// The startup file the user's shell reads, from $SHELL. Windows keeps PATH in the registry instead.
export function shellProfile(home, env = process.env, platform = process.platform) {
  if (platform === 'win32') return null;
  const shell = basename(env.SHELL || '');
  if (shell === 'fish') return { file: join(home, '.config', 'fish', 'conf.d', 'tblock.fish'), line: `fish_add_path -g ${binDir(home)}` };
  const file = shell === 'zsh' ? join(home, '.zshrc') : shell === 'bash' ? join(home, platform === 'darwin' ? '.bash_profile' : '.bashrc') : join(home, '.profile');
  return { file, line: 'export PATH="$HOME/.tblock/bin:$PATH"' };
}

const stripBlock = (text) => text.replace(new RegExp(`\\n?${MARK.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&')}\\n[^\\n]*\\n?`, 'g'), '');

// Whether the user's shell already puts the launcher's folder on PATH.
export function onPath(home, env = process.env, platform = process.platform) {
  const sep = platform === 'win32' ? ';' : ':';
  if ((env.PATH || env.Path || '').split(sep).some((p) => p.replace(/[\\/]$/, '') === binDir(home))) return 'now';
  const profile = shellProfile(home, env, platform);
  return profile && existsSync(profile.file) && readFileSync(profile.file, 'utf8').includes(MARK) ? 'profile' : null;
}

function windowsUserPath(update) {
  const ps = (script) => execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 20000 }).trim();
  const current = ps("[Environment]::GetEnvironmentVariable('Path', 'User')");
  const next = update(current.split(';').filter(Boolean));
  if (next.join(';') !== current) ps(`[Environment]::SetEnvironmentVariable('Path', '${next.join(';').replace(/'/g, "''")}', 'User')`);
}

// Adds the launcher's folder to PATH in the shell's startup file, once. Returns where it went.
export function addToPath(home, env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    windowsUserPath((parts) => (parts.includes(binDir(home)) ? parts : [...parts, binDir(home)]));
    return 'your Windows user PATH';
  }
  const { file, line } = shellProfile(home, env, platform);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!text.includes(MARK)) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}\n${MARK}\n${line}\n`);
  }
  return file;
}

// Undoes addToPath and removes the launcher.
export function removeFromPath(home, env = process.env, platform = process.platform) {
  if (platform === 'win32') windowsUserPath((parts) => parts.filter((p) => p !== binDir(home)));
  else {
    const { file } = shellProfile(home, env, platform);
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8');
      const left = stripBlock(text);
      // fish's conf.d file is tblock's alone, so it goes once empty.
      if (!left.trim() && file.endsWith('tblock.fish')) rmSync(file);
      else if (left !== text) writeFileSync(file, left);
    }
  }
  for (const path of Object.values(launchers(home))) rmSync(path, { force: true });
}
