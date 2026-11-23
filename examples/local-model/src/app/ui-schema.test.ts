import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECORDED } from './recorded';
import {
  answerSchema,
  COMPONENTS,
  propsSchema,
  systemPrompt,
  treeToSpec,
} from './ui-schema';

test('every component has a props schema without validation', () => {
  for (const name of COMPONENTS) {
    const schema = propsSchema(name);
    assert.equal(schema['type'], 'object', name);
    assert.ok(!('validation' in (schema['properties'] as object)), name);
    assert.ok(!('$schema' in schema), name);
  }
});

test('the answer schema refers only to its own definitions', () => {
  const text = JSON.stringify(answerSchema());
  const refs = [...text.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) assert.equal(ref, '#/$defs/node');
});

test('the prompt stays small enough for a 4k context', () => {
  // About four characters a token; leave most of the window for the answer.
  assert.ok(systemPrompt().length < 6000, `${systemPrompt().length} chars`);
});

test('a tree becomes a flat spec', () => {
  const spec = treeToSpec({
    type: 'Card',
    props: { title: 'Storage' },
    children: [
      { type: 'Metric', props: { label: 'Used', value: '42 GB' } },
      { type: 'Text', props: { content: 'Almost full' } },
    ],
  });
  assert.ok(spec);
  assert.equal(spec.elements[spec.root]?.type, 'Card');
  assert.deepEqual(
    spec.elements[spec.root]?.children?.map((id) => spec.elements[id]?.type),
    ['Metric', 'Text'],
  );
});

test('an unfinished node is left out until its props are complete', () => {
  const spec = treeToSpec({
    type: 'Stack',
    props: {},
    children: [
      { type: 'Metric', props: { label: 'Used' } },
      { type: 'Hea' },
      { type: 'Text', props: { content: 'ok' } },
    ],
  });
  assert.ok(spec);
  assert.deepEqual(
    spec.elements[spec.root]?.children?.map((id) => spec.elements[id]?.type),
    ['Text'],
  );
});

test('nothing renders before the root type is known', () => {
  assert.equal(treeToSpec(undefined), null);
  assert.equal(treeToSpec({ type: 'Ca' }), null);
});

test('the recorded answers are valid trees', () => {
  for (const recorded of RECORDED) {
    const answer = JSON.parse(recorded.json) as { say: string; ui: unknown };
    assert.ok(answer.say, recorded.prompt);
    const spec = treeToSpec(answer.ui);
    assert.ok(spec, recorded.prompt);
    const count = (node: unknown): number => {
      const children = (node as { children?: unknown[] }).children ?? [];
      return 1 + children.reduce<number>((n, c) => n + count(c), 0);
    };
    assert.equal(
      Object.keys(spec.elements).length,
      count(answer.ui),
      `${recorded.prompt}: a node failed the catalog`,
    );
  }
});

test('containers in the recorded answers and the prompt examples have two children or more', () => {
  const check = (node: unknown, where: string): void => {
    const { type, children } = node as { type: string; children?: unknown[] };
    if (children) {
      assert.ok(
        children.length >= 2,
        `${where}: ${type} has ${children.length}`,
      );
      for (const child of children) check(child, where);
    }
  };
  for (const recorded of RECORDED) {
    check((JSON.parse(recorded.json) as { ui: unknown }).ui, recorded.prompt);
  }
  for (const line of systemPrompt().split('\n')) {
    if (line.startsWith('Example: ')) {
      check(
        (JSON.parse(line.slice(9)) as { ui: unknown }).ui,
        'prompt example',
      );
    }
  }
});

test('a progress bar value stays between 0 and 100', () => {
  const spec = treeToSpec({ type: 'ProgressBar', props: { value: 5000 } });
  assert.equal(spec?.elements[spec.root]?.props['value'], 100);
});
