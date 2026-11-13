import type { Task } from './store.ts';

export function stats(tasks: Task[]): string {
  const done = tasks.filter((t) => t.done).length;
  return `${tasks.length} tasks, ${done} done, ${tasks.length - done} to do`;
}
