import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/api.js';
import { createRepo } from '../src/repo.js';
import { createAudit } from '../src/audit.js';

test('create then fetch a user', () => {
  const app = { repo: createRepo(), audit: createAudit() };
  const made = handle(app, { method: 'POST', path: '/users', body: { uid: 'ada', name: 'Ada', email: 'Ada@Example.com' } });
  assert.equal(made.status, 201);
  assert.deepEqual(handle(app, { method: 'GET', path: '/users/ada' }).body, { uid: 'ada', name: 'Ada', email: 'ada@example.com' });
  assert.equal(app.repo.findByUid('ada').name, 'Ada');
});
