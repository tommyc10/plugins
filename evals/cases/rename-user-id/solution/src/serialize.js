import { makeUser } from './model.js';

// The shape clients send and receive. The wire name is uid; in code it is userId.
export function toWire(user) {
  return { uid: user.userId, name: user.name, email: user.email };
}

export function fromWire(body) {
  return makeUser({ userId: body?.uid, name: body?.name, email: body?.email });
}
