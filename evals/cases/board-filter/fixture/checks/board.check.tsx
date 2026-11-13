import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from './dom.ts';
import { TaskBoard } from '../src/TaskBoard.tsx';

test('the board lists its tasks and ticks one', async () => {
  const { el, click } = await mount(<TaskBoard initialTasks={[{ id: 1, title: 'Write report', done: false }]} />);
  assert.equal(el.querySelectorAll('li').length, 1);
  await click(el.querySelector('input[type=checkbox]')!);
  assert.equal(el.querySelector('li')!.className, 'task done');
});
