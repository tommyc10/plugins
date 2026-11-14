// The `tblock` launcher: follows the newest install, and goes on and off PATH without touching anything else.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToPath, launcherTarget, onPath, refreshLauncher, removeFromPath, shellProfile } from './launcher.mjs';

const BIN = dirname(fileURLToPath(import.meta.url));
const temp = () => mkdtempSync(join(tmpdir(), 'tblock-launcher-'));

// A plugin folder with just enough for the launcher: a version and a CLI.
function install(version) {
  const root = temp();
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'plugin.json'), JSON.stringify({ version }));
  writeFileSync(join(root, 'bin', 'tblock.mjs'), '');
  return root;
}

test('the launcher follows the newest install and never steps back to an older one', () => {
  const home = temp();
  const [old, current, newer] = [install('0.18.1'), install('0.19.0'), install('0.20.0')];
  assert.equal(launcherTarget(home), null);
  assert.equal(refreshLauncher(home, current), true);
  assert.equal(launcherTarget(home), current);
  assert.equal(refreshLauncher(home, current), false, 'nothing to write when it already points here');
  assert.equal(refreshLauncher(home, old), false, 'an older install leaves a newer one in place');
  assert.equal(launcherTarget(home), current);
  refreshLauncher(home, newer);
  assert.equal(launcherTarget(home), newer);
  assert.match(readFileSync(join(home, '.tblock', 'bin', 'tblock.cmd'), 'utf8'), /node ".*tblock\.mjs" %\*/);
});

test('a launcher whose install was removed is replaced, whatever the version', () => {
  const home = temp();
  const gone = join(temp(), 'gone');
  mkdirSync(join(home, '.tblock', 'bin'), { recursive: true });
  writeFileSync(join(home, '.tblock', 'bin', 'tblock'), `#!/bin/sh\nexec node "${join(gone, 'bin', 'tblock.mjs')}" "$@"\n`);
  assert.equal(launcherTarget(home), null);
  const root = install('0.1.0');
  refreshLauncher(home, root);
  assert.equal(launcherTarget(home), root);
});

test('PATH goes into the shell profile once, and comes out leaving the rest as it was', () => {
  const home = temp();
  const env = { SHELL: '/bin/zsh', PATH: '/usr/bin' };
  const rc = join(home, '.zshrc');
  const original = 'alias ll="ls -l"\nexport EDITOR=vim\n';
  writeFileSync(rc, original);
  assert.equal(onPath(home, env, 'darwin'), null);
  assert.equal(addToPath(home, env, 'darwin'), rc);
  addToPath(home, env, 'darwin');
  const text = readFileSync(rc, 'utf8');
  assert.equal(text.match(/\.tblock\/bin/g).length, 1, 'a second run adds nothing');
  assert.ok(text.startsWith(original));
  assert.equal(onPath(home, env, 'darwin'), 'profile');
  assert.equal(onPath(home, { PATH: `/usr/bin:${join(home, '.tblock', 'bin')}` }, 'darwin'), 'now');
  removeFromPath(home, env, 'darwin');
  assert.equal(readFileSync(rc, 'utf8'), original);
});

test('the profile follows the shell', () => {
  const home = '/h';
  assert.equal(shellProfile(home, { SHELL: '/bin/bash' }, 'linux').file, join(home, '.bashrc'));
  assert.equal(shellProfile(home, { SHELL: '/bin/bash' }, 'darwin').file, join(home, '.bash_profile'));
  assert.match(shellProfile(home, { SHELL: '/usr/bin/fish' }, 'linux').line, /^fish_add_path/);
  assert.equal(shellProfile(home, {}, 'linux').file, join(home, '.profile'));
  assert.equal(shellProfile(home, {}, 'win32'), null);
});

test('session start points the launcher at this install even with the guard off', () => {
  const home = temp();
  const r = spawnSync(process.execPath, [join(BIN, 'hook.mjs'), 'session-start', 'claude-code'], { env: { HOME: home, USERPROFILE: home, PATH: '' }, input: '{}', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'the guard is off, so the session hears nothing');
  assert.equal(launcherTarget(home), join(BIN, '..'));
  assert.ok(existsSync(join(home, '.tblock', 'bin', 'tblock')));
});
