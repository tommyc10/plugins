import type { Task } from './store.ts';
import { isOverdue, overdueFirst } from './tasks.ts';

export function line(task: Task): string {
  const base = `${task.done ? '[x]' : '[ ]'} ${task.id}. ${task.title}`;
  const dated = task.due ? `${base} (due ${task.due})` : base;
  return isOverdue(task) ? `! ${dated}` : dated;
}

export function list(tasks: Task[]): string {
  return tasks.length ? overdueFirst(tasks).map(line).join('\n') : 'No tasks.';
}
