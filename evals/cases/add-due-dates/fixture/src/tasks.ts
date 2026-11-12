import type { Task } from './store.ts';

export function add(tasks: Task[], title: string): Task[] {
  const clean = title.trim();
  if (!clean) throw new Error('A task needs a title');
  const id = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  return [...tasks, { id, title: clean, done: false }];
}

export function complete(tasks: Task[], id: number): Task[] {
  if (!tasks.some((t) => t.id === id)) throw new Error(`No task ${id}`);
  return tasks.map((t) => (t.id === id ? { ...t, done: true } : t));
}

export function pending(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done);
}
