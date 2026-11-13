import { ValidationError } from './model.js';
import { fromWire, toWire } from './serialize.js';

// Routes: POST /users, GET /users, GET /users/:userId, DELETE /users/:userId.
export function handle({ repo, audit }, { method, path, body }) {
  const [, resource, userId] = path.split('/');
  if (resource !== 'users') return { status: 404, body: { error: 'Not found' } };
  try {
    if (method === 'POST' && !userId) {
      const user = fromWire(body);
      if (repo.findByUserId(user.userId)) return { status: 409, body: { error: `uid ${user.userId} is taken` } };
      repo.save(user);
      audit.created(user);
      return { status: 201, body: toWire(user) };
    }
    if (method === 'GET' && !userId) return { status: 200, body: repo.all().map(toWire) };
    if (method === 'GET') {
      const user = repo.findByUserId(userId);
      return user ? { status: 200, body: toWire(user) } : { status: 404, body: { error: `No user with uid ${userId}` } };
    }
    if (method === 'DELETE' && userId) {
      if (!repo.removeByUserId(userId)) return { status: 404, body: { error: `No user with uid ${userId}` } };
      audit.removed(userId);
      return { status: 204, body: null };
    }
  } catch (error) {
    if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
    throw error;
  }
  return { status: 405, body: { error: 'Method not allowed' } };
}
