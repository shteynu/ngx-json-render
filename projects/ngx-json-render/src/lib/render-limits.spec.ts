import {
  Component,
  type Provider,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ActionHandler, Catalog, Spec } from '@json-render/core';
import { z } from 'zod';
import { JrChildren } from './children.component';
import type { RenderLimits, SpecCatalog } from './render-limits';
import { analyseSpecGraph } from './render-limits';
import { JsonRenderer } from './renderer.component';
import { schema } from './schema';
import type { SpecValidationMode } from './spec-validation';
import { checkSpec, formatSpecCheckIssues } from './spec-validation';
import { injectRenderContext } from './tokens';
import type { ComponentRegistry } from './types';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

@Component({
  selector: 'l-box',
  imports: [JrChildren],
  template: `<div class="l-box"><jr-children /></div>`,
})
class LBox {}

@Component({
  selector: 'l-text',
  template: `<span class="l-text">{{ content() }}</span>`,
})
class LText {
  private readonly ctx = injectRenderContext<{ content?: unknown }>();
  readonly content = () => String(this.ctx.props().content ?? '');
}

const REGISTRY: ComponentRegistry = { Box: LBox, Text: LText };

@Component({
  imports: [JsonRenderer],
  template: `
    <json-render
      [spec]="spec()"
      [registry]="registry"
      [validate]="validate()"
      [loading]="loading()"
      [renderLimits]="renderLimits()"
      [catalog]="catalog()"
      [handlers]="handlers"
    />
  `,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly validate = signal<SpecValidationMode>('off');
  readonly loading = signal(false);
  readonly renderLimits = signal<RenderLimits | null>(null);
  readonly catalog = signal<SpecCatalog | null>(null);
  readonly registry = REGISTRY;
  handlers: Record<string, ActionHandler> | undefined = undefined;
}

async function setup(
  spec: Spec | null,
  configure?: (host: Host) => void,
  providers: Provider[] = [],
) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), ...providers],
  });
  const fixture = TestBed.createComponent(Host);
  configure?.(fixture.componentInstance);
  fixture.componentInstance.spec.set(spec);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function count(fixture: ComponentFixture<unknown>, selector: string): number {
  return (fixture.nativeElement as HTMLElement).querySelectorAll(selector)
    .length;
}

function stateService(fixture: ComponentFixture<Host>) {
  return fixture.debugElement.children[0].componentInstance.stateStore as {
    set(path: string, value: unknown): void;
  };
}

/** Let the microtask queue turn — watch handlers dispatch asynchronously. */
async function drain(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

function text(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector),
  ).map((el) => (el.textContent ?? '').trim());
}

/** `a` renders `b`, which renders `a` again. */
const MUTUAL_CYCLE: Spec = {
  root: 'a',
  elements: {
    a: { type: 'Box', props: {}, children: ['b'] },
    b: { type: 'Box', props: {}, children: ['a'] },
  },
} as unknown as Spec;

/** An element that names itself as its own child. */
const SELF_CYCLE: Spec = {
  root: 'a',
  elements: { a: { type: 'Box', props: {}, children: ['a'] } },
} as unknown as Spec;

