import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8');
const code = (name) => read(name).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const users = ['cart', 'invoice', 'quote'];

test('src/pricing.js exists and exports something', async () => {
  assert.ok(existsSync(new URL('../src/pricing.js', import.meta.url)));
  assert.ok(Object.keys(await import('../src/pricing.js')).length > 0);
});

for (const name of users) {
  test(`${name}.js imports the shared pricing module`, () => {
    assert.match(code(name), /from\s+['"]\.\/pricing\.js['"]/);
  });
  test(`${name}.js no longer carries the tax or discount rate`, () => {
    assert.doesNotMatch(code(name), /\b0?\.2\b/, 'the tax rate');
    assert.doesNotMatch(code(name), /\b0?\.9\b|\b0?\.1\b/, 'the bulk discount');
  });
}

test('the rates live in pricing.js', () => {
  assert.match(code('pricing'), /\b0?\.2\b/);
  assert.match(code('pricing'), /\b0?\.9\b|\b0?\.1\b/);
});
