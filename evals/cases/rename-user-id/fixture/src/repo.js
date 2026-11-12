export function createRepo() {
  const byUid = new Map();
  return {
    save(user) {
      byUid.set(user.uid, user);
      return user;
    },
    findByUid(uid) {
      return byUid.get(uid) ?? null;
    },
    removeByUid(uid) {
      return byUid.delete(uid);
    },
    all() {
      return [...byUid.values()].sort((a, b) => a.uid.localeCompare(b.uid));
    },
  };
}