/** A chain `n` boxes deep, each the only child of the one above it. */
function chain(depth: number): Spec {
  const elements: Record<string, unknown> = {};
  for (let i = 0; i < depth; i++) {
    elements[`e${i}`] = {
      type: 'Box',
      props: {},
      ...(i < depth - 1 ? { children: [`e${i + 1}`] } : {}),
    };
  }
  return { root: 'e0', elements } as unknown as Spec;
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

describe('cycles', () => {
  it('renders a mutually recursive spec instead of overflowing the stack', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Before this guard existed, both of these blew the stack after ~143
    // elements — with `validate="strict"` no help, because the spec was
    // structurally valid: core's validateSpec reports nothing for a cycle.
    const fixture = await setup(MUTUAL_CYCLE);

    // `a` renders, `b` inside it renders, and the second `a` is refused. The
    // cycle is broken where it closes, not by dropping the whole spec.
    expect(count(fixture, '.l-box')).toBe(2);
    warn.mockRestore();
  });

  it('refuses an element that names itself as its own child', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(SELF_CYCLE);

    expect(count(fixture, '.l-box')).toBe(1);
    warn.mockRestore();
  });

  it('names the cycle it broke, tracing the path that closed it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setup(MUTUAL_CYCLE);

    const message = warn.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes('Cycle in the spec'));
    expect(message).toBeDefined();
    expect(message).toContain('a → b → a');
    warn.mockRestore();
  });

  it('breaks the cycle while the spec is still streaming', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // `loading` suppresses the structural check, because a half-arrived spec
    // is meant to be incomplete. It must not suppress this: a stream that
    // delivers a cycle would take the tab down before it could finish.
    const fixture = await setup(MUTUAL_CYCLE, (host) => host.loading.set(true));

    expect(count(fixture, '.l-box')).toBe(2);
    warn.mockRestore();
  });

  it('does not mistake a re-used element for a cycle', async () => {
    // `shared` renders under both `a` and `b`. That is a DAG, not a cycle:
    // nothing is its own ancestor, so everything renders.
    const fixture = await setup({
      root: 'a',
      elements: {
        a: { type: 'Box', props: {}, children: ['shared', 'b'] },
        b: { type: 'Box', props: {}, children: ['shared'] },
        shared: { type: 'Text', props: { content: 'here' } },
      },
    } as unknown as Spec);

    expect(text(fixture, '.l-text')).toEqual(['here', 'here']);
  });

  it('reports a cycle as an issue under warn', () => {
    const check = checkSpec(MUTUAL_CYCLE, 'warn');

    const cycle = check.issues.find((issue) => issue.code === 'cycle');
    expect(cycle?.severity).toBe('error');
    expect(cycle?.elementKey).toBe('a');
    // Core reports nothing here, which is why this package has to.
    expect(check.hasErrors).toBe(true);
  });

  it('refuses a cyclic spec entirely under strict', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(MUTUAL_CYCLE, (host) =>
      host.validate.set('strict'),
    );

    expect(count(fixture, '.l-box')).toBe(0);
    error.mockRestore();
    warn.mockRestore();
  });

  it('draws a recursive tree, which reaches itself but still ends', async () => {
    // The ordinary way to render a comment thread or a file browser: one
    // element repeating over a relative path and rendering itself per item.
    // Each pass reads one level further into the data, so it ends where the
    // data does — the guard must not mistake that for the cycle above.
    const fixture = await setup({
      root: 'node',
      state: {
        tree: [
          { label: 'one', children: [{ label: 'two', children: [] }] },
          { label: 'three', children: [] },
        ],
      },
      elements: {
        node: {
          type: 'Box',
          props: {},
          repeat: { statePath: '/tree' },
          children: ['label', 'kids'],
        },
        label: { type: 'Text', props: { content: { $item: 'label' } } },
        kids: {
          type: 'Box',
          props: {},
          repeat: { statePath: { $item: 'children' } },
          children: ['label', 'kids'],
        },
      },
    } as unknown as Spec);

    expect(text(fixture, '.l-text')).toEqual(['one', 'two', 'three']);
  });

  it('reports no cycle for a tree that descends into its items', () => {
    const check = checkSpec(
      {
        root: 'node',
        elements: {
          node: {
            type: 'Box',
            props: {},
            repeat: { statePath: { $item: 'children' } },
            children: ['node'],
          },
        },
      } as unknown as Spec,
      'warn',
    );

    expect(check.issues.map((issue) => issue.code)).not.toContain('cycle');
  });

  it('still refuses a repeat that re-reads the same array inside itself', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // An absolute statePath reads `/items` again at every level, so this one
    // never runs out of data — the shape a model produces when it means to
    // recurse and reaches for the path it already used.
    const fixture = await setup({
      root: 'node',
      state: { items: [1, 2] },
      elements: {
        node: {
          type: 'Box',
          props: {},
          repeat: { statePath: '/items' },
          children: ['node'],
        },
      },
    } as unknown as Spec);

    // The root box, then one per item — and each of those refuses to open
    // `/items` a second time, because doing so would read no deeper than the
    // pass that is already running.
    expect(count(fixture, '.l-box')).toBe(3);
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes('without reading any deeper'),
      ),
    ).toBe(true);
    warn.mockRestore();
  });

  it('bounds a self-repeating spec by depth, not by permutations of its data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Eight items, each level re-reading the same array. A guard that only
    // asked "have I seen this element at this exact item before" would allow
    // every ordering of the eight and draw tens of thousands of boxes; one
    // that asks whether the pass got anywhere draws nine.
    const fixture = await setup({
      root: 'node',
      state: { items: [1, 2, 3, 4, 5, 6, 7, 8] },
      elements: {
        node: {
          type: 'Box',
          props: {},
          repeat: { statePath: '/items' },
          children: ['node'],
        },
      },
    } as unknown as Spec);

    expect(count(fixture, '.l-box')).toBe(9);
    warn.mockRestore();
  });

  it('finds a cycle no parent reaches', () => {
    // Unreachable today, one edit from reachable — and still a defect.
    const graph = analyseSpecGraph({
      root: 'root',
      elements: {
        root: { type: 'Box', props: {} },
        x: { type: 'Box', props: {}, children: ['y'] },
        y: { type: 'Box', props: {}, children: ['x'] },
      },
    } as unknown as Spec);

    expect(graph.cycles).toContain('x');
  });
});

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

