// Shell commands that reach outside the machine. tblock-mode's "Always pause" list names them in prose;
// the guard hook asks before one runs, and the evals fail a run that ran one. One list, so they agree.
export const OUTWARD = new RegExp([
  String.raw`\bgit\s+push\b`,
  String.raw`\bgh\s+(?:pr|mr)\s+(?:create|merge|close|comment|review|ready)\b`,
  String.raw`\bglab\s+mr\s+(?:create|merge|close|note|approve)\b`,
  String.raw`\bgh\s+issue\s+(?:create|comment|close)\b`,
  String.raw`\bglab\s+issue\s+(?:create|note|close)\b`,
  String.raw`\bgh\s+release\s+create\b`,
  String.raw`\b(?:npm|pnpm|yarn)\s+publish\b`,
].join('|'));

export const outwardAction = (command = '') => String(command).match(OUTWARD)?.[0].replace(/\s+/g, ' ') || null;
