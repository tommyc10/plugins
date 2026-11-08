import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('joins words with dashes', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});
