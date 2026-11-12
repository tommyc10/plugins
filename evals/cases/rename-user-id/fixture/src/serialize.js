import { makeUser } from './model.js';

// The shape clients send and receive.
export function toWire(user) {
  return { uid: user.uid, name: user.name, email: user.email };
}

export function fromWire(body) {
  return makeUser({ uid: body?.uid, name: body?.name, email: body?.email });
}
