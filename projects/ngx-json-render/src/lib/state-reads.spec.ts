import {
  type ComputedFunction,
  type DirectiveRegistry,
  type UIElement,
  createDirectiveRegistry,
  defineDirective,
  evaluateVisibility,
  getByPath,
  resolveElementProps,
} from '@json-render/core';
import { z } from 'zod';
import { collectStateReads } from './state-reads';

const FUNCTIONS: Record<string, ComputedFunction> = {
  join: (args) => `${String(args['a'])}-${String(args['b'])}`,
  dump: (args) => JSON.stringify(args['value']),
};

const STATE = {
  user: { name: 'Ada', email: 'ada@example.com', tags: ['a', 'b'] },
  role: 'admin',
  admin: 'admin',
  count: 3,
  flag: true,
  theme: { color: 'red' },
  todos: [
    { title: 'one', done: false, tags: ['x'] },
    { title: 'two', done: true },
  ],
};

function element(props: Record<string, unknown>, visible?: unknown): UIElement {
  return {
    type: 'T',
    props,
    ...(visible === undefined ? {} : { visible }),
  } as UIElement;
}

function reads(
  el: UIElement,
  base?: string,
  directives?: DirectiveRegistry,
): string[] | null {
  const found = collectStateReads(el, directives, base);
  return found === null ? null : [...found].sort();
}

describe('collectStateReads', () => {
  it('names the path of a $state read, wherever the read sits', () => {
    expect(
      reads(
        element({
          a: { $state: '/user/name' },
          b: { style: { color: { $state: '/theme/color' } } },
          c: [{ $state: '/count' }, 'literal'],
        }),
      ),
    ).toEqual(['/count', '/theme/color', '/user/name']);
  });

  it('reads nothing from a spec of literals and repeat indexes', () => {
    expect(
      reads(
        element({ a: 'x', b: 1, c: null, d: { $index: true } }),
        '/todos/0',
      ),
    ).toEqual([]);
  });

  it('reads both branches of a $cond and every path its condition compares', () => {
    expect(
      reads(
        element({
          label: {
            $cond: { $state: '/role', eq: { $state: '/admin' } },
            $then: { $state: '/user/name' },
            $else: { $state: '/user/email' },
          },
        }),
      ),
    ).toEqual(['/admin', '/role', '/user/email', '/user/name']);
  });

  it('reads the arguments of a $computed, not the function', () => {
    expect(
      reads(
        element({
          v: {
            $computed: 'join',
            args: { a: { $state: '/user/name' }, b: { $item: 'title' } },
          },
        }),
        '/todos/1',
      ),
    ).toEqual(['/todos/1/title', '/user/name']);
  });

  it('maps $item reads to the state path of the item', () => {
    const el = element({ all: { $item: '' }, one: { $item: 'tags/0' } });
    expect(reads(el, '/todos/0')).toEqual(['/todos/0', '/todos/0/tags/0']);
    // Outside a repeat, $item resolves to undefined and reads nothing.
    expect(reads(el)).toEqual([]);
  });

  it('reads a relative template placeholder from the item and from state', () => {
    const el = element({ t: { $template: '${title} of ${/count}' } });
    expect(reads(el, '/todos/0')).toEqual([
      '/count',
      '/title',
      '/todos/0/title',
    ]);
    expect(reads(el)).toEqual(['/count', '/title']);
  });

  it('reads visibility conditions in every shape core evaluates', () => {
    expect(
      reads(
        element(
          {},
          {
            $or: [
              [{ $state: '/flag' }, { $item: 'done', not: true }],
              {
                $and: [
                  { $state: '/count', gt: 2 },
                  { $index: true, eq: 0 },
                ],
              },
            ],
          },
        ),
        '/todos/1',
      ),
    ).toEqual(['/count', '/flag', '/todos/1/done']);
  });

  describe('gives up, and so depends on the whole state, when', () => {
    const shout = defineDirective({
      name: '$shout',
      schema: z.object({ $shout: z.string() }),
      resolve: (raw, ctx) => getByPath(ctx.stateModel, raw.$shout),
    });

    it.each([
      ['a prop is two-way bound to state', { v: { $bindState: '/user/name' } }],
      ['a prop is two-way bound to an item', { v: { $bindItem: 'title' } }],
      ['a prop has a $-key it does not know', { v: { $future: '/x' } }],
      ['a prop reads the whole state', { v: { $state: '/' } }],
      [
        'a nested value is not understood',
        { v: { $cond: true, $then: { $bindState: '/a' }, $else: 1 } },
      ],
    ])('%s', (_, props) => {
      expect(reads(element(props), '/todos/0')).toBeNull();
    });

    it('a prop is a registered directive', () => {
      const registry = createDirectiveRegistry([shout]);
      expect(
        reads(element({ v: { $shout: '/user/name' } }), undefined, registry),
      ).toBeNull();
      // The same registry changes nothing for props that don't use it.
      expect(
        reads(element({ v: { $state: '/count' } }), undefined, registry),
      ).toEqual(['/count']);
    });

    it.each([
      ['has no path to read', { eq: 1 }],
      ['groups with something other than an array', { $and: { $state: '/a' } }],
      ['is not an object', 5],
    ])('a condition %s', (_, visible) => {
      expect(reads(element({}, visible))).toBeNull();
    });
  });
});

