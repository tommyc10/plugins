import { useState } from 'react';

export function AddTask({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = () => {
    onAdd(title);
    setTitle('');
  };
  return (
    <div className="add-task">
      <input aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="button" onClick={submit}>Add</button>
    </div>
  );
}
