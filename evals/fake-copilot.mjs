#!/usr/bin/env node
// Stands in for the Copilot CLI in copilot.test.mjs: takes --prompt, makes a small change, and writes the
// session log the real CLI writes, so replay can be tested end to end without Copilot or credit.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: copilot --prompt <text> --allow-all-tools --deny-tool <rule> --model <id>'); process.exit(0); }
const prompt = args[args.indexOf('--prompt') + 1] || '';
const tblock = prompt.startsWith('/tblock:tblock-mode');
// Without --model it picks per run, the way Copilot's Auto routing can, so the arms may differ.
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : tblock ? 'auto-picked-a' : 'auto-picked-b';
const remotes = execSync('git remote', { encoding: 'utf8' }).trim() || 'none';

const id = randomUUID();
const dir = join(process.env.COPILOT_HOME, 'session-state', id);
mkdirSync(dir, { recursive: true });
const log = join(dir, 'events.jsonl');
const emit = (type, data) => appendFileSync(log, `${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n`);

emit('session.start', { sessionId: id, context: { cwd: process.cwd(), headCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim() } });
emit('user.message', { content: prompt });
if (tblock) emit('skill.invoked', { name: 'tblock-mode' });
emit('session.usage_record', { usage: { model, inputTokens: tblock ? 3000 : 1000, outputTokens: 200 } });
emit('assistant.message', { content: 'Goal: organise the files.', toolRequests: [] });
emit('assistant.message', { content: '', toolRequests: [{ name: 'create', arguments: { path: join(process.cwd(), 'src', 'main.py'), file_text: 'print(1)\n' } }] });
mkdirSync('src', { recursive: true });
writeFileSync(join('src', 'main.py'), 'print(1)\n');
emit('assistant.message', { content: `Moved the code into src. Remotes: ${remotes}.`, toolRequests: [] });
emit('session.shutdown', { accountingSnapshot: { totalPremiumRequestCost: 1, totalNanoAiu: tblock ? 1_500_000_000 : 500_000_000 } });
