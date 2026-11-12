import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeUser } from '../src/model.js';
import { createRepo } from '../src/repo.js';
import { createAudit } from '../src/audit.js';

const source = (name) => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8');
const good = { userId: 'ada', name: 'Ada', email: 'ada@example.com' };

test('a user is made from userId and carries userId, not uid', () => {
  const user = makeUser(good);
  assert.equal(user.userId, 'ada');
  assert.ok(!('uid' in user));
});

test('makeUser no longer reads uid', () => {
  assert.throws(() => makeUser({ uid: 'ada', name: 'Ada', email: 'ada@example.com' }));
});

test('the repo is keyed and named by userId', () => {
  const repo = createRepo();
  repo.save(makeUser(good));
  repo.save(makeUser({ ...good, userId: 'bob', name: 'Bob' }));
  assert.equal(repo.findByUserId('ada').name, 'Ada');
  assert.equal(repo.findByUserId('zed'), null);
  assert.deepEqual(repo.all().map((u) => u.userId), ['ada', 'bob']);
  assert.equal(repo.removeByUserId('ada'), true);
  assert.equal(repo.removeByUserId('ada'), false);
  assert.equal(repo.findByUid, undefined);
  assert.equal(repo.removeByUid, undefined);
});

test('the audit reads userId from the user it is given', () => {
  const audit = createAudit();
  audit.created(makeUser(good));
  assert.deepEqual(audit.lines(), ['created uid=ada email=ada@example.com']);
});

test('model.js and repo.js have no uid left in their code', () => {
  for (const name of ['model', 'repo']) {
    const code = source(name).split('\n').filter((l) => !/ValidationError\(/.test(l)).join('\n');
    assert.doesNotMatch(code, /uid/i, name);
  }
});

test('api.js no longer uses the old names', () => {
  assert.doesNotMatch(source('api'), /findByUid|removeByUid|\.uid\b/);
});