/**
 * The property the renderer relies on: changing state anywhere outside the
 * reported paths cannot change what the element resolves to. A path missing
 * from the answer is exactly a change this catches, because the element would
 * have skipped a write it needed.
 */
describe('collectStateReads is a superset of what resolution reads', () => {
  type Fixture = [name: string, el: UIElement, base?: string];

  const FIXTURES: Fixture[] = [
    [
      'state reads in objects and arrays',
      element({
        a: { $state: '/user/name' },
        b: { style: { color: { $state: '/theme/color' } } },
        c: [{ $state: '/user/tags' }, 'x'],
      }),
    ],
    [
      '$cond with a compared condition',
      element({
        v: {
          $cond: { $state: '/role', eq: { $state: '/admin' } },
          $then: { $state: '/user/name' },
          $else: { $state: '/count' },
        },
      }),
    ],
    [
      '$computed over an object and an item field',
      element({
        v: {
          $computed: 'dump',
          args: { value: [{ $state: '/theme' }, { $item: 'title' }] },
        },
      }),
      '/todos/0',
    ],
    [
      'templates inside and outside a repeat',
      element({ t: { $template: '${title}/${count}/${/user/name}' } }),
      '/todos/1',
    ],
    [
      'templates outside a repeat',
      element({ t: { $template: '${title}/${count}/${/user/name}' } }),
    ],
    [
      'item reads and index',
      element({ a: { $item: '' }, b: { $item: 'tags' }, c: { $index: true } }),
      '/todos/0',
    ],
    [
      'visibility in every shape',
      element(
        { v: 'shown' },
        {
          $or: [
            [{ $state: '/flag' }, { $item: 'done', not: true }],
            {
              $and: [
                { $state: '/count', gt: 2 },
                { $index: true, eq: 0 },
              ],
            },
          ],
        },
      ),
      '/todos/1',
    ],
  ];

  /** Every place a value lives, plus places a new key could appear. */
  function writablePaths(value: unknown, base = ''): string[] {
    if (typeof value !== 'object' || value === null) return [base];
    const children = Object.entries(value).flatMap(([key, child]) =>
      writablePaths(child, `${base}/${key}`),
    );
    const added = ['added', 'title', 'count', 'name', 'color'].map(
      (key) => `${base}/${key}`,
    );
    return [...children, ...added];
  }

  /** A copy of `state` with a different value at `path`. */
  function withChanged(state: unknown, path: string): unknown {
    const copy = structuredClone(state) as Record<string, unknown>;
    const segments = path.split('/').slice(1);
    let target = copy;
    for (const segment of segments.slice(0, -1)) {
      target = target[segment] as Record<string, unknown>;
    }
    target[segments[segments.length - 1]] = 'changed';
    return copy;
  }

  function resolve(el: UIElement, state: unknown, base?: string) {
    const ctx = {
      stateModel: state as Record<string, unknown>,
      repeatItem: base === undefined ? undefined : getByPath(state, base),
      repeatIndex:
        base === undefined ? undefined : Number(base.split('/').pop()),
      repeatBasePath: base,
      functions: FUNCTIONS,
    };
    return {
      props: resolveElementProps(el.props ?? {}, ctx),
      visible: evaluateVisibility(el.visible, ctx),
    };
  }

  function related(a: string, b: string): boolean {
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  }

  /** Paths whose change resolution noticed although `found` didn't name them. */
  function missedChanges(
    el: UIElement,
    found: ReadonlySet<string>,
    base?: string,
  ): string[] {
    const expected = resolve(el, STATE, base);
    return writablePaths(STATE)
      .filter((path) => ![...found].some((read) => related(read, path)))
      .filter((path) => {
        const changed = withChanged(STATE, path);
        const actual = resolve(el, changed, base);
        return JSON.stringify(actual) !== JSON.stringify(expected);
      });
  }

  it.each(FIXTURES)('%s', (_, el, base) => {
    const found = collectStateReads(el, undefined, base);
    expect(found).not.toBeNull();
    expect(missedChanges(el, found!, base)).toEqual([]);
  });

  it('notices when an answer leaves a path out', () => {
    const [, el, base] = FIXTURES[1];
    const found = new Set(collectStateReads(el, undefined, base));
    found.delete('/admin');
    expect(missedChanges(el, found, base)).toEqual(['/admin']);
  });
});