describe('maxDepth', () => {
  it('measures depth from the root, counting the root as one', () => {
    expect(analyseSpecGraph(chain(4)).depth).toBe(4);
    expect(analyseSpecGraph(chain(1)).depth).toBe(1);
  });

  it('renders what fits and drops what is below the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(chain(6), (host) =>
      host.renderLimits.set({ maxDepth: 3 }),
    );

    expect(count(fixture, '.l-box')).toBe(3);
    warn.mockRestore();
  });

  it('applies in every mode, including off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(chain(6), (host) => {
      host.validate.set('off');
      host.renderLimits.set({ maxDepth: 2 });
    });

    // `validate` governs reporting. A cap the app set is a control, and a
    // control that only worked in some modes would not be one.
    expect(count(fixture, '.l-box')).toBe(2);
    warn.mockRestore();
  });

  it('says which element it stopped at', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setup(chain(4), (host) => host.renderLimits.set({ maxDepth: 2 }));

    const message = warn.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes('maxDepth'));
    expect(message).toContain('e0 → e1 → e2');
    warn.mockRestore();
  });

  it('renders the whole spec when it fits', async () => {
    const fixture = await setup(chain(3), (host) =>
      host.renderLimits.set({ maxDepth: 3 }),
    );

    expect(count(fixture, '.l-box')).toBe(3);
  });

  it('refuses a too-deep spec outright under strict', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(chain(6), (host) => {
      host.validate.set('strict');
      host.renderLimits.set({ maxDepth: 3 });
    });

    // Truncating a hostile spec still draws three levels of it. Strict is how
    // an app says it would rather draw none.
    expect(count(fixture, '.l-box')).toBe(0);
    error.mockRestore();
    warn.mockRestore();
  });

  it('reports the depth it found and the cap it passed', () => {
    const check = checkSpec(chain(9), 'warn', { limits: { maxDepth: 4 } });

    const issue = check.issues.find((entry) => entry.code === 'too_deep');
    expect(issue?.message).toContain('9 levels deep');
    expect(issue?.message).toContain('limit of 4');
  });
});

// ---------------------------------------------------------------------------
// Element count
// ---------------------------------------------------------------------------

