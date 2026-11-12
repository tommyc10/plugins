// One line per change, read by the compliance export. The format is fixed.
export function createAudit() {
  const lines = [];
  return {
    created: (user) => lines.push(`created uid=${user.userId} email=${user.email}`),
    removed: (userId) => lines.push(`removed uid=${userId}`),
    lines: () => [...lines],
  };
}
