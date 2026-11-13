import { load, save } from './store.ts';
import { add, complete, pending } from './tasks.ts';
import { list } from './format.ts';
import { stats } from './stats.ts';

export const USAGE = 'Usage: tasks add <title> | done <id> | list [--pending] | stats';

export function run(argv: string[], file: string): string {
  const [command, ...rest] = argv;
  const tasks = load(file);
  if (command === 'add') {
    const next = add(tasks, rest.join(' '));
    save(file, next);
    return list(next);
  }
  if (command === 'done') {
    const next = complete(tasks, Number(rest[0]));
    save(file, next);
    return list(next);
  }
  if (command === 'list') return list(rest[0] === '--pending' ? pending(tasks) : tasks);
  if (command === 'stats') return stats(tasks);
  return USAGE;
}
