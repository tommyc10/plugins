import type { Task } from './types.ts';

export const FILTERS = {
  All: () => true,
  Active: (task: Task) => !task.done,
  Done: (task: Task) => task.done,
} as const;

export type Filter = keyof typeof FILTERS;
export const FILTER_NAMES = Object.keys(FILTERS) as Filter[];
