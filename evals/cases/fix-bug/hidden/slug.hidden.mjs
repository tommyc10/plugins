import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('drops trailing punctuation', () => assert.equal(slugify('Hello World!'), 'hello-world'));
test('drops leading and trailing runs', () => assert.equal(slugify('  --Hi there--  '), 'hi-there'));
test('collapses inner runs', () => assert.equal(slugify('a  &  b'), 'a-b'));
test('keeps an existing slug', () => assert.equal(slugify('already-slugged'), 'already-slugged'));
test('keeps digits', () => assert.equal(slugify('Top 10 Tips'), 'top-10-tips'));
test('empty stays empty', () => assert.equal(slugify(''), ''));
test('punctuation only becomes empty', () => assert.equal(slugify('!!!'), ''));
