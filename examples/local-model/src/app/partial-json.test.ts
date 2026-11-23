import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePartialJson } from './partial-json';

test('nothing before the first value', () => {
  assert.equal(parsePartialJson(''), undefined);
  assert.equal(parsePartialJson('  '), undefined);
});

test('a complete document parses as is', () => {
  const doc = { say: 'hi', ui: { type: 'Card', props: {}, children: [] } };
  assert.deepEqual(parsePartialJson(JSON.stringify(doc)), doc);
});

test('a string value being written is kept', () => {
  assert.deepEqual(parsePartialJson('{"say":"Hel'), { say: 'Hel' });
  assert.deepEqual(parsePartialJson('{"a":["x","y'), { a: ['x', 'y'] });
});

test('a half-written escape is dropped', () => {
  assert.deepEqual(parsePartialJson('{"say":"a\\'), { say: 'a' });
  assert.deepEqual(parsePartialJson('{"say":"a\\u00'), { say: 'a' });
  assert.deepEqual(parsePartialJson('{"say":"a\\"b'), { say: 'a"b' });
});

test('a key, a colon or a comma is cut back', () => {
  assert.deepEqual(parsePartialJson('{"say":"hi","u'), { say: 'hi' });
  assert.deepEqual(parsePartialJson('{"say":"hi","ui"'), { say: 'hi' });
  assert.deepEqual(parsePartialJson('{"say":"hi","ui":'), { say: 'hi' });
  assert.deepEqual(parsePartialJson('{"say":"hi",'), { say: 'hi' });
  assert.deepEqual(parsePartialJson('[1,2,'), [1, 2]);
});

test('open containers are closed', () => {
  assert.deepEqual(parsePartialJson('{"ui":{"type":"Card","children":[{'), {
    ui: { type: 'Card', children: [{}] },
  });
});

test('a number being written counts once it parses', () => {
  assert.deepEqual(parsePartialJson('{"v":12'), { v: 12 });
  assert.deepEqual(parsePartialJson('{"v":12.'), {});
  assert.deepEqual(parsePartialJson('{"v":tru'), {});
  assert.deepEqual(parsePartialJson('{"v":true'), { v: true });
});

test('brackets inside strings are text', () => {
  assert.deepEqual(parsePartialJson('{"say":"a {b} [c]","x":['), {
    say: 'a {b} [c]',
    x: [],
  });
});
