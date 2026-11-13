export function createRepo() {
  const byUserId = new Map();
  return {
    save(user) {
      byUserId.set(user.userId, user);
      return user;
    },
    findByUserId(userId) {
      return byUserId.get(userId) ?? null;
    },
    removeByUserId(userId) {
      return byUserId.delete(userId);
    },
    all() {
      return [...byUserId.values()].sort((a, b) => a.userId.localeCompare(b.userId));
    },
  };
}
