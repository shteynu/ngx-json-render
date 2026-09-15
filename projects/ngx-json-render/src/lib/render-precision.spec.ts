import {
  Component,
  ElementRef,
  effect,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type ComputedFunction,
  type DirectiveDefinition,
  type Spec,
  type StateModel,
  type StateStore,
  defineDirective,
  getByPath,
} from '@json-render/core';
import { z } from 'zod';
import { JrChildren } from './children.component';
import { JsonRenderer } from './renderer.component';
import { applyPatch } from './streaming/patch';
import { injectElementKey, injectRenderContext } from './tokens';
import type { ComponentRegistry } from './types';

/**
 * How many times each catalog template ran, by element key (repeat items
 * share a key, so they are told apart by what they render).
 */
let runs: Record<string, number> = {};

function countRun(key: string): string {
  runs[key] = (runs[key] ?? 0) + 1;
  return '';
}

@Component({
  selector: 'p-text',
  template: `{{ tick() }}<span class="p-text">{{ ctx.props().content }}</span>`,
})
class PText {
  readonly ctx = injectRenderContext<{ content?: unknown }>();
  private readonly key = injectElementKey();
  tick(): string {
    return countRun(`${this.key()}:${String(this.ctx.props().content)}`);
  }
}

@Component({
  selector: 'p-box',
  imports: [JrChildren],
  template: `{{ tick() }}<div class="p-box"><jr-children /></div>`,
})
class PBox {
  private readonly ctx = injectRenderContext();
  private readonly key = injectElementKey();
  tick(): string {
    // Read props like any real component would, so a new props object counts.
    this.ctx.props();
    return countRun(this.key());
  }
}

/** Renders an array prop itself, so an in-place mutation has to reach it. */
@Component({
  selector: 'p-list',
  template: `{{ tick() }}
    <ul>
      @for (item of ctx.props().items ?? []; track $index) {
        <li class="p-item">{{ item }}</li>
      }
    </ul>`,
})
class PList {
  readonly ctx = injectRenderContext<{ items?: string[] }>();
  private readonly key = injectElementKey();
  tick(): string {
    return countRun(this.key());
  }
}

/**
 * A text input synced the way the README recommends: an effect writes the
 * prop into the DOM, because a `[value]` binding would skip a value that
 * returns to the one it last applied.
 */
@Component({
  selector: 'p-input',
  template: `{{ tick() }}<input #el class="p-input" (input)="onInput($event)" />`,
})
class PInput {
  readonly ctx = injectRenderContext<{ value?: string }>();
  private readonly key = injectElementKey();
  private readonly el = viewChild.required<ElementRef<HTMLInputElement>>('el');

  constructor() {
    effect(() => {
      const value = String(this.ctx.props().value ?? '');
      const input = this.el().nativeElement;
      if (input.value !== value) input.value = value;
    });
  }

  tick(): string {
    this.ctx.props();
    return countRun(this.key());
  }

  onInput(event: Event): void {
    this.ctx.setBound('value', (event.target as HTMLInputElement).value);
  }
}

const REGISTRY: ComponentRegistry = {
  Text: PText,
  Box: PBox,
  List: PList,
  Input: PInput,
};

/**
 * How many times each `$computed` function ran, by the label it was given.
 * A function runs once per resolution of the prop that calls it, so this is
 * the count of resolutions the render counters above cannot see: resolving
 * props to the same values runs no template.
 */
let calls: Record<string, number> = {};

const FUNCTIONS: Record<string, ComputedFunction> = {
  tag: (args) => {
    const label = String(args['label']);
    calls[label] = (calls[label] ?? 0) + 1;
    return label;
  },
};

