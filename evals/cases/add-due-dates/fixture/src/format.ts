import type { Task } from './store.ts';

export function line(task: Task): string {
  return `${task.done ? '[x]' : '[ ]'} ${task.id}. ${task.title}`;
}

export function list(tasks: Task[]): string {
  return tasks.length ? tasks.map(line).join('\n') : 'No tasks.';
}
