import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { TaskBoard } = await import('../src/TaskBoard.tsx');

const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();

export const SEED = [
  { id: 1, title: 'Write report', done: false },
  { id: 2, title: 'Book flights', done: true },
  { id: 3, title: 'Call plumber', done: false },
];

export async function board(initialTasks = SEED) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(createElement(TaskBoard, { initialTasks })));
  const click = (target) => act(async () => target.click());
  const button = (name) => [...el.querySelectorAll('button')].find((b) => text(b).startsWith(name));
  const item = (title) => [...el.querySelectorAll('li')].find((li) => text(li).includes(title));
  return {
    el,
    click,
    button,
    item,
    titles: () => [...el.querySelectorAll('li')].map((li) => text(li).replace(/\s*Remove$/, '')),
    filter: (name) => click(button(name)),
    labels: () => ['All', 'Active', 'Done'].map((name) => (button(name) ? text(button(name)) : null)),
    pressed: () => ['All', 'Active', 'Done'].filter((name) => button(name)?.getAttribute('aria-pressed') === 'true'),
    tick: (title) => click(item(title).querySelector('input[type=checkbox]')),
    remove: (title) => click([...item(title).querySelectorAll('button')].find((b) => text(b) === 'Remove')),
    async add(title) {
      const input = el.querySelector('input[aria-label="New task"]');
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, title);
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
      await click(button('Add'));
    },
    text: () => text(el),
  };
}