@Component({
  imports: [JsonRenderer],
  template: `<json-render
    [spec]="spec()"
    [registry]="registry"
    [store]="store()"
    [functions]="functions"
    [directives]="directives()"
  />`,
})
class Host {
  readonly spec = signal<Spec | null>(null);
  readonly store = signal<StateStore | null>(null);
  readonly directives = signal<DirectiveDefinition[] | undefined>(undefined);
  readonly registry = REGISTRY;
  readonly functions = FUNCTIONS;
}

const SPEC: Spec = {
  root: 'card',
  state: { user: { name: 'Ada' }, todos: [{ title: 'one' }] },
  elements: {
    card: { type: 'Box', props: {}, children: ['static', 'name', 'todos'] },
    static: { type: 'Text', props: { content: 'Profile' } },
    name: { type: 'Text', props: { content: { $state: '/user/name' } } },
    todos: {
      type: 'Box',
      props: {},
      repeat: { statePath: '/todos' },
      children: ['todo'],
    },
    todo: { type: 'Text', props: { content: { $item: 'title' } } },
  },
};

async function settle(fixture: ComponentFixture<unknown>) {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

async function setup(
  spec: Spec,
  store: StateStore | null = null,
  directives?: DirectiveDefinition[],
) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.store.set(store);
  fixture.componentInstance.directives.set(directives);
  fixture.componentInstance.spec.set(spec);
  await settle(fixture);
  runs = {};
  calls = {};
  const state = fixture.debugElement.children[0].componentInstance
    .stateStore as {
    set(path: string, value: unknown): void;
    update(updates: Record<string, unknown>): void;
  };
  return { fixture, state };
}

function texts(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector),
  ).map((el) => (el.textContent ?? '').trim());
}

/**
 * An external store that writes into its snapshot in place and keeps the
 * same object — the case the renderer must not mistake for "nothing changed".
 */
function mutatingStore(initial: StateModel): StateStore {
  const state = initial;
  const listeners = new Set<() => void>();
  const write = (path: string, value: unknown) => {
    const segments = path.split('/').slice(1);
    let target = state as Record<string, unknown>;
    for (const segment of segments.slice(0, -1)) {
      target = target[segment] as Record<string, unknown>;
    }
    target[segments[segments.length - 1]] = value;
  };
  return {
    get: (path) => getByPath(state, path),
    set: (path, value) => {
      write(path, value);
      listeners.forEach((l) => l());
    },
    update: (updates) => {
      for (const [path, value] of Object.entries(updates)) write(path, value);
      listeners.forEach((l) => l());
    },
    getSnapshot: () => state,
    getServerSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('what a data change re-renders', () => {
  it('a state write re-runs only the template that reads the path', async () => {
    const { fixture, state } = await setup(SPEC);

    state.set('/user/name', 'Grace');
    await settle(fixture);

    expect(texts(fixture, '.p-text')).toEqual(['Profile', 'Grace', 'one']);
    expect(runs).toEqual({ 'name:Grace': 1 });
  });

  it('writing the value a path already holds re-runs nothing', async () => {
    const { fixture, state } = await setup(SPEC);

    state.set('/user/name', 'Ada');
    await settle(fixture);

    expect(runs).toEqual({});
  });

  it('appending to a repeated array creates the new item and touches no other', async () => {
    const { fixture, state } = await setup(SPEC);

    state.set('/todos', [{ title: 'one' }, { title: 'two' }]);
    await settle(fixture);

    expect(texts(fixture, '.p-text')).toEqual(['Profile', 'Ada', 'one', 'two']);
    // The existing item keeps its view: its item object is the same one.
    expect(runs['static:Profile']).toBeUndefined();
    expect(runs['todos']).toBeUndefined();
    expect(runs['todo:one']).toBeUndefined();
    expect(runs['name:Ada']).toBeUndefined();
    expect(runs['todo:two']).toBe(1);
  });

  it('a streamed patch to one prop re-runs only that element', async () => {
    const { fixture } = await setup(SPEC);

    const next = applyPatch(fixture.componentInstance.spec()!, {
      op: 'replace',
      path: '/elements/static/props/content',
      value: 'Account',
    });
    fixture.componentInstance.spec.set(next);
    await settle(fixture);

    expect(runs).toEqual({ 'static:Account': 1 });
  });
});

describe('two-way bound elements', () => {
  const FORM_SPEC: Spec = {
    root: 'form',
    state: { draft: '', count: 0 },
    elements: {
      form: { type: 'Box', props: {}, children: ['draft', 'count'] },
      draft: { type: 'Input', props: { value: { $bindState: '/draft' } } },
      count: { type: 'Text', props: { content: { $state: '/count' } } },
    },
  };

  it('re-assert the DOM when state returns to the value they last saw', async () => {
    const { fixture, state } = await setup(FORM_SPEC);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.p-input',
    ) as HTMLInputElement;

    // The user types and the form is cleared before change detection runs
    // in between (pushState with clearStatePath does exactly this), so the
    // resolved prop goes '' -> 'milk' -> '' without anyone reading 'milk'.
    input.value = 'milk';
    input.dispatchEvent(new Event('input'));
    state.set('/draft', '');
    await settle(fixture);

    expect(input.value).toBe('');
  });

  it('do not make the unbound elements around them re-run', async () => {
    const { fixture, state } = await setup(FORM_SPEC);
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.p-input',
    ) as HTMLInputElement;

    input.value = 'milk';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    // `form` is left out on purpose: a DOM event marks every ancestor of the
    // listening view dirty, whatever the renderer does.
    expect(runs['draft']).toBe(1);
    expect(runs['count:0']).toBeUndefined();
  });
});

