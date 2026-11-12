import { useState } from 'react';
import { AddTask } from './AddTask.tsx';
import { FilterBar } from './FilterBar.tsx';
import { TaskItem } from './TaskItem.tsx';
import { FILTERS, type Filter } from './filters.ts';
import { useTasks } from './useTasks.ts';
import type { Task } from './types.ts';

export function TaskBoard({ initialTasks = [] }: { initialTasks?: Task[] }) {
  const { tasks, add, toggle, remove } = useTasks(initialTasks);
  const [filter, setFilter] = useState<Filter>('All');
  const shown = tasks.filter(FILTERS[filter]);
  return (
    <section className="board">
      <h1>Tasks</h1>
      <AddTask onAdd={add} />
      <FilterBar tasks={tasks} selected={filter} onSelect={setFilter} />
      {shown.length ? (
        <ul>
          {shown.map((task) => (
            <TaskItem key={task.id} task={task} onToggle={toggle} onRemove={remove} />
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing here.</p>
      )}
      <p className="count">
        {tasks.length} task{tasks.length === 1 ? '' : 's'}
      </p>
    </section>
  );
}
