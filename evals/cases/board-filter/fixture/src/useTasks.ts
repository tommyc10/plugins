import { useReducer } from 'react';
import type { Task } from './types.ts';

type Action = { type: 'add'; title: string } | { type: 'toggle'; id: number } | { type: 'remove'; id: number };

export function tasksReducer(tasks: Task[], action: Action): Task[] {
  switch (action.type) {
    case 'add': {
      const title = action.title.trim();
      if (!title) return tasks;
      const id = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
      return [...tasks, { id, title, done: false }];
    }
    case 'toggle':
      return tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case 'remove':
      return tasks.filter((t) => t.id !== action.id);
  }
}

export function useTasks(initial: Task[]) {
  const [tasks, dispatch] = useReducer(tasksReducer, initial);
  return {
    tasks,
    add: (title: string) => dispatch({ type: 'add', title }),
    toggle: (id: number) => dispatch({ type: 'toggle', id }),
    remove: (id: number) => dispatch({ type: 'remove', id }),
  };
}
