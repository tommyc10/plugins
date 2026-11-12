import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/api.js';
import { createRepo } from '../src/repo.js';
import { createAudit } from '../src/audit.js';

const app = () => ({ repo: createRepo(), audit: createAudit() });
const post = (a, body) => handle(a, { method: 'POST', path: '/users', body });
const ada = { uid: 'ada', name: 'Ada', email: 'Ada@Example.com' };

test('POST still accepts uid and answers with uid, and nothing else', () => {
  assert.deepEqual(post(app(), ada), { status: 201, body: { uid: 'ada', name: 'Ada', email: 'ada@example.com' } });
});

test('GET one and GET all still answer with uid', () => {
  const a = app();
  post(a, { uid: 'bob', name: 'Bob', email: 'bob@example.com' });
  post(a, ada);
  assert.deepEqual(handle(a, { method: 'GET', path: '/users/ada' }), { status: 200, body: { uid: 'ada', name: 'Ada', email: 'ada@example.com' } });
  assert.deepEqual(handle(a, { method: 'GET', path: '/users' }).body, [{ uid: 'ada', name: 'Ada', email: 'ada@example.com' }, { uid: 'bob', name: 'Bob', email: 'bob@example.com' }]);
});

test('a body that sends userId and no uid is still refused', () => {
  assert.equal(post(app(), { userId: 'ada', name: 'Ada', email: 'ada@example.com' }).status, 400);
});

test('the error messages clients see still say uid', () => {
  const a = app();
  assert.deepEqual(post(a, { name: 'Ada', email: 'ada@example.com' }), { status: 400, body: { error: 'uid is required' } });
  assert.deepEqual(post(a, { ...ada, uid: 'Ada Lovelace' }), { status: 400, body: { error: 'uid must be lowercase letters, digits or dashes' } });
  assert.deepEqual(post(a, { ...ada, name: '' }), { status: 400, body: { error: 'name is required' } });
  assert.deepEqual(post(a, { ...ada, email: 'nope' }), { status: 400, body: { error: 'email is not valid' } });
  post(a, ada);
  assert.deepEqual(post(a, ada), { status: 409, body: { error: 'uid ada is taken' } });
  assert.deepEqual(handle(a, { method: 'GET', path: '/users/zed' }), { status: 404, body: { error: 'No user with uid zed' } });
  assert.deepEqual(handle(a, { method: 'DELETE', path: '/users/zed' }), { status: 404, body: { error: 'No user with uid zed' } });
});

test('DELETE still removes the user', () => {
  const a = app();
  post(a, ada);
  assert.deepEqual(handle(a, { method: 'DELETE', path: '/users/ada' }), { status: 204, body: null });
  assert.equal(handle(a, { method: 'GET', path: '/users/ada' }).status, 404);
});

test('the audit lines are unchanged', () => {
  const a = app();
  post(a, ada);
  handle(a, { method: 'DELETE', path: '/users/ada' });
  assert.deepEqual(a.audit.lines(), ['created uid=ada email=ada@example.com', 'removed uid=ada']);
});

test('other routes still answer as before', () => {
  const a = app();
  assert.equal(handle(a, { method: 'GET', path: '/orders' }).status, 404);
  assert.equal(handle(a, { method: 'PUT', path: '/users/ada' }).status, 405);
});
