import type { Task } from './store.ts';

export function parseDue(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.getUTCMonth() !== Number(match![2]) - 1 || date.getUTCDate() !== Number(match![3])) throw new Error(`Not a real date: ${text}`);
  return text;
}

export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function add(tasks: Task[], title: string, due?: string): Task[] {
  const clean = title.trim();
  if (!clean) throw new Error('A task needs a title');
  const id = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  return [...tasks, { id, title: clean, done: false, ...(due ? { due: parseDue(due) } : {}) }];
}

export function complete(tasks: Task[], id: number): Task[] {
  if (!tasks.some((t) => t.id === id)) throw new Error(`No task ${id}`);
  return tasks.map((t) => (t.id === id ? { ...t, done: true } : t));
}

export function pending(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done);
}

export function isOverdue(task: Task, day: string = today()): boolean {
  return !task.done && task.due !== undefined && task.due < day;
}

export function overdueFirst(tasks: Task[], day: string = today()): Task[] {
  return [...tasks.filter((t) => isOverdue(t, day)), ...tasks.filter((t) => !isOverdue(t, day))];
}
