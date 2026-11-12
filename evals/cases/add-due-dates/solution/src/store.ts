import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Task = { id: number; title: string; done: boolean; due?: string };

export function load(file: string): Task[] {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function save(file: string, tasks: Task[]): void {
  writeFileSync(file, JSON.stringify(tasks, null, 2));
}
