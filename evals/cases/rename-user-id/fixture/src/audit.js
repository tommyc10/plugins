// One line per change, read by the compliance export. The format is fixed.
export function createAudit() {
  const lines = [];
  return {
    created: (user) => lines.push(`created uid=${user.uid} email=${user.email}`),
    removed: (uid) => lines.push(`removed uid=${uid}`),
    lines: () => [...lines],
  };
}
