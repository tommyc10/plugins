import { AddTask } from './AddTask.tsx';
import { TaskItem } from './TaskItem.tsx';
import { useTasks } from './useTasks.ts';
import type { Task } from './types.ts';

export function TaskBoard({ initialTasks = [] }: { initialTasks?: Task[] }) {
  const { tasks, add, toggle, remove } = useTasks(initialTasks);
  return (
    <section className="board">
      <h1>Tasks</h1>
      <AddTask onAdd={add} />
      <ul>
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={toggle} onRemove={remove} />
        ))}
      </ul>
      <p className="count">
        {tasks.length} task{tasks.length === 1 ? '' : 's'}
      </p>
    </section>
  );
}
