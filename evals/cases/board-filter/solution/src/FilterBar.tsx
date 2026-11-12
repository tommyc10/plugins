import { FILTERS, FILTER_NAMES, type Filter } from './filters.ts';
import type { Task } from './types.ts';

type Props = { tasks: Task[]; selected: Filter; onSelect: (filter: Filter) => void };

export function FilterBar({ tasks, selected, onSelect }: Props) {
  return (
    <div className="filters" role="group" aria-label="Filter tasks">
      {FILTER_NAMES.map((name) => (
        <button key={name} type="button" aria-pressed={name === selected} onClick={() => onSelect(name)}>
          {name} ({tasks.filter(FILTERS[name]).length})
        </button>
      ))}
    </div>
  );
}
