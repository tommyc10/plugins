// Token usage per model, and what it costs at list price. Node built-ins only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
export const tokensOf = (u) => u.input + u.output + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;

export function addUsage(into, more) {
  for (const key of Object.keys(into)) into[key] += more[key] || 0;
  return into;
}

export function addModelUsage(byModel, model, more) {
  const key = model || 'unknown';
  if (!byModel.has(key)) byModel.set(key, emptyUsage());
  addUsage(byModel.get(key), more);
}

// Copilot writes "claude-opus-5.5", Claude Code "claude-opus-5-5"; both price as one model.
export const normalizeModel = (id = '') => String(id).toLowerCase().replace(/\./g, '-').replace(/-\d{8}$/, '');

export function loadPrices(pluginDir, home) {
  const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).models || {} : {});
  return { ...read(join(pluginDir, 'pricing.json')), ...read(join(home, '.tblock', 'pricing.json')) };
}

// Dollars at list price, or null when the model has no price, so an unknown model never reads as free.
export function priceOf(model, usage, prices) {
  const p = prices[normalizeModel(model)];
  if (!p) return null;
  return Object.keys(usage).reduce((sum, key) => sum + (usage[key] * (p[key] || 0)) / 1e6, 0);
}