describe('what a data change re-renders with an external store', () => {
  const LIST_SPEC: Spec = {
    root: 'card',
    elements: {
      card: { type: 'Box', props: {}, children: ['name', 'list'] },
      name: { type: 'Text', props: { content: { $state: '/user/name' } } },
      list: { type: 'List', props: { items: { $state: '/items' } } },
    },
  };

  it('a primitive change re-runs only the template that reads it', async () => {
    const store = mutatingStore({ user: { name: 'Ada' }, items: ['a'] });
    const { fixture } = await setup(LIST_SPEC, store);

    store.set('/user/name', 'Grace');
    await settle(fixture);

    expect(texts(fixture, '.p-text')).toEqual(['Grace']);
    expect(runs['name:Grace']).toBe(1);
    expect(runs['card']).toBeUndefined();
  });

  it('an array mutated in place still reaches the component that renders it', async () => {
    const items = ['a'];
    const store = mutatingStore({ user: { name: 'Ada' }, items });
    const { fixture } = await setup(LIST_SPEC, store);

    items.push('b');
    store.set('/items', items);
    await settle(fixture);

    expect(texts(fixture, '.p-item')).toEqual(['a', 'b']);
  });
});

describe('what a data change resolves', () => {
  const tag = (label: unknown) => ({ $computed: 'tag', args: { label } });

  const RESOLVE_SPEC: Spec = {
    root: 'card',
    state: {
      user: { name: 'Ada', email: 'ada@example.com' },
      flag: true,
      todos: [{ title: 'one' }],
    },
    elements: {
      card: {
        type: 'Box',
        props: {},
        children: ['name', 'email', 'either', 'shown', 'todos'],
      },
      name: { type: 'Text', props: { content: tag({ $state: '/user/name' }) } },
      email: {
        type: 'Text',
        props: { content: tag({ $state: '/user/email' }) },
      },
      either: {
        type: 'Text',
        props: {
          content: {
            $cond: { $state: '/flag' },
            $then: { $state: '/user/name' },
            $else: { $state: '/user/email' },
          },
        },
      },
      shown: {
        type: 'Text',
        props: { content: 'flagged' },
        visible: { $state: '/flag' },
      },
      todos: {
        type: 'Box',
        props: {},
        repeat: { statePath: '/todos' },
        children: ['todo', 'byline'],
      },
      todo: { type: 'Text', props: { content: tag({ $item: 'title' }) } },
      byline: {
        type: 'Text',
        props: { content: { $template: '${title} for ${/user/name}' } },
      },
    },
  };

  it('a write resolves only the elements that read its path', async () => {
    const { fixture, state } = await setup(RESOLVE_SPEC);

    state.set('/user/name', 'Grace');
    await settle(fixture);

    expect(calls).toEqual({ Grace: 1 });
    expect(texts(fixture, '.p-text')).toEqual([
      'Grace',
      'ada@example.com',
      'Grace',
      'flagged',
      'one',
      'one for Grace',
    ]);
  });

  it('a write to a path nobody reads resolves nothing', async () => {
    const { fixture, state } = await setup(RESOLVE_SPEC);

    state.set('/unrelated', 1);
    await settle(fixture);

    expect(calls).toEqual({});
    expect(runs).toEqual({});
  });

  it('$cond follows the branch its condition now selects', async () => {
    const { fixture, state } = await setup(RESOLVE_SPEC);

    state.set('/flag', false);
    await settle(fixture);
    expect(texts(fixture, '.p-text')).toEqual([
      'Ada',
      'ada@example.com',
      'ada@example.com',
      'one',
      'one for Ada',
    ]);

    state.set('/user/email', 'grace@example.com');
    await settle(fixture);
    expect(texts(fixture, '.p-text')[2]).toBe('grace@example.com');
  });

  it('an item field written by path reaches the item that shows it', async () => {
    const { fixture, state } = await setup(RESOLVE_SPEC);

    state.set('/todos/0/title', 'uno');
    await settle(fixture);

    expect(calls).toEqual({ uno: 1 });
    expect(texts(fixture, '.p-text').slice(-2)).toEqual(['uno', 'uno for Ada']);
  });

  it('an element reading a whole object resolves when a field inside it changes', async () => {
    const { fixture, state } = await setup({
      root: 'user',
      state: { user: { name: 'Ada', email: 'ada@example.com' } },
      elements: {
        user: {
          type: 'Text',
          props: { content: tag({ $state: '/user' }) },
        },
      },
    });

    state.set('/user/email', 'ada@example.org');
    await settle(fixture);

    expect(calls).toEqual({ '[object Object]': 1 });
  });

  it('an in-place item mutation from an external store still reaches the item', async () => {
    const todos = [{ title: 'one' }];
    const store = mutatingStore({ todos });
    const { fixture } = await setup(
      {
        root: 'todos',
        elements: {
          todos: {
            type: 'Box',
            props: {},
            repeat: { statePath: '/todos' },
            children: ['todo'],
          },
          todo: { type: 'Text', props: { content: { $item: 'title' } } },
        },
      },
      store,
    );

    store.set('/todos/0/title', 'uno');
    await settle(fixture);

    expect(texts(fixture, '.p-text')).toEqual(['uno']);
  });

  it('a directive keeps resolving on every write, since it may read any path', async () => {
    const shout = defineDirective({
      name: '$shout',
      schema: z.object({ $shout: z.string() }),
      resolve: (raw, ctx) =>
        String(getByPath(ctx.stateModel, raw.$shout)).toUpperCase(),
    });
    const { fixture, state } = await setup(
      {
        root: 'card',
        state: { word: 'hi', other: 0 },
        elements: {
          card: { type: 'Box', props: {}, children: ['loud', 'count'] },
          loud: { type: 'Text', props: { content: { $shout: '/word' } } },
          count: {
            type: 'Text',
            props: { content: tag({ $state: '/other' }) },
          },
        },
      },
      null,
      [shout],
    );

    state.set('/word', 'hey');
    await settle(fixture);

    expect(texts(fixture, '.p-text')).toEqual(['HEY', '0']);
    expect(calls).toEqual({});
  });
});
