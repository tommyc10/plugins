import type { Task } from './types.ts';

type Props = { task: Task; onToggle: (id: number) => void; onRemove: (id: number) => void };

export function TaskItem({ task, onToggle, onRemove }: Props) {
  return (
    <li className={task.done ? 'task done' : 'task'}>
      <label>
        <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
        <span>{task.title}</span>
      </label>
      <button type="button" onClick={() => onRemove(task.id)}>Remove</button>
    </li>
  );
}
