import { load, save } from './store.ts';
import { add, complete, isOverdue, pending } from './tasks.ts';
import { list } from './format.ts';
import { stats } from './stats.ts';

export const USAGE = 'Usage: tasks add <title> [--due YYYY-MM-DD] | done <id> | list [--pending | --overdue] | stats';

export function run(argv: string[], file: string): string {
  const [command, ...rest] = argv;
  const tasks = load(file);
  if (command === 'add') {
    const flag = rest.indexOf('--due');
    const due = flag >= 0 ? rest[flag + 1] ?? '' : undefined;
    const words = flag >= 0 ? [...rest.slice(0, flag), ...rest.slice(flag + 2)] : rest;
    if (flag >= 0 && !due) throw new Error('--due needs a date');
    const next = add(tasks, words.join(' '), due);
    save(file, next);
    return list(next);
  }
  if (command === 'done') {
    const next = complete(tasks, Number(rest[0]));
    save(file, next);
    return list(next);
  }
  if (command === 'list') {
    if (rest[0] === '--pending') return list(pending(tasks));
    if (rest[0] === '--overdue') return list(tasks.filter((t) => isOverdue(t)));
    return list(tasks);
  }
  if (command === 'stats') return stats(tasks);
  return USAGE;
}
