import { ValidationError } from './model.js';
import { fromWire, toWire } from './serialize.js';

// Routes: POST /users, GET /users, GET /users/:uid, DELETE /users/:uid.
export function handle({ repo, audit }, { method, path, body }) {
  const [, resource, uid] = path.split('/');
  if (resource !== 'users') return { status: 404, body: { error: 'Not found' } };
  try {
    if (method === 'POST' && !uid) {
      const user = fromWire(body);
      if (repo.findByUid(user.uid)) return { status: 409, body: { error: `uid ${user.uid} is taken` } };
      repo.save(user);
      audit.created(user);
      return { status: 201, body: toWire(user) };
    }
    if (method === 'GET' && !uid) return { status: 200, body: repo.all().map(toWire) };
    if (method === 'GET') {
      const user = repo.findByUid(uid);
      return user ? { status: 200, body: toWire(user) } : { status: 404, body: { error: `No user with uid ${uid}` } };
    }
    if (method === 'DELETE' && uid) {
      if (!repo.removeByUid(uid)) return { status: 404, body: { error: `No user with uid ${uid}` } };
      audit.removed(uid);
      return { status: 204, body: null };
    }
  } catch (error) {
    if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
    throw error;
  }
  return { status: 405, body: { error: 'Method not allowed' } };
}
