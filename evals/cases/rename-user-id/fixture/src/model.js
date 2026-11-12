export class ValidationError extends Error {}

export function makeUser({ uid, name, email }) {
  if (!uid) throw new ValidationError('uid is required');
  if (!/^[a-z0-9-]+$/.test(uid)) throw new ValidationError('uid must be lowercase letters, digits or dashes');
  if (!name) throw new ValidationError('name is required');
  if (!/^[^@\s]+@[^@\s]+$/.test(email || '')) throw new ValidationError('email is not valid');
  return { uid, name, email: email.toLowerCase() };
}