describe('maxElements', () => {
  it('renders nothing when the spec is over the cap, in any mode', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fixture = await setup(chain(5), (host) =>
      host.renderLimits.set({ maxElements: 4 }),
    );

    // There is no meaningful "first four elements" of a graph, so the whole
    // spec is refused rather than partly drawn.
    expect(count(fixture, '.l-box')).toBe(0);
    error.mockRestore();
  });

  it('renders normally when the spec fits', async () => {
    const fixture = await setup(chain(4), (host) =>
      host.renderLimits.set({ maxElements: 4 }),
    );

    expect(count(fixture, '.l-box')).toBe(4);
  });

  it('reports the count, the cap, and that nothing rendered', () => {
    const check = checkSpec(chain(5), 'off', { limits: { maxElements: 2 } });

    expect(check.blocked).toBe(true);
    expect(check.hasErrors).toBe(true);
    const issue = check.issues.find(
      (entry) => entry.code === 'too_many_elements',
    );
    expect(issue?.message).toContain('5 elements');
    expect(issue?.message).toContain('limit of 2');
  });

  it('does not run the recursive checks on a spec it has already refused', () => {
    // The count is the cheapest cap there is, and it runs first precisely so
    // an oversized spec is never handed to a check that walks it.
    const check = checkSpec(chain(200_000), 'strict', {
      limits: { maxElements: 500 },
    });

    expect(check.blocked).toBe(true);
    expect(check.issues.map((issue) => issue.code)).toEqual([
      'too_many_elements',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Repeat expansion
// ---------------------------------------------------------------------------

describe('maxRepeatItems', () => {
  const LIST: Spec = {
    root: 'list',
    state: { items: ['a', 'b', 'c', 'd', 'e'] },
    elements: {
      list: {
        type: 'Box',
        props: {},
        repeat: { statePath: '/items' },
        children: ['row'],
      },
      row: { type: 'Text', props: { content: { $item: '' } } },
    },
  } as unknown as Spec;

  it('expands only as many items as the cap allows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(LIST, (host) =>
      host.renderLimits.set({ maxRepeatItems: 2 }),
    );

    expect(count(fixture, '.l-text')).toBe(2);
    warn.mockRestore();
  });

  it('expands everything when no cap is set', async () => {
    const fixture = await setup(LIST);

    expect(count(fixture, '.l-text')).toBe(5);
  });

  it('says how many items it held back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setup(LIST, (host) => host.renderLimits.set({ maxRepeatItems: 2 }));

    const message = warn.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes('maxRepeatItems'));
    expect(message).toContain('holds 5 items');
    expect(message).toContain('3 of them do not render');
    warn.mockRestore();
  });

  it('is invisible to checkSpec, which cannot see the state array', () => {
    // The array is state, not spec: nothing about reading the spec predicts
    // how long it will be at the moment the repeat expands.
    const check = checkSpec(LIST, 'warn', { limits: { maxRepeatItems: 1 } });

    expect(check.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe('catalog checking', () => {
  const CATALOG: SpecCatalog = {
    componentNames: ['Box', 'Text'],
    validate: () => ({ success: true }),
  };

  const REJECTS_PROPS: SpecCatalog = {
    componentNames: ['Box', 'Text'],
    validate: () => ({
      success: false,
      error: {
        issues: [
          {
            path: ['elements', 'label', 'props', 'content'],
            message: 'Expected string, received number',
          },
        ],
      },
    }),
  };

  const UNKNOWN_TYPE: Spec = {
    root: 'root',
    elements: {
      root: { type: 'Box', props: {}, children: ['odd'] },
      odd: { type: 'Carousel', props: {} },
    },
  } as unknown as Spec;

  const FINE: Spec = {
    root: 'root',
    elements: {
      root: { type: 'Box', props: {}, children: ['label'] },
      label: { type: 'Text', props: { content: 'hi' } },
    },
  } as unknown as Spec;

  it('accepts a real catalog where the renderer asks for one', () => {
    // A compile-time check with no runtime meaning: `SpecCatalog` is a
    // structural subset of core's `Catalog`, so an app can pass the catalog it
    // already has without a cast. If core changes that shape, this stops
    // compiling — which is the point.
    const real = null as unknown as Catalog;
    const asked: SpecCatalog = real;

    expect(asked).toBeNull();
  });

  it('names a component type the catalog does not define', () => {
    const check = checkSpec(UNKNOWN_TYPE, 'warn', { catalog: CATALOG });

    const issue = check.issues.find(
      (entry) => entry.code === 'unknown_component',
    );
    expect(issue?.elementKey).toBe('odd');
    expect(issue?.message).toContain('Carousel');
  });

  it('refuses a spec naming an unknown component under strict', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await setup(UNKNOWN_TYPE, (host) => {
      host.validate.set('strict');
      host.catalog.set(CATALOG);
    });

    // Without the catalog this same spec renders a box and warns about one
    // missing type. Structure alone cannot tell the two apart.
    expect(count(fixture, '.l-box')).toBe(0);
    error.mockRestore();
    warn.mockRestore();
  });

  it('reports props the catalog schema rejected, against the right element', () => {
    const check = checkSpec(FINE, 'warn', { catalog: REJECTS_PROPS });

    const issue = check.issues.find((entry) => entry.code === 'invalid_props');
    expect(issue?.elementKey).toBe('label');
    expect(issue?.message).toContain('Expected string, received number');
  });

  it('skips the schema passes while a component type is unknown', () => {
    // The unknown type is the finding. The spec schema would only restate it,
    // and no props schema can be picked for an element whose type has none.
    const check = checkSpec(UNKNOWN_TYPE, 'warn', { catalog: REJECTS_PROPS });

    expect(check.issues.map((issue) => issue.code)).not.toContain(
      'invalid_props',
    );
  });

  it('survives a schema error it cannot read', () => {
    // Read defensively rather than typed against the schema library: a
    // renderer that threw while explaining a bad spec would be the worse
    // failure.
    const oddShape: SpecCatalog = {
      componentNames: ['Box', 'Text'],
      validate: () => ({ success: false, error: 'not the shape expected' }),
    };
    const check = checkSpec(FINE, 'warn', { catalog: oddShape });

    expect(check.issues).toEqual([]);
  });

  it('reads each reported issue defensively', () => {
    const oddIssues: SpecCatalog = {
      componentNames: ['Box', 'Text'],
      validate: () => ({
        success: false,
        error: { issues: [null, { path: 'label', message: 7 }] },
      }),
    };
    const check = checkSpec(FINE, 'warn', { catalog: oddIssues });

    expect(check.issues.map((issue) => issue.message)).toEqual([
      'spec: is not valid',
      'spec: is not valid',
    ]);
  });

  it('counts a spec schema that throws as a rejection, not a crash', () => {
    for (const thrown of [new RangeError('too deep'), 'not an Error']) {
      const throwing: SpecCatalog = {
        componentNames: ['Box', 'Text'],
        validate: () => {
          throw thrown;
        },
      };
      const check = checkSpec(FINE, 'warn', { catalog: throwing });

      expect(check.issues).toEqual([
        {
          severity: 'error',
          code: 'invalid_props',
          message: expect.stringMatching(
            /^spec: the catalog schema threw instead of answering( \(RangeError: too deep\))?, so this counts as rejected$/,
          ),
        },
      ]);
    }
  });

  it('reads a catalog’s data defensively', () => {
    // `data` is typed `unknown`, so anything can arrive in it. Where it holds
    // no schema to call for an element's type, those props are left to
    // `validate`, as they were before `data` was read at all.
    for (const data of [
      'nonsense',
      { components: null },
      { components: {} },
      { components: { Box: null, Text: { props: 'not a schema' } } },
    ]) {
      const catalog: SpecCatalog = { ...REJECTS_PROPS, data };
      const check = checkSpec(FINE, 'warn', { catalog });

      expect(check.issues.map((issue) => issue.message)).toEqual([
        'elements.label.props.content: Expected string, received number',
      ]);
    }
  });

  it('is not consulted while validation is off', () => {
    const check = checkSpec(UNKNOWN_TYPE, 'off', { catalog: CATALOG });

    expect(check.issues).toEqual([]);
  });

  describe('built by schema.createCatalog', () => {
    // The stubs above decide what `validate` returns, so they prove how a
    // rejection is reported, never what a real catalog's schema rejects.
    const Box = {
      props: z.object({}),
      slots: ['default'],
      description: 'A container',
    };
    const Text = {
      props: z.object({ content: z.string() }),
      slots: [],
      description: 'A line of text',
    };
    const Heading = {
      props: z.object({
        content: z.string(),
        level: z.number().min(1).max(3).optional(),
      }),
      slots: [],
      description: 'A section heading',
    };
    const Table = {
      props: z.object({ rows: z.array(z.object({ label: z.string() })) }),
      slots: [],
      description: 'Rows of labels',
    };

    const SEVERAL = schema.createCatalog({
      components: { Box, Text, Heading, Table },
      actions: {},
    });

    /** A spec of one childless element — `children` is still required. */
    const only = (type: string, props: unknown) =>
      ({
        root: 'title',
        elements: { title: { type, props, children: [] } },
      }) as unknown as Spec;

    const BAD_HEADING = only('Heading', { content: 42, level: 9 });

    const found = (spec: Spec, catalog: SpecCatalog) =>
      checkSpec(spec, 'warn', { catalog }).issues.map((issue) => [
        issue.code,
        issue.elementKey,
        issue.message,
      ]);

    it('reports props the schema rejects, with one component', () => {
      // With one component core checks the props itself. They are still
      // reported once.
      const catalog = schema.createCatalog({
        components: { Heading },
        actions: {},
      });

      expect(found(BAD_HEADING, catalog)).toEqual([
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.content:'),
        ],
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.level:'),
        ],
      ]);
    });

    it('reports props the schema rejects, with several components', () => {
      // Every catalog worth rendering has more than one component, and core's
      // spec schema only checks props against a component's schema when there
      // is exactly one: with more, each element's props are an open record.
      expect(found(BAD_HEADING, SEVERAL)).toEqual([
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.content:'),
        ],
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.level:'),
        ],
      ]);
    });

    it('leaves props written as expressions to render time', () => {
      // Core resolves each of these before the component sees it, so what the
      // schema would reject is not what renders. A `$` key core does not know
      // is left alone as well: directives are `$`-prefixed.
      const bound = {
        root: 'root',
        state: { title: 'Hi', big: true, rows: [] },
        elements: {
          root: {
            type: 'Box',
            props: {},
            children: ['title', 'fed', 'mixed'],
          },
          title: {
            type: 'Heading',
            props: {
              content: { $bindState: '/title' },
              level: { $cond: { $state: '/big' }, $then: 1, $else: 2 },
            },
            children: [],
          },
          fed: {
            type: 'Table',
            props: { rows: { $state: '/rows' } },
            children: [],
          },
          mixed: {
            type: 'Table',
            props: {
              rows: [
                { label: { $template: 'Hello, ${/title}!' } },
                { label: { $format: 'date', value: '/today' } },
              ],
            },
            children: [],
          },
        },
      } as unknown as Spec;

      expect(found(bound, SEVERAL)).toEqual([]);
    });

    it('does not pass on what core says about expressions, with one component', () => {
      // Core's own check of a one-component catalog runs the props schema over
      // the spec as written, and rejects every expression in it.
      const catalog = schema.createCatalog({
        components: { Heading },
        actions: {},
      });

      expect(
        found(only('Heading', { content: { $state: '/title' } }), catalog),
      ).toEqual([]);
    });

    it('reports a literal beside an expression, at its full path', () => {
      const spec = only('Table', {
        rows: [{ label: { $item: 'name' } }, { label: 7 }],
      });

      expect(found(spec, SEVERAL)).toEqual([
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.rows.1.label:'),
        ],
      ]);
    });

    it('leaves a value holding an expression alone, and judges one without', () => {
      // A union reports at the value it could not match, not inside it, so an
      // expression in `text` would otherwise surface as a rejected `label`.
      const Badge = {
        props: z.object({
          label: z.union([z.string(), z.object({ text: z.string() })]),
        }),
        slots: [],
        description: 'A label, plain or rich',
      };
      const catalog = schema.createCatalog({
        components: { Text, Badge },
        actions: {},
      });

      expect(
        found(only('Badge', { label: { text: { $state: '/t' } } }), catalog),
      ).toEqual([]);
      expect(found(only('Badge', { label: { text: 5 } }), catalog)).toEqual([
        ['invalid_props', 'title', 'elements.title.props.label: Invalid input'],
      ]);
    });

    it('keeps what the spec schema says about an element beyond its props', () => {
      const spec = {
        root: 'title',
        elements: { title: { type: 'Heading', props: { content: 42 } } },
      } as unknown as Spec;

      expect(found(spec, SEVERAL)).toEqual([
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.children:'),
        ],
        [
          'invalid_props',
          'title',
          expect.stringContaining('elements.title.props.content:'),
        ],
      ]);
    });

    it('stops at twenty issues, however many props fail', () => {
      // A hostile spec fails in as many places as it has props. It is refused
      // either way, and twenty is plenty to act on — so the last element read
      // is cut off part-way through its own issues.
      const elements: Record<string, unknown> = {
        h0: {
          type: 'Heading',
          props: { content: 'fine', level: 9 },
          children: [],
        },
      };
      for (let i = 1; i < 30; i++) {
        elements[`h${i}`] = {
          type: 'Heading',
          props: { content: i, level: 9 },
          children: [],
        };
      }
      const check = checkSpec(
        { root: 'h0', elements } as unknown as Spec,
        'warn',
        { catalog: SEVERAL },
      );

      expect(check.issues).toHaveLength(20);
      expect(check.issues.at(-1)?.message).toContain(
        'elements.h10.props.content:',
      );
    });

    it('counts a props schema that throws as a rejection, not a crash', () => {
      // Real ones do: `ValidationConfigSchema`, behind every Material input's
      // `validation`, overflows the stack a thousand `$and`s deep. This one
      // throws on purpose, so the test does not depend on the stack size.
      const Fragile = {
        props: z.object({}).superRefine(() => {
          throw new RangeError('Maximum call stack size exceeded');
        }),
        slots: [],
        description: 'Throws on every check',
      };
      const catalog = schema.createCatalog({
        components: { Text, Fragile },
        actions: {},
      });

      expect(found(only('Fragile', {}), catalog)).toEqual([
        [
          'invalid_props',
          'title',
          'elements.title.props: the "Fragile" schema threw instead of answering (RangeError: Maximum call stack size exceeded), so this counts as rejected',
        ],
      ]);
    });

    it('walks props too deep to recurse over, and props holding themselves', () => {
      // Whether a rejected value holds an expression is found by walking it. A
      // recursive walk would overflow on the first and never end on the second.
      let deep: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 20_000; i++) deep = { next: deep };
      const loop: Record<string, unknown> = {};
      loop['self'] = loop;

      for (const content of [deep, loop]) {
        const keys = found(only('Heading', { content }), SEVERAL).map(
          ([, key]) => key,
        );
        expect(keys).toEqual(['title']);
      }
    });

    it('refuses a spec whose props the catalog rejects under strict', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const labelled = (content: unknown) =>
        ({
          root: 'root',
          elements: {
            root: { type: 'Box', props: {}, children: ['label'] },
            label: { type: 'Text', props: { content }, children: [] },
          },
        }) as unknown as Spec;
      const fixture = await setup(labelled(42), (host) => {
        host.validate.set('strict');
        host.catalog.set(SEVERAL);
      });

      expect(count(fixture, '.l-box')).toBe(0);

      fixture.componentInstance.spec.set(labelled('hi'));
      await settle(fixture);
      expect(count(fixture, '.l-text')).toBe(1);
      error.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// The checker's own safety
// ---------------------------------------------------------------------------

describe('checkSpec', () => {
  it('checks a spec far too deep to recurse over', () => {
    // The walk uses an explicit stack: a guard that overflowed on the specs it
    // exists to catch would be a second way to crash, not a fix for the first.
    const check = checkSpec(chain(20_000), 'strict', {
      limits: { maxDepth: 32 },
    });

    expect(check.issues.map((issue) => issue.code)).toEqual(['too_deep']);
  });

  it('costs one visit per element, not one per path to it', () => {
    // Every element names the next two, so the number of distinct paths from
    // the root doubles at each level. Without memoisation this walk would not
    // finish; with it, 60 elements is 60 visits — and the longest of those
    // paths is the one that steps one at a time, all 60 of them.
    const elements: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) {
      elements[`e${i}`] = {
        type: 'Box',
        props: {},
        children: [`e${i + 1}`, `e${i + 2}`].filter(
          (key) => +key.slice(1) < 60,
        ),
      };
    }

    const started = Date.now();
    const graph = analyseSpecGraph({
      root: 'e0',
      elements,
    } as unknown as Spec);

    expect(graph.depth).toBe(60);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('leaves a spec alone when nothing is asked of it', () => {
    const check = checkSpec(MUTUAL_CYCLE, 'off');

    // Off plus no limits is the default, and it stays exactly as cheap as it
    // was: the cycle is still broken as the tree renders, not here.
    expect(check.spec).toBe(MUTUAL_CYCLE);
    expect(check.issues).toEqual([]);
    expect(check.blocked).toBe(false);
  });

  it('formats errors and warnings alike, naming the element', () => {
    const formatted = formatSpecCheckIssues([
      { severity: 'error', code: 'cycle', elementKey: 'a', message: 'loops' },
      { severity: 'warning', code: 'orphaned_element', message: 'unused' },
    ]);

    expect(formatted).toContain('[a] loops');
    expect(formatted).toContain('warning');
  });
});

// ---------------------------------------------------------------------------
// A refused element does not act either
// ---------------------------------------------------------------------------

describe('what a refused element still does', () => {
  /**
   * `deep` sits one level past a cap of 1, and watches `/country`. `watch` is
   * the one thing an element does without being on screen.
   */
  const WATCHER: Spec = {
    root: 'root',
    state: { country: '' },
    elements: {
      root: { type: 'Box', props: {}, children: ['deep'] },
      deep: {
        type: 'Box',
        props: {},
        watch: {
          '/country': {
            action: 'loadCities',
            params: { country: { $state: '/country' } },
          },
        },
      },
    },
  } as unknown as Spec;

  it('fires a watch when the element renders', async () => {
    const received: unknown[] = [];
    const fixture = await setup(WATCHER, (host) => {
      host.handlers = {
        loadCities: (params) => {
          received.push(params);
        },
      };
    });

    stateService(fixture).set('/country', 'DE');
    await settle(fixture);
    await drain();

    // The control: without a cap the watch is wired, so the assertion below
    // is about the cap rather than about a spec that never worked.
    expect(received).toEqual([{ country: 'DE' }]);
  });

  it('does not fire a watch on an element the depth cap refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received: unknown[] = [];
    const fixture = await setup(WATCHER, (host) => {
      host.renderLimits.set({ maxDepth: 1 });
      host.handlers = {
        loadCities: (params) => {
          received.push(params);
        },
      };
    });

    stateService(fixture).set('/country', 'DE');
    await settle(fixture);
    await drain();

    // Drawing nothing while still dispatching actions would leave the cap
    // stopping only the half of the element that is visible.
    expect(received).toEqual([]);
    expect(count(fixture, '.l-box')).toBe(1);
    warn.mockRestore();
  });

  it('does not fire a watch on the element that closes a cycle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received: unknown[] = [];
    const fixture = await setup(
      {
        root: 'a',
        state: { country: '' },
        elements: {
          a: {
            type: 'Box',
            props: {},
            children: ['a'],
            watch: { '/country': { action: 'loadCities' } },
          },
        },
      } as unknown as Spec,
      (host) => {
        host.handlers = {
          loadCities: () => {
            received.push(true);
          },
        };
      },
    );

    stateService(fixture).set('/country', 'DE');
    await settle(fixture);
    await drain();

    // `a` renders once and watches once. The refused second `a` does neither.
    expect(received).toEqual([true]);
    warn.mockRestore();
  });

  it('wires the watch again if the cap is lifted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received: unknown[] = [];
    const fixture = await setup(WATCHER, (host) => {
      host.renderLimits.set({ maxDepth: 1 });
      host.handlers = {
        loadCities: (params) => {
          received.push(params);
        },
      };
    });

    fixture.componentInstance.renderLimits.set({ maxDepth: 2 });
    await settle(fixture);
    stateService(fixture).set('/country', 'DE');
    await settle(fixture);
    await drain();

    // The effect reads `refusal()`, so a refusal that lifts re-wires rather
    // than leaving the element inert for the rest of its life.
    expect(received).toEqual([{ country: 'DE' }]);
    warn.mockRestore();
  });
});
