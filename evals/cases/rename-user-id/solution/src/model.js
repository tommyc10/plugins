export class ValidationError extends Error {}

// The messages name the wire field, because clients read them.
export function makeUser({ userId, name, email }) {
  if (!userId) throw new ValidationError('uid is required');
  if (!/^[a-z0-9-]+$/.test(userId)) throw new ValidationError('uid must be lowercase letters, digits or dashes');
  if (!name) throw new ValidationError('name is required');
  if (!/^[^@\s]+@[^@\s]+$/.test(email || '')) throw new ValidationError('email is not valid');
  return { userId, name, email: email.toLowerCase() };
}
